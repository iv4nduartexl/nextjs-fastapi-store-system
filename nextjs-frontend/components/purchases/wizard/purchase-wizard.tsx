"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, CheckCircle2, History, Loader2 } from "lucide-react";

import { createPurchase, type PurchaseRead } from "@/components/actions/purchases-action";
import {
  fetchPurchasingCatalog,
  fetchRecentSuppliers,
  fetchUsualProducts,
  type RecentSupplier,
  type UsualProduct,
} from "@/components/actions/purchasing-action";
import { StepBar } from "@/components/pos/step-bar";
import { StepPayment } from "@/components/purchases/wizard/step-payment";
import { StepProducts } from "@/components/purchases/wizard/step-products";
import { StepReview } from "@/components/purchases/wizard/step-review";
import { StepSupplier } from "@/components/purchases/wizard/step-supplier";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { formatCurrency } from "@/lib/currency";
import { toDateInputValue } from "@/lib/dates";
import {
  WIZARD_STEPS,
  draftWarnings,
  firstBlockedStep,
  stepBlockers,
  type WizardStep,
} from "@/lib/purchases/checks";
import { draftReducer, emptyDraft, purchaseTotal, type PurchaseDraft, type PurchasingProduct } from "@/lib/purchases/draft";
import { toPurchaseCreate } from "@/lib/purchases/payload";
import { clearDraft, readDraft, useAutosave } from "@/lib/use-local-draft";

const DRAFT_KEY = "purchase-wizard-draft";

function hasContent(draft: PurchaseDraft | null): draft is PurchaseDraft {
  return !!draft && draft.version === 1 && (draft.lines.length > 0 || draft.supplier != null);
}

