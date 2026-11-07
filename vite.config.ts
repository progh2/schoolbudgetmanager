/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 상대 경로: 같은 dist/가 GitHub Pages 하위 경로(/<저장소>/)와 BizCoder Pod 루트 둘 다에서 돈다.
// 바꾸면 둘 중 하나가 깨진다 (ARCHITECTURE §7).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
