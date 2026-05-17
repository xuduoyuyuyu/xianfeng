import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  base: "/v2/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // wel 后端 API（教育规划等）→ 代理到线上 wel 服务
      "/api/education-plan": {
        target: "https://wel.xinzhi.info",
        changeOrigin: true,
        secure: false,
      },
      "/api/sms": {
        target: "https://wel.xinzhi.info",
        changeOrigin: true,
        secure: false,
      },
      "/api/me": {
        target: "https://wel.xinzhi.info",
        changeOrigin: true,
        secure: false,
      },
      // 话题广场 → 本地 mock（测试用，上线后改为 wel）
      "/api/topic-hub": {
        target: "http://localhost:18889",
        changeOrigin: true,
        secure: false,
      },
      // xianfeng 后端 API
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}));
