import { Capacitor } from "@capacitor/core";

export const ANDROID_DISTRIBUTION_CHANNEL =
  import.meta.env.VITE_ANDROID_DISTRIBUTION_CHANNEL?.trim() || "direct";

export const IS_ANDROID_STORE_DISTRIBUTION =
  ANDROID_DISTRIBUTION_CHANNEL === "store";

export function isAndroidStoreBuild() {
  return (
    Capacitor.getPlatform() === "android" && IS_ANDROID_STORE_DISTRIBUTION
  );
}
