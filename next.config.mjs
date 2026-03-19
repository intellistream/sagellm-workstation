/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    VLLM_HUST_BASE_URL: process.env.VLLM_HUST_BASE_URL,
    VLLM_HUST_API_KEY: process.env.VLLM_HUST_API_KEY,
    APP_BRAND_NAME: process.env.APP_BRAND_NAME,
    APP_BRAND_LOGO: process.env.APP_BRAND_LOGO,
    APP_ACCENT_COLOR: process.env.APP_ACCENT_COLOR,
  },
};

export default nextConfig;
