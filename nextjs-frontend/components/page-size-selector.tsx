"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

interface PageSizeSelectorProps {
  currentSize: number;
}

export function PageSizeSelector({ currentSize }: PageSizeSelectorProps) {
  const t = useTranslations("common");
  const router = useRouter();
  // usePathname from next/navigation keeps the locale prefix (e.g. /es/sales)
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageSizeOptions = [5, 10, 20, 50, 100];

  const handleSizeChange = (newSize: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("size", newSize);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">{t("itemsPerPage")}</span>
      <Select value={currentSize.toString()} onValueChange={handleSizeChange}>
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((option) => (
            <SelectItem key={option} value={option.toString()}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
