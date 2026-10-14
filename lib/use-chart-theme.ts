"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { observeChartTheme, type ChartTheme } from "@ersione/design-system/charts";

export function useChartTheme(ref: RefObject<HTMLCanvasElement | null>) {
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  useEffect(() => {
    if (ref.current) return observeChartTheme(ref.current, setTheme);
  }, [ref]);
  // Company Lens chooses this mapping; EDS only supplies the palette.
  return useMemo(() => theme ? { ...theme, colors: { ...theme.colors,
    people: theme.palette.blue, salary: theme.palette.teal,
    joiners: theme.palette.teal, departures: theme.palette.orange, flow: theme.palette.purple,
    peopleFill: theme.tints.blue, salaryFill: theme.tints.teal,
  } } : null, [theme]);
}
