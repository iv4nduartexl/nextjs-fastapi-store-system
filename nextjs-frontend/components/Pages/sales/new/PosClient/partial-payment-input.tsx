"use client";

import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface PartialPaymentInputProps {
  amount: number | null;
  setAmount: (amount: number | null) => void;
}

export const PartialPaymentInput: React.FC<PartialPaymentInputProps> = ({
  amount,
  setAmount,
}) => {
  const [showInput, setShowInput] = useState(false);
  const t = useTranslations("sales");
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && amountRef.current) {
      amountRef.current.focus();
    }
  }, [showInput]);

  return (
    <div className="pt-2 flex flex-col items-start space-y-2">
      <button
        onClick={() => setShowInput(!showInput)}
        className={`w-full flex flex-start text-[10px] ${showInput ? "text-gray-400" : "text-blue-400"} font-semibold uppercase tracking-widest`}
      >
        {showInput
          ? t("pos.addCustomerPartialPaymentAmount")
          : t("pos.addCustomerPartialPayment")}
      </button>
      {showInput && (
        <>
          <Input
            ref={amountRef}
            type="number"
            min={0}
            value={amount ?? ""}
            onChange={(e) => setAmount(Number(e.target.value) || null)}
            placeholder="0"
            className="text-base font-mono h-10 border-gray-200"
          />
        </>
      )}
    </div>
  );
};
