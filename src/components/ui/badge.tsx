import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "lime" | "clay" | "success" | "warning";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={cn("rt-badge", `rt-badge--${tone}`, className)} {...props} />
  );
}
