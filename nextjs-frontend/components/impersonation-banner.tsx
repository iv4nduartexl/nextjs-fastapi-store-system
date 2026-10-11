"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, Loader2, LogOut } from "lucide-react";

import { stopImpersonation } from "@/components/actions/admin-action";
import { displayName, type Me } from "@/lib/me";

/** Always-visible notice while the superuser is using the app as another user. */
export function ImpersonationBanner({ me }: { me: Me }) {
  const t = useTranslations("account");
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm text-amber-950 shadow-sm"
    >
      <Eye className="h-4 w-4 shrink-0" />
      <span className="truncate">
        {t("viewingAs", { name: displayName(me), business: me.business_name ?? "" })}
      </span>
      <button
        onClick={() => startTransition(() => stopImpersonation(me.id))}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        {t("exitViewAs")}
      </button>
    </div>
  );
}
