import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
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
      "/api/topic-hub": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
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
});
