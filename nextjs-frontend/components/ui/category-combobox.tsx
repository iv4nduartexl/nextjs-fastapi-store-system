"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** If set, renders a hidden <input name={name}> for use inside a <form> */
  name?: string;
  className?: string;
  inputClassName?: string;
}

export function CategoryCombobox({
  value,
  onChange,
  placeholder = "Category",
  name,
  className,
  inputClassName,
}: CategoryComboboxProps) {
  const t = useTranslations("common");
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep inputVal in sync when parent resets value (e.g. form clear)
  useEffect(() => {
    setInputVal(value);
  }, [value]);

  // Fetch suggestions with debounce
  useEffect(() => {
    const q = inputVal.trim();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/categories${q ? `?q=${encodeURIComponent(q)}` : ""}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data: string[] = await res.json();
          setSuggestions(data);
        }
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [inputVal, open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(cat: string) {
    setInputVal(cat);
    onChange(cat);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInputVal(v);
    onChange(v);
    setOpen(true);
  }

  const trimmed = inputVal.trim();
  const exactMatch = suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  return (
    <div ref={containerRef} className={`relative${className ? ` ${className}` : ""}`}>
      {name && (
        <input type="hidden" name={name} value={inputVal} />
      )}
      <div className="relative">
        <input
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full h-9 rounded-md border border-gray-200 bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-green-400${inputClassName ? ` ${inputClassName}` : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (suggestions.length > 0 || showCreate) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => select(cat)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                cat.toLowerCase() === trimmed.toLowerCase()
                  ? "font-semibold text-green-700 bg-green-50"
                  : "text-gray-700"
              }`}
            >
              {cat}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => select(trimmed)}
              className="w-full text-left px-4 py-2 text-sm text-green-600 font-medium hover:bg-green-50 transition-colors flex items-center gap-2 border-t border-gray-100"
            >
              <Plus size={13} />
              {t("createOption", { name: trimmed })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