export function PurchaseWizard() {
  const t = useTranslations("purchases.wizard");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, dispatch] = useReducer(draftReducer, undefined, () => emptyDraft(toDateInputValue()));
  const [savedDraft, setSavedDraft] = useState<PurchaseDraft | null>(null);
  const [catalog, setCatalog] = useState<PurchasingProduct[]>([]);
  const [recent, setRecent] = useState<RecentSupplier[]>([]);
  const [usual, setUsual] = useState<UsualProduct[]>([]);
  const [focusLineKey, setFocusLineKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<PurchaseRead | null>(null);

  // Offer to continue an unfinished purchase
  useEffect(() => {
    const stored = readDraft<PurchaseDraft>(DRAFT_KEY);
    if (hasContent(stored)) setSavedDraft(stored);
    fetchPurchasingCatalog().then((r) => setCatalog(r.data ?? []));
    fetchRecentSuppliers().then((r) => setRecent(r.data ?? []));
  }, []);
  useAutosave(DRAFT_KEY, draft, !savedDraft && !done);

  // The supplier's usual products
  const supplierId = draft.supplier?.id;
  useEffect(() => {
    if (!supplierId) {
      setUsual([]);
      return;
    }
    fetchUsualProducts(supplierId).then((r) => setUsual(r.data ?? []));
  }, [supplierId]);

  // Current step from the URL, never past the first step that still needs something
  const requested = (searchParams.get("step") as WizardStep) || "supplier";
  const maxStep = firstBlockedStep(draft);
  const maxIndex = WIZARD_STEPS.indexOf(maxStep);
  const stepIndex = Math.min(Math.max(WIZARD_STEPS.indexOf(requested), 0), maxIndex);
  const step = WIZARD_STEPS[stepIndex];

  const goTo = useCallback(
    (target: WizardStep, lineKey?: string) => {
      setFocusLineKey(lineKey ?? null);
      router.replace(`/purchases/new?step=${target}`);
      window.scrollTo({ top: 0 });
    },
    [router],
  );

  const blockers = step === "review" ? [] : stepBlockers(draft, step);
  // Step 1 without a supplier: the main button itself offers "continue without supplier"
  const canSkipSupplier =
    step === "supplier" && !draft.supplier && !draft.noSupplier && blockers.every((b) => b === "chooseSupplier");
  const warnings = useMemo(() => draftWarnings(draft, catalog), [draft, catalog]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const result = await createPurchase(toPurchaseCreate(draft));
    setSubmitting(false);
    if (result.data) {
      clearDraft(DRAFT_KEY);
      setDone(result.data);
    } else {
      setSubmitError(result.error ?? t("submitError"));
    }
  }

  function next() {
    if (submitting) return;
    if (canSkipSupplier) {
      dispatch({ type: "setNoSupplier", value: true });
      goTo("products");
      return;
    }
    if (blockers.length > 0) return;
    if (step === "review") submit();
    else goTo(WIZARD_STEPS[stepIndex + 1]);
  }

  // Enter = next step. Fields that use Enter themselves (line editor, searches) handle it first.
  // Never on the last step (registering is only with the button) and never to skip the supplier.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, button, a, select, [role='dialog']")) return;
      if (step === "review" || canSkipSupplier || blockers.length > 0) return;
      e.preventDefault();
      next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Keep the focused field visible above the sticky bottom bar
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) {
        setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  function startNew(keepSupplier: boolean) {
    const fresh = emptyDraft(toDateInputValue());
    if (keepSupplier && done?.supplier) fresh.supplier = { id: done.supplier.id, name: done.supplier.name };
    dispatch({ type: "replace", draft: fresh });
    setDone(null);
    goTo(keepSupplier && done?.supplier ? "products" : "supplier");
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2 className="h-14 w-14 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t("done.title")}</h1>
        <p className="text-gray-600">
          {t("done.summary", { count: done.purchase_items.length, total: formatCurrency(done.total_cost) })}
        </p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {done.supplier && (
            <Button autoFocus onClick={() => startNew(true)} className="h-11">
              {t("done.newSameSupplier", { supplier: done.supplier.name })}
            </Button>
          )}
          <Button variant={done.supplier ? "outline" : "default"} onClick={() => startNew(false)} className="h-11">
            {t("done.newPurchase")}
          </Button>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/purchases/${done.id}`} className="font-medium text-blue-700 hover:underline">
            {t("done.view")}
          </Link>
          <Link href="/products" className="font-medium text-blue-700 hover:underline">
            {t("done.products")}
          </Link>
        </div>
      </div>
    );
  }

  const nextLabel = canSkipSupplier
    ? t("nav.continueWithoutSupplier")
    : step === "review"
      ? warnings.length > 0
        ? t("nav.submitAnyway")
        : t("nav.submit")
      : t("nav.next", { step: t(`steps.${WIZARD_STEPS[stepIndex + 1]}`) });

  return (
    <div className="mx-auto w-full max-w-3xl pb-36">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <StepBar
          steps={WIZARD_STEPS.map((s) => t(`steps.${s}`))}
          current={stepIndex}
          maxReachable={maxIndex}
          onSelect={(i) => goTo(WIZARD_STEPS[i])}
        />
        <Link href="/purchases" className="text-sm text-gray-500 hover:text-gray-800">
          {t("nav.exit")}
        </Link>
      </div>

      {savedDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="flex items-center gap-2 text-sm text-blue-950">
            <History className="h-4 w-4 shrink-0" />
            {t("resume.message", {
              supplier: savedDraft.supplier?.name ?? t("supplier.noSupplier"),
              count: savedDraft.lines.length,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                dispatch({ type: "replace", draft: savedDraft });
                setSavedDraft(null);
                goTo(firstBlockedStep(savedDraft));
              }}
            >
              {t("resume.continue")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearDraft(DRAFT_KEY);
                setSavedDraft(null);
              }}
            >
              {t("resume.discard")}
            </Button>
          </div>
        </div>
      )}

      {step === "supplier" && <StepSupplier draft={draft} dispatch={dispatch} recent={recent} locale={locale} />}
      {step === "products" && (
        <StepProducts draft={draft} dispatch={dispatch} catalog={catalog} usual={usual} focusLineKey={focusLineKey} />
      )}
      {step === "payment" && <StepPayment draft={draft} dispatch={dispatch} />}
      {step === "review" && <StepReview draft={draft} dispatch={dispatch} catalog={catalog} goTo={goTo} />}

      {/* Sticky bottom bar: totals + back/next, with the reason when next is disabled */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur md:left-16">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
          {(step === "products" || step === "review") && draft.lines.length > 0 && (
            <div className="w-full text-sm">
              <span className="text-gray-600">{t("totals.lines", { count: draft.lines.length })}</span>
              <span className="mx-2 text-gray-300">·</span>
              <span className="font-semibold text-gray-900">{formatCurrency(purchaseTotal(draft))}</span>
              {draft.invoiceTotal != null && draft.invoiceTotal > 0 && (
                <InvoiceCheck invoiceTotal={draft.invoiceTotal} total={purchaseTotal(draft)} />
              )}
            </div>
          )}
          <Button
            variant="outline"
            className="h-12 gap-1.5"
            onClick={() => (stepIndex === 0 ? router.push("/purchases") : goTo(WIZARD_STEPS[stepIndex - 1]))}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("nav.back")}
          </Button>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
            {((blockers.length > 0 && !canSkipSupplier) || submitError) && (
              <p className="min-w-0 truncate text-right text-sm text-red-600" role="status">
                {submitError ?? t(`blocked.${blockers[0]}`)}
              </p>
            )}
            <Button
              onClick={next}
              disabled={(blockers.length > 0 && !canSkipSupplier) || submitting}
              variant={canSkipSupplier ? "outline" : "default"}
              className={`h-12 shrink-0 gap-1.5 px-5 ${step === "review" ? "bg-green-600 hover:bg-green-700" : ""}`}
              title={step === "review" || canSkipSupplier ? undefined : "Enter"}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {nextLabel}
              {step !== "review" && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceCheck({ invoiceTotal, total }: { invoiceTotal: number; total: number }) {
  const t = useTranslations("purchases.wizard.totals");
  const difference = Math.round((invoiceTotal - total) * 100) / 100;
  if (Math.abs(difference) < 1) {
    return <span className="ml-3 font-medium text-green-700">✓ {t("matches")}</span>;
  }
  return (
    <span className="ml-3 font-medium text-amber-700">
      {t("invoice", { total: formatCurrency(invoiceTotal) })} ·{" "}
      {difference > 0 ? t("missing", { amount: formatCurrency(difference) }) : t("over", { amount: formatCurrency(-difference) })}
    </span>
  );
}
