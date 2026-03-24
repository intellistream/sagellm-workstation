import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { recordApiRequest } from "@/lib/metrics";

export const runtime = "nodejs";

type EvoChatRequest = {
  prompt?: string;
  model?: string;
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function cleanOutput(raw: string): string {
  return raw.replace(ANSI_PATTERN, "").replace(/\r/g, "").trim();
}

function summarizeFailure(raw: string): string {
  const text = cleanOutput(raw);
  if (!text) {
    return "unknown error";
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const keyLines = lines.filter((line) =>
    /(ConnectError|connection error|Failed to connect|Timed out|Error:|RuntimeError|HTTP\s*\d{3})/i.test(line)
  );

  if (keyLines.length > 0) {
    return keyLines.slice(-4).join("\n").slice(0, 2000);
  }

  return lines.slice(-12).join("\n").slice(0, 2000);
}

function resolveTimeoutMs(): number {
  const configured = Number(process.env.WORKSTATION_EVOSCI_TIMEOUT_MS || "180000");
  if (!Number.isFinite(configured) || configured <= 0) {
    return 180000;
  }
  return Math.min(Math.floor(configured), 600000);
}

async function runEvoScientist(prompt: string, model?: string): Promise<{
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string[];
}> {
  const bin = process.env.WORKSTATION_EVOSCI_BIN || "EvoSci";
  const workdir = process.env.WORKSTATION_EVOSCI_WORKDIR || "/home/shuhao/EvoScientist";
  const timeoutMs = resolveTimeoutMs();

  const command = [bin, "-p", prompt, "--ui", "cli", "--no-thinking", "--workdir", workdir];
  // Newer EvoScientist CLI no longer accepts --provider/--model at top level.
  // Keep request compatibility but route provider/model selection to EvoScientist config.
  void model;

  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: workdir,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        CLICOLOR: "0",
        NO_COLOR: "1",
        TERM: "dumb",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = 120000;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < cap) {
        stdout += chunk.toString("utf-8");
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < cap) {
        stderr += chunk.toString("utf-8");
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2500);
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      if (timedOut) {
        resolve({
          durationMs,
          stdout,
          stderr: `${stderr}\nTimed out after ${timeoutMs}ms.`,
          exitCode: code,
          command,
        });
        return;
      }
      resolve({ durationMs, stdout, stderr, exitCode: code, command });
    });
  });
}

export async function POST(req: NextRequest) {
  const start = performance.now();

  try {
    const body = (await req.json()) as EvoChatRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = typeof body.model === "string" ? body.model : undefined;

    if (!prompt) {
      recordApiRequest("/api/evoscientist/chat", "POST", 400, (performance.now() - start) / 1000);
      return Response.json({ error: "prompt 不能为空" }, { status: 400 });
    }

    const result = await runEvoScientist(prompt, model);
    const stdout = cleanOutput(result.stdout);
    const stderr = cleanOutput(result.stderr);

    if (result.exitCode !== 0) {
      recordApiRequest("/api/evoscientist/chat", "POST", 502, (performance.now() - start) / 1000);
      const detail = summarizeFailure(`${stderr}\n${stdout}`);
      return Response.json(
        {
          error: "EvoScientist 执行失败",
          detail,
          exitCode: result.exitCode,
          command: result.command,
        },
        { status: 502 }
      );
    }

    const reply = stdout || "EvoScientist 未返回可显示内容。";
    recordApiRequest("/api/evoscientist/chat", "POST", 200, (performance.now() - start) / 1000);
    return Response.json({
      reply,
      durationMs: result.durationMs,
      command: result.command,
    });
  } catch (error: unknown) {
    recordApiRequest("/api/evoscientist/chat", "POST", 500, (performance.now() - start) / 1000);
    return Response.json(
      {
        error: "EvoScientist 调用异常",
        detail: (error as Error)?.message || "unknown error",
      },
      { status: 500 }
    );
  }
}