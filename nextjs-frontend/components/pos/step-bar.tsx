"use client";

import { Check } from "lucide-react";

/**
 * Compact "1 → 2 → 3" indicator: always shows where you are and what comes next.
 * With `onSelect`, finished steps (and any up to `maxReachable`) can be clicked to go back.
 */
export function StepBar({
  steps,
  current,
  onSelect,
  maxReachable,
}: {
  steps: string[];
  current: number;
  onSelect?: (index: number) => void;
  maxReachable?: number;
}) {
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-medium" aria-label="progress">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!onSelect || index > (maxReachable ?? current) || active}
              onClick={() => onSelect?.(index)}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors disabled:cursor-default ${
                onSelect && !active && index <= (maxReachable ?? current) ? "hover:ring-2 hover:ring-gray-200 " : ""
              }${
                active
                  ? "bg-gray-900 text-white"
                  : done
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? <Check size={11} /> : <span className="tabular-nums">{index + 1}</span>}
              {label}
            </button>
            {index < steps.length - 1 && <span className="h-px w-3 bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}
