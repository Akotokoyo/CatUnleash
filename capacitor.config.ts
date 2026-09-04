import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.catunleashed.game",
  appName: "CatUnleashed",
  webDir: "dist",
  android: {
    backgroundColor: "#071b1b",
    allowMixedContent: false,
  },
};

export default config;
