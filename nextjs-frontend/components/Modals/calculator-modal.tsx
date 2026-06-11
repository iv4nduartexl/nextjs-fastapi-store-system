"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button"; // adjust path if needed
import { Input } from "../ui/input";

type Op = "+" | "-" | "*" | "/";

const BUTTONS: Array<
  Array<{ label: string; value?: string; variant?: any; size?: any }>
> = [
  [
    { label: "⌫", value: "clear", variant: "outline", size: "sm" },
    { label: "±", value: "neg", variant: "outline", size: "sm" },
    { label: "%", value: "percent", variant: "outline", size: "sm" },
    { label: "÷", value: "/", variant: "outline", size: "sm" },
  ],
  [
    { label: "7", value: "7", variant: "ghost" },
    { label: "8", value: "8", variant: "ghost" },
    { label: "9", value: "9", variant: "ghost" },
    { label: "×", value: "*", variant: "ghost" },
  ],
  [
    { label: "4", value: "4", variant: "ghost" },
    { label: "5", value: "5", variant: "ghost" },
    { label: "6", value: "6", variant: "ghost" },
    { label: "−", value: "-", variant: "ghost" },
  ],
  [
    { label: "1", value: "1", variant: "ghost" },
    { label: "2", value: "2", variant: "ghost" },
    { label: "3", value: "3", variant: "ghost" },
    { label: "+", value: "+", variant: "ghost" },
  ],
  [
    { label: "0", value: "0", size: "lg", variant: "green" },
    { label: ".", value: ".", variant: "outline" },
    { label: "=", value: "equals", variant: "green" },
  ],
];

function formatDisplay(value: string) {
  if (!value) return "0";
  const [int, dec] = value.split(".");
  try {
    const formattedInt = Number(int).toLocaleString();
    return dec !== undefined ? `${formattedInt}.${dec}` : formattedInt;
  } catch {
    return value;
  }
}

export interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (result: number | null | string) => void;
}

export default function CalculatorModal({
  isOpen,
  onClose,
  onConfirm,
}: CalculatorModalProps) {
  const [display, setDisplay] = useState<string>("0");
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [operation, setOperation] = useState<Op | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [isresult, setIsResult] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplay("0");
      setAccumulator(null);
      setOperation(null);
      setWaitingForOperand(false);
      // focus first button after open
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleKey = (e: KeyboardEvent) => {
    const key = e.key;
    if ((key >= "0" && key <= "9") || key === ".") handleInput(key);
    if (key === "Enter" || key === "=") handleInput("equals");
    if (key === "Backspace") handleInput("clear");
    if (["+", "-", "*", "/"].includes(key)) handleInput(key);
    if (key === "%") handleInput("percent");
    if (key === "Escape") onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, display, accumulator, operation, waitingForOperand, onClose]);

  if (!isOpen) return null;

  const performOperation = (a: number | null, b: number, op: Op | null) => {
    const x = a ?? 0;
    switch (op) {
      case "+":
        return x + b;
      case "-":
        return x - b;
      case "*":
        return x * b;
      case "/":
        return b === 0 ? NaN : x / b;
      default:
        return b;
    }
  };

  const compute = () => {
    if (operation && accumulator !== null) {
      const result = performOperation(
        accumulator,
        parseFloat(display || "0") || 0,
        operation,
      );
      const out = isFinite(result) ? result : "Error";
      setDisplay(String(out));
      setAccumulator(null);
      setOperation(null);
      setWaitingForOperand(true);
      if (onConfirm) onConfirm(out);
    }
  };

  const handleInput = (value: string) => {
    setIsResult(false);
    if (value === "clear") {
      // If there's a display with more than one char, delete last character
      if (display.length > 1) {
        setDisplay((d) => d.slice(0, -1));
      } else if (display !== "0") {
        // Single digit — reset to 0
        setDisplay("0");
      } else if (operation !== null) {
        // Display is already "0", clear the pending operation
        setOperation(null);
      } else if (accumulator !== null) {
        // No operation, clear the accumulator
        setDisplay(String(accumulator));
        setAccumulator(null);
      } else {
        // Full reset
        setWaitingForOperand(false);
      }
      return;
    }

    if (value === "neg") {
      if (display === "0") return;
      setDisplay((d) => (d.startsWith("-") ? d.slice(1) : "-" + d));
      return;
    }

    if (value === "percent") {
      const num = parseFloat(display || "0") || 0;
      setDisplay(String(num / 100));
      return;
    }

    if (value === "equals") {
      setIsResult(true);
      compute();
      return;
    }

    if (["+", "-", "*", "/"].includes(value)) {
      const op = value as Op;
      if (accumulator === null) {
        setAccumulator(parseFloat(display || "0") || 0);
      } else if (!waitingForOperand) {
        const result = performOperation(
          accumulator,
          parseFloat(display || "0") || 0,
          operation,
        );
        setAccumulator(result);
        setDisplay(String(result));
      }
      setOperation(op);
      setWaitingForOperand(true);
      return;
    }

    if (value === ".") {
      if (waitingForOperand) {
        setDisplay("0.");
        setWaitingForOperand(false);
        return;
      }
      if (display.includes(".")) return;
      setDisplay((d) => (d === "0" ? "0." : d + "."));
      return;
    }

    if (/^[0-9]$/.test(value)) {
      if (waitingForOperand) {
        setDisplay(value);
        setWaitingForOperand(false);
      } else {
        setDisplay((d) => (d === "0" ? value : d + value));
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl bg-white/95 shadow-2xl overflow-hidden ring-1 ring-slate-100"
        role="dialog"
        aria-modal="true"
        aria-label="Calculator"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-xl">📝</span>
            <h3 className="font-semibold text-gray-800">Calculator</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-md p-1 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-200"
            aria-label="Close calculator"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <div className="bg-gradient-to-r from-gray-50 to-white/80 rounded-md p-3 text-right font-medium text-2xl sm:text-3xl text-slate-800 shadow-inner ring-1 ring-slate-100">
            <div className="text-sm text-slate-500 h-4">
              {operation && accumulator !== null
                ? `${accumulator} ${operation}`
                : "\u00A0"}
            </div>
            <Input
              ref={inputRef}
              readOnly
              className={`truncate ${isresult ? "text-green-700" : "text-slate-800"} bg-transparent border-none shadow-none text-right text-2xl sm:text-3xl font-medium focus-visible:ring-0 p-0`}
              value={formatDisplay(display)}
            />
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}
          >
            {BUTTONS.flat().map((btn, idx) => {
              const isZeroWide = btn.label === "0" && btn.size === "lg";
              const key = `${btn.label}-${idx}`;
              return (
                <div key={key} className={isZeroWide ? "col-span-2" : ""}>
                  <Button
                    variant={btn.variant ?? "ghost"}
                    size={btn.size ?? "default"}
                    onClick={() => handleInput(btn.value ?? btn.label)}
                    aria-label={`Calculator button ${btn.label}`}
                    className="w-full"
                  >
                    <span className="select-none">{btn.label}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white rounded-b-2xl flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              compute();
              onClose();
            }}
          >
            Cerrar
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => {
              setDisplay("0");
              setAccumulator(null);
              setOperation(null);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Limpiar
          </Button>
        </div>
      </div>
    </div>
  );
}
