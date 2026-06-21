import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xianfeng.parents",
  appName: "家长先疯",
  webDir: "../../frontend/dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
