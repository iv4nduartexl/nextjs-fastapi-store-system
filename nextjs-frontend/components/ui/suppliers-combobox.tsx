"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { UUID } from "crypto";
import { SupplierCreate } from "../actions/purchases-action";

interface SupplierComboboxProps {
  value: SupplierCreate ;
  onChange: (value: SupplierCreate ) => void;
  placeholder?: string;
  /** If set, renders a hidden <input name={name}> for use inside a <form> */
  name?: string;
  className?: string;
  inputClassName?: string;
}

export function SupplierCombobox({
  value,
  onChange,
  placeholder = "Suppliers",
  name,
  className,
  inputClassName,
}: SupplierComboboxProps) {
  const t = useTranslations("common");
  const [inputVal, setInputVal] = useState(value ? value.name : "");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SupplierCreate[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep inputVal in sync when parent resets value (e.g. form clear)
  useEffect(() => {
    setInputVal(value ? value.name : "");
  }, [value]);

  // Fetch suggestions with debounce
  useEffect(() => {
    const q = inputVal.trim();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/suppliers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data: {id: UUID, name: string}[] = await res.json();
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(id: UUID | undefined, name: string) {
    setInputVal(name);
    onChange({id, name});
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInputVal(v);
    onChange({ id: undefined as UUID | undefined, name: v });
    setOpen(true);
  }

  const trimmed = inputVal.trim();
  const exactMatch = suggestions.some(
    (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  return (
    <div
      ref={containerRef}
      className={`relative${className ? ` ${className}` : ""}`}
    >
      {name && <input type="hidden" name={name} value={inputVal} />}
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
          {suggestions.map((sup) => (
            <button
              key={sup.id}
              type="button"
              onClick={() => select(sup.id, sup.name)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                sup.name.toLowerCase() === trimmed.toLowerCase()
                  ? "font-semibold text-green-700 bg-green-50"
                  : "text-gray-700"
              }`}
            >
              {sup.name}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => select(undefined, trimmed)}
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
