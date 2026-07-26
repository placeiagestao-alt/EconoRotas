import { cn } from "@/lib/utils";

type StopIdentityStripProps = {
  routePositionLabel?: string;
  stopLabel?: string;
  packageLabel?: string;
  className?: string;
};

function stripPackagePrefix(value?: string) {
  return value?.replace(/^Pacotes?:\s*/i, "").trim();
}

export default function StopIdentityStrip({
  routePositionLabel,
  stopLabel,
  packageLabel,
  className,
}: StopIdentityStripProps) {
  const packageValue = stripPackagePrefix(packageLabel);

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-200 py-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]",
        className
      )}
      data-testid="stop-identity-strip"
    >
      {routePositionLabel ? (
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Parada
          </p>
          <p className="text-base font-black text-foreground">
            {routePositionLabel}
          </p>
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-slate-500">
          STOP
        </p>
        <p className="break-words text-base font-black text-foreground">
          {stopLabel || "Não usado"}
        </p>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="text-xs font-semibold uppercase text-slate-500">
          Pacote
        </p>
        <p
          className={cn(
            "break-all text-base font-black",
            packageValue ? "text-emerald-700" : "text-red-700"
          )}
          title={packageValue || "Pacote não identificado"}
        >
          {packageValue || "Não identificado"}
        </p>
      </div>
    </div>
  );
}
