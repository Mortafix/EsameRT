"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./custom-select.module.css";

export type CustomSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function CustomSelect({
  label,
  value,
  options,
  onValueChange,
  className,
  variant = "default",
  disabled,
}: {
  label: string;
  value: string;
  options: CustomSelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
  variant?: "default" | "compact" | "floating";
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(styles.root, className)}
      data-variant={variant}
    >
      <span className={styles.label}>{label}</span>
      <Select.Root
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <Select.Trigger className={styles.trigger} aria-label={label}>
          <Select.Value />
          <Select.Icon className={styles.chevron}>
            <ChevronDown size={16} aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className={styles.content}
            position="popper"
            sideOffset={6}
          >
            <Select.Viewport className={styles.viewport}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.item}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className={styles.indicator}>
                    <Check size={15} aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
