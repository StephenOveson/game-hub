import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The WebSocket server lives in server.ts, attached to the same HTTP
  // server Next runs on — no rewrites or extra ports needed.
  reactStrictMode: true,
};

export default nextConfig;
