"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "../ui/input";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { ItemRead } from "@/app/openapi-client";
import { formatNumber } from "@/lib/format-number";
import { Button } from "../ui/button";

interface ProductQuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (product: ItemRead, quantity: number) => void;
  itemSelected: null | ItemRead;
}

const ProductQuantityModal: React.FC<ProductQuantityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemSelected,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [quantity, setQuantity] = useState<null | number>(1);

  useEffect(() => {
    if (isOpen) {
      setQuantity(null);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          {/* Container */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            {/* Header */}
            <div className="flex items-center gap-2">
              🛍️
              <h3 className="font-semibold text-gray-800">
                Ingresar cantidad en gramos
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {/* Item infro */}
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-800">
                {itemSelected?.name}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Precio por KG:
                {" " + formatCurrency(itemSelected?.price)}
              </p>
              <p className="text-xs text-gray-500">
                Stock disponible:
                {" " + formatNumber(itemSelected?.stock)}
              </p>
            </div>
            {/* Input quantity */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600">
                Ingrese cantidad en gramos
              </label>
              <Input
                ref={inputRef}
                type="number"
                step="100"
                min="0"
                value={quantity ?? ""}
                onChange={(e) => setQuantity(Number(e.target.value) || null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && quantity != null && quantity > 0) {
                    onConfirm(itemSelected!, quantity!);
                    onClose();
                  }
                }}
                className="h-10 text-sm font-mono"
              />
            </div>
            {/* Confirm buttons */}
            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="h-10 text-sm"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={quantity == null || quantity <= 0}
                  onClick={() => {onConfirm(itemSelected!, quantity!); onClose();}}
                  className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Aplicar Cantidad
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductQuantityModal;
