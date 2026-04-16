import React from "react";
import { cn } from "@/utils/cn";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "link"
    | "secondary"
    | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = "", variant = "default", size = "default", ...props },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-medium tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white/80 active:scale-[0.985] backdrop-blur-md";

    let variantStyles = "";
    switch (variant) {
      case "default":
        variantStyles =
          "bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_14px_28px_rgba(236,72,153,0.22)] hover:brightness-[1.02] hover:shadow-[0_18px_32px_rgba(236,72,153,0.28)]";
        break;
      case "outline":
        variantStyles =
          "border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.72))] text-slate-700 shadow-[0_10px_20px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] hover:bg-white hover:text-pink-600";
        break;
      case "ghost":
        variantStyles =
          "bg-transparent text-slate-500 shadow-none hover:bg-white/76 hover:text-pink-600";
        break;
      case "link":
        variantStyles =
          "rounded-none px-0 text-pink-600 shadow-none underline-offset-4 hover:underline";
        break;
      case "secondary":
        variantStyles =
          "border border-amber-100 bg-[linear-gradient(180deg,rgba(255,251,235,0.9),rgba(255,255,255,0.78))] text-amber-700 shadow-[0_10px_20px_rgba(245,158,11,0.08)] hover:bg-amber-50";
        break;
      case "destructive":
        variantStyles =
          "bg-[linear-gradient(135deg,#fb7185,#f43f5e)] text-white shadow-[0_14px_28px_rgba(244,63,94,0.18)] hover:brightness-[1.02] hover:shadow-[0_18px_32px_rgba(244,63,94,0.24)]";
        break;
    }

    let sizeStyles = "";
    switch (size) {
      case "default":
        sizeStyles = "h-10 px-4 py-2";
        break;
      case "sm":
        sizeStyles = "h-9 px-3.5 text-sm";
        break;
      case "lg":
        sizeStyles = "h-11 px-6 text-base";
        break;
      case "icon":
        sizeStyles = "h-10 w-10 p-0";
        break;
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles, sizeStyles, className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps };
