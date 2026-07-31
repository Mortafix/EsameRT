"use client";

import * as echarts from "echarts";
import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef } from "react";

import styles from "./dashboard.module.css";

type EcoChartProps = {
  option: EChartsOption;
  ariaLabel: string;
  className?: string;
  height?: number;
};

export function EcoChart({
  option,
  ariaLabel,
  className,
  height = 320,
}: EcoChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, undefined, {
      renderer: "canvas",
      useDirtyRect: true,
    });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    chart.setOption(
      {
        ...option,
        animation: !reduceMotion,
        aria: {
          enabled: true,
          description: ariaLabel,
        },
      },
      { notMerge: true },
    );
  }, [ariaLabel, option]);

  return (
    <div
      ref={containerRef}
      className={`${styles.chart} ${className ?? ""}`}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
