import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.econorotas.app",
  appName: "EconoRotas",
  webDir: "dist/public",
  backgroundColor: "#ffffff",
  server: {
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
