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
      "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-white active:scale-[0.98]";

    let variantStyles = "";
    switch (variant) {
      case "default":
        variantStyles = "bg-pink-500 text-white hover:bg-pink-600 shadow-sm";
        break;
      case "outline":
        variantStyles =
          "border border-pink-200 bg-white text-pink-500 hover:bg-pink-50 shadow-sm";
        break;
      case "ghost":
        variantStyles = "text-pink-500 hover:bg-pink-50 hover:text-pink-600";
        break;
      case "link":
        variantStyles = "underline-offset-4 hover:underline text-pink-500";
        break;
      case "secondary":
        variantStyles = "bg-pink-50 text-pink-700 hover:bg-pink-100 shadow-sm";
        break;
      case "destructive":
        variantStyles = "bg-red-500 text-white hover:bg-red-600 shadow-sm";
        break;
    }

    let sizeStyles = "";
    switch (size) {
      case "default":
        sizeStyles = "h-10 py-2 px-4";
        break;
      case "sm":
        sizeStyles = "h-9 px-3 rounded-lg";
        break;
      case "lg":
        sizeStyles = "h-11 px-8 rounded-lg";
        break;
      case "icon":
        sizeStyles = "h-10 w-10 rounded-lg";
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
