"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import clsx from "clsx";

type EvoMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  latencyMs?: number;
  error?: boolean;
};

type EvoResponse = {
  reply: string;
  durationMs: number;
  command: string[];
};

interface AgentLabModalProps {
  open: boolean;
  currentModel: string;
  accentColor: string;
  onClose: () => void;
}

export default function AgentLabModal({
  open,
  currentModel,
  accentColor,
  onClose,
}: AgentLabModalProps) {
  const [prompt, setPrompt] = useState("请设计一个用于评估 vllm-hust 在自动科研场景稳定性的实验计划，给出步骤、指标与判定标准。");
  const [messages, setMessages] = useState<EvoMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const totalTurns = useMemo(
    () => messages.filter((item) => item.role === "assistant").length,
    [messages]
  );

  if (!open) {
    return null;
  }

  const runAgents = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || running) {
      return;
    }

    setRunning(true);
    setError("");
    const userMsg: EvoMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");

    try {
      const res = await fetch("/api/evoscientist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, model: currentModel }),
      });

      const payload = (await res.json()) as EvoResponse | { error?: string; detail?: string };
      if (!res.ok) {
        const detail = "error" in payload && payload.error ? payload.error : `HTTP ${res.status}`;
        throw new Error("detail" in payload && payload.detail ? `${detail}\n${payload.detail}` : detail);
      }
      const result = payload as EvoResponse;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.reply,
          latencyMs: result.durationMs,
        },
      ]);
    } catch (e: unknown) {
      const detail = (e as Error)?.message || "EvoScientist 调用失败";
      setError(detail);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: detail,
          error: true,
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col">
        <div
          className="px-5 py-4 border-b border-white/10 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${accentColor}24 0%, rgba(15,23,42,1) 100%)` }}
        >
          <div>
            <p className="text-white text-base font-semibold">EvoScientist 对话实验室</p>
            <p className="text-white/50 text-xs mt-1">将 EvoScientist 作为科研 Agent 嵌入到工作站</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white/90 transition-colors text-sm"
          >
            关闭
          </button>
        </div>

        <div className="grid grid-cols-12 gap-0 min-h-0 flex-1">
          <section className="col-span-4 border-r border-white/10 p-5 space-y-4 overflow-y-auto">
            <form className="space-y-4" onSubmit={runAgents}>
              <div>
                <label className="block text-white/70 text-xs mb-2 uppercase tracking-wider">研究问题</label>
                <textarea
                  value={prompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 text-white/90 text-sm p-3 focus:outline-none focus:border-white/30"
                  placeholder="输入一个科研任务，例如：比较不同并发配置下 TTFT 与吞吐折中点"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 leading-5">
                <p>当前模型：{currentModel}</p>
                <p>调用方式：workstation → EvoSci CLI → vllm-hust OpenAI 接口</p>
                <p>累计回合：{totalTurns}</p>
              </div>

              {error && <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200 whitespace-pre-wrap">{error}</div>}

              <button
                type="submit"
                disabled={running || !prompt.trim()}
                className={clsx(
                  "w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                  running || !prompt.trim()
                    ? "bg-white/10 text-white/40"
                    : "text-white"
                )}
                style={!running && prompt.trim() ? { background: accentColor } : undefined}
              >
                {running ? "EvoScientist 执行中..." : "发送到 EvoScientist"}
              </button>
            </form>
          </section>

          <section className="col-span-8 p-5 overflow-y-auto space-y-4">
            {messages.length === 0 && !running && (
              <div className="h-full min-h-[360px] flex items-center justify-center text-center text-white/40 text-sm leading-7">
                在左侧输入科研问题，右侧将展示 EvoScientist 的回复
              </div>
            )}

            {messages.map((item) => (
              <article
                key={item.id}
                className={clsx(
                  "rounded-xl border px-4 py-3",
                  item.role === "user"
                    ? "border-cyan-300/25 bg-cyan-300/10"
                    : item.error
                      ? "border-red-400/25 bg-red-400/10"
                      : "border-white/10 bg-white/5"
                )}
              >
                <p className="text-xs uppercase tracking-wider text-white/50 mb-2">
                  {item.role === "user" ? "你" : "EvoScientist"}
                  {item.latencyMs !== undefined ? ` · ${(item.latencyMs / 1000).toFixed(1)}s` : ""}
                </p>
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-6">{item.content}</p>
              </article>
            ))}

            {running && (
              <div className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sky-200 text-sm">
                EvoScientist 正在处理请求，请稍候...
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
