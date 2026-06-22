import { lazy, Suspense } from "react";

const LOAD_DIRECT_UPDATE_BANNER =
  import.meta.env.VITE_ANDROID_DISTRIBUTION_CHANNEL !== "store";

const AndroidUpdateBannerDirect = LOAD_DIRECT_UPDATE_BANNER
  ? lazy(() => import("./AndroidUpdateBannerDirect"))
  : null;

export default function AndroidUpdateBanner() {
  if (!AndroidUpdateBannerDirect) return null;

  return (
    <Suspense fallback={null}>
      <AndroidUpdateBannerDirect />
    </Suspense>
  );
}
