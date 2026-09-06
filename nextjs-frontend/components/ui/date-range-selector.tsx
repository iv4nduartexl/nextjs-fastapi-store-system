"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateRangePreset = "today" | "7d" | "30d" | "90d" | "1y" | "all" | "custom";

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangeSelectorProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined, preset: DateRangePreset) => void;
  defaultPreset?: DateRangePreset;
  className?: string;
  labels?: {
    today?: string;
    "7d"?: string;
    "30d"?: string;
    "90d"?: string;
    "1y"?: string;
    all?: string;
    custom?: string;
  };
}

const DEFAULT_PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: "Today", value: "today" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "1Y", value: "1y" },
  { label: "All", value: "all" },
];

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: endOfDay };
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: endOfDay };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: endOfDay };
    }
    case "90d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: endOfDay };
    }
    case "1y": {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: endOfDay };
    }
    case "all": {
      return { from: undefined, to: undefined };
    }
    case "custom":
    default:
      return {};
  }
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  value,
  onChange,
  defaultPreset = "30d",
  className,
  labels,
}) => {
  const PRESETS = DEFAULT_PRESETS.map((p) => ({
    ...p,
    label: labels?.[p.value as keyof typeof labels] ?? p.label,
  }));
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset);
  const [customFrom, setCustomFrom] = useState<string>(
    value?.from ? formatDate(value.from) : ""
  );
  const [customTo, setCustomTo] = useState<string>(
    value?.to ? formatDate(value.to) : ""
  );

  useEffect(() => {
    if (preset !== "custom") {
      const range = computeRangeFromPreset(preset);
      onChange?.(range, preset);
    }
  }, [preset, onChange]);

  useEffect(() => {
    if (preset === "custom" && customFrom && customTo) {
      const from = new Date(customFrom);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      onChange?.({ from, to }, "custom");
    }
  }, [customFrom, customTo, preset, onChange]);

  const handlePresetChange = (newPreset: DateRangePreset) => {
    setPreset(newPreset);
    if (newPreset === "custom") {
      if (customFrom && customTo) {
        const from = new Date(customFrom);
        const to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
        onChange?.({ from, to }, "custom");
      }
    } else {
      setCustomFrom("");
      setCustomTo("");
    }
  };

  const handleClearCustom = () => {
    setCustomFrom("");
    setCustomTo("");
    setPreset("30d");
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {PRESETS.map((p) => (
        <Button
          key={p.value}
          variant={preset === p.value ? "default" : "outline"}
          size="sm"
          onClick={() => handlePresetChange(p.value)}
        >
          {p.label}
        </Button>
      ))}

      <Button
        variant={preset === "custom" ? "default" : "outline"}
        size="sm"
        onClick={() => handlePresetChange("custom")}
        className="gap-2"
      >
        <CalendarIcon className="h-4 w-4" />
        {labels?.custom ?? "Custom"}
      </Button>

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            max={customTo || formatDate(new Date())}
            className="px-2 py-1 text-sm border rounded-md"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            min={customFrom}
            max={formatDate(new Date())}
            className="px-2 py-1 text-sm border rounded-md"
          />
          {(customFrom || customTo) && (
            <Button variant="ghost" size="icon" onClick={handleClearCustom} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
