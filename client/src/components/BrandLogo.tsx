import logoSrc from "@/assets/brand/econorotas-logo.png";
import markSrc from "@/assets/brand/econorotas-mark.png";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  variant?: "mark" | "full";
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({
  variant = "full",
  className,
  imageClassName,
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden",
        className
      )}
    >
      <img
        src={variant === "mark" ? markSrc : logoSrc}
        alt="EconoRotas"
        className={cn("block h-full w-full object-contain", imageClassName)}
        draggable={false}
      />
    </span>
  );
}
