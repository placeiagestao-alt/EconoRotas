import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl text-sm font-medium tracking-[0.01em] transition-all duration-200 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-transparent after:transition-colors active:scale-[0.97] active:after:bg-black/10 disabled:pointer-events-none disabled:opacity-50 dark:active:after:bg-white/12 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:border-ring focus-visible:ring-ring/60 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_0_0_1px_rgb(16_185_129_/_28%),0_10px_22px_rgb(16_185_129_/_28%)] hover:brightness-105 md:hover:-translate-y-0.5",
        destructive:
          "bg-destructive/95 text-white shadow-[0_0_0_1px_rgb(239_68_68_/_35%)] hover:bg-destructive focus-visible:ring-destructive/30 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-border bg-white text-slate-950 shadow-[0_1px_0_rgb(255_255_255_/_75%),0_4px_12px_rgb(15_23_42_/_6%)] hover:bg-secondary hover:text-slate-950 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 dark:hover:text-slate-950 md:hover:-translate-y-0.5",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_0_0_1px_rgb(148_163_184_/_12%)] hover:bg-secondary/85",
        ghost:
          "hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 px-6 has-[>svg]:px-4",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
