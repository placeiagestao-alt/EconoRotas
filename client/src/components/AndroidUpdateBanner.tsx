import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buildApiUrl } from "@/lib/apiBase";

type AndroidUpdateResponse = {
  enabled?: boolean;
  latestVersion?: string;
  apkUrl?: string;
  required?: boolean;
  minimumSupportedVersion?: string;
  message?: string;
  publishedAt?: string;
};

type AndroidUpdateState = {
  latestVersion: string;
  apkUrl: string;
  required: boolean;
  message?: string;
};

const DISMISS_KEY_PREFIX = "routing-pwa:android-update-dismissed:";

function versionToNumbers(version: string) {
  const parts = version.match(/\d+/g);
  if (!parts) return [0];

  return parts.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function compareVersions(a: string, b: string) {
  const aParts = versionToNumbers(a);
  const bParts = versionToNumbers(b);
  const size = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < size; index += 1) {
    const aValue = aParts[index] ?? 0;
    const bValue = bParts[index] ?? 0;

    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }

  return 0;
}

function resolveApkUrl(apkUrl: string) {
  if (/^https?:\/\//i.test(apkUrl)) return apkUrl;
  return buildApiUrl(apkUrl.startsWith("/") ? apkUrl : `/${apkUrl}`);
}

export default function AndroidUpdateBanner() {
  const isAndroid = useMemo(() => Capacitor.getPlatform() === "android", []);
  const currentVersion = useMemo(
    () => (import.meta.env.VITE_ANDROID_APP_VERSION?.trim() || "1.0").trim(),
    []
  );
  const [update, setUpdate] = useState<AndroidUpdateState | null>(null);

  useEffect(() => {
    if (!isAndroid) return;

    const controller = new AbortController();
    const checkForUpdate = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/app-update/android"), {
          signal: controller.signal,
          credentials: "include",
        });
        if (!response.ok) return;

        const payload = (await response.json()) as AndroidUpdateResponse;
        const latestVersion = payload.latestVersion?.trim();
        const apkUrl = payload.apkUrl?.trim();
        const minimumSupportedVersion = payload.minimumSupportedVersion?.trim();
        const requiredByMinimumVersion = Boolean(
          minimumSupportedVersion &&
            compareVersions(minimumSupportedVersion, currentVersion) > 0
        );
        const isRequired = Boolean(payload.required) || requiredByMinimumVersion;

        if (!payload.enabled || !latestVersion || !apkUrl) return;
        if (compareVersions(latestVersion, currentVersion) <= 0) return;

        const dismissKey = `${DISMISS_KEY_PREFIX}${latestVersion}`;
        if (!isRequired && window.localStorage.getItem(dismissKey) === "1") {
          return;
        }

        setUpdate({
          latestVersion,
          apkUrl: resolveApkUrl(apkUrl),
          required: isRequired,
          message: payload.message?.trim() || undefined,
        });
      } catch {
        // Ignore update check errors and keep the app usable.
      }
    };

    void checkForUpdate();

    return () => controller.abort();
  }, [currentVersion, isAndroid]);

  if (!isAndroid || !update) return null;

  const dismissKey = `${DISMISS_KEY_PREFIX}${update.latestVersion}`;

  const handleUpdateNow = () => {
    window.location.assign(update.apkUrl);
  };

  const handleDismiss = () => {
    window.localStorage.setItem(dismissKey, "1");
    setUpdate(null);
  };

  return (
    <div className="md:sticky md:top-4 md:z-30">
      <Alert className="mx-auto max-w-2xl border-primary/35 bg-emerald-50 px-3 py-1.5 shadow-[0_10px_20px_rgb(15_23_42_/_8%)] sm:py-2 md:max-w-3xl">
        <AlertDescription className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold sm:text-sm">
              Nova vers\u00e3o dispon\u00edvel ({update.latestVersion})
            </p>
            <p className="hidden text-xs text-muted-foreground md:block">
              {update.message ||
                "Baixe a vers\u00e3o mais recente para manter o app atualizado."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
              onClick={handleUpdateNow}
            >
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Atualizar agora
            </Button>
            {!update.required && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                onClick={handleDismiss}
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
