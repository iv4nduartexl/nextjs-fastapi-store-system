"use client";

import { useEffect, useState } from "react";

interface LocalSpanProps {
  dateIso: string;
  locale: string;
  options?: Intl.DateTimeFormatOptions; // New optional configuration prop
}

export default function LocalSpan({ dateIso, locale, options }: LocalSpanProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(dateIso);
    
    // Fallback default format if no custom options are provided
    const formatOptions = options || {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };

    setText(d.toLocaleString(locale, formatOptions));
  }, [dateIso, locale, options]);

  if (text === null) {
    return (
      <span 
        className="inline-block h-4 w-32 animate-pulse rounded bg-gray-200 align-middle" 
        aria-hidden="true"
      />
    );
  }

  return <span>{text}</span>;
}
