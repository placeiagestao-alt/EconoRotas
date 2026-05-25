import type { CapacitorConfig } from "@capacitor/cli";

const isProductionAndroid = process.env.CAPACITOR_ENV === "android-production";

const config: CapacitorConfig = {
  appId: "com.econorotas.app",
  appName: "EconoRotas",
  webDir: "dist/public",
  backgroundColor: "#ffffff",
  server: {
    androidScheme: isProductionAndroid ? "https" : "http",
    cleartext: !isProductionAndroid,
  },
  android: {
    allowMixedContent: !isProductionAndroid,
  },
};

export default config;
