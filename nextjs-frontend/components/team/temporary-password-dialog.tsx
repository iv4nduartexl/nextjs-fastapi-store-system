"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";

interface TemporaryPasswordDialogProps {
  email: string;
  password: string;
  onClose: () => void;
}

/** Shows a generated password once, so it can be handed to the user. */
export function TemporaryPasswordDialog({ email, password, onClose }: TemporaryPasswordDialogProps) {
  const t = useTranslations("team");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(`${email}\n${password}`);
    setCopied(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <KeyRound className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t("tempPasswordTitle")}</h3>
              <p className="text-xs text-gray-500">{t("tempPasswordHint")}</p>
            </div>
          </div>
          <div className="space-y-1 rounded-xl border bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">{email}</p>
            <p className="select-all break-all font-mono text-lg font-semibold tracking-wide text-gray-900">
              {password}
            </p>
          </div>
          <p className="text-xs text-amber-700">{t("tempPasswordOnce")}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-1.5" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button className="flex-1" onClick={onClose}>
              {t("done")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
