"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useRef } from "react";
import { Search, X } from "lucide-react";

interface Props {
  placeholder: string;
  defaultValue?: string;
}

export default function CustomerSearch({ placeholder, defaultValue = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      params.delete("page");
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    }, 300);
  }

  return (
    <div className="relative">
      <Search
        size={15}
        className={`absolute left-3 top-1/2 -translate-y-1/2 ${isPending ? "text-gray-400 animate-pulse" : "text-gray-400"}`}
      />
      <input
        type="text"
        defaultValue={defaultValue}
        onChange={(e) => update(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-72 pl-9 pr-8 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors"
      />
      {defaultValue && (
        <a
          href="?"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={13} />
        </a>
      )}
    </div>
  );
}
