import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("rt-field", className)}>
      <span className="rt-field__label">{label}</span>
      {children}
      {error ? (
        <span className="rt-field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="rt-field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("rt-input", className)} {...props} />;
});
