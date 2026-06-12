import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    modulePreload: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        xiaowanzi: resolve(__dirname, "index-xiaowanzi.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
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
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        secure: false,
      },
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
