"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterField {
  type: "search" | "select";
  key: string;
  placeholder?: string;
  options?: FilterSelectOption[];
}

interface TableFiltersProps {
  fields: FilterField[];
  clearLabel?: string;
}

export function TableFilters({
  fields,
  clearLabel = "Clear",
}: TableFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [textValues, setTextValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.type === "search") init[f.key] = searchParams.get(f.key) ?? "";
    });
    return init;
  });

  const pushParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Debounce text search updates
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    fields.forEach((f) => {
      if (f.type === "search") {
        const current = searchParams.get(f.key) ?? "";
        if (textValues[f.key] !== current) {
          const timer = setTimeout(
            () => pushParams(f.key, textValues[f.key]),
            400,
          );
          timers.push(timer);
        }
      }
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textValues]);

  const hasActiveFilters = fields.some((f) => searchParams.get(f.key));

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    fields.forEach((f) => params.delete(f.key));
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    const cleared: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.type === "search") cleared[f.key] = "";
    });
    setTextValues(cleared);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {fields.map((f) => {
        if (f.type === "search") {
          return (
            <div key={f.key} className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={textValues[f.key] ?? ""}
                onChange={(e) =>
                  setTextValues((prev) => ({
                    ...prev,
                    [f.key]: e.target.value,
                  }))
                }
                placeholder={f.placeholder ?? "Search..."}
                className="h-9 pl-8 pr-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
              />
            </div>
          );
        }
        if (f.type === "select") {
          return (
            <select
              key={f.key}
              value={searchParams.get(f.key) ?? ""}
              onChange={(e) => pushParams(f.key, e.target.value)}
              className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              <option value="">{f.placeholder ?? "All"}</option>
              {f.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        }
        return null;
      })}
      {hasActiveFilters && (
        <button
          onClick={clearAll}
          className="h-9 px-3 text-xs rounded-lg border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 flex items-center gap-1 transition-colors"
        >
          <X size={12} />
          {clearLabel}
        </button>
      )}
    </div>
  );
}
