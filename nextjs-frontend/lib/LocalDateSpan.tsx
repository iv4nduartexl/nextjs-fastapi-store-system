"use client";

import { useEffect, useState } from "react";

interface LocalDateSpanProps {
  dateIso: string;
  locale?: string;
  options?: Intl.DateTimeFormatOptions; // New optional configuration prop
}

export default function LocalDateSpan({
  dateIso,
  locale,
  options,
}: LocalDateSpanProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(dateIso);

    // Fallback default format if no custom options are provided
    const formatOptions = options || undefined;

    setText(d.toLocaleString(locale || undefined, formatOptions));
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
