"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, CheckCircle2, History, Loader2 } from "lucide-react";

import { createProduct, fetchPosCatalog } from "@/components/actions/pos-action";
import { StepBar } from "@/components/pos/step-bar";
import { OfferBuilder } from "@/components/products/wizard/offer-builder";
import { StepIdentity } from "@/components/products/wizard/step-identity";
import { StepPrice } from "@/components/products/wizard/step-price";
import { StepReview } from "@/components/products/wizard/step-review";
import { StepStock } from "@/components/products/wizard/step-stock";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import type { PosProduct } from "@/lib/pos/catalog-search";
import { isTypingField, useBarcodeScanner } from "@/lib/pos/use-barcode-scanner";
import {
  PRODUCT_STEPS,
  canSkipPrice,
  emptyProductDraft,
  firstBlockedStep,
  stepBlockers,
  toItemCreate,
  type ProductDraft,
  type ProductStep,
} from "@/lib/products/draft";
import { clearDraft, readDraft, useAutosave } from "@/lib/use-local-draft";

const DRAFT_KEY = "product-wizard-draft";

function hasContent(draft: ProductDraft | null): draft is ProductDraft {
  return !!draft && draft.version === 1 && !!(draft.name.trim() || draft.sku.trim());
}

/** New product in 4 short steps: what it is → how it's sold → stock → review. */
export function ProductWizard() {
  const t = useTranslations("addItem.wizard");
  const tStockUnits = useTranslations("addItem.wizard.stock.units");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<ProductDraft>(() => emptyProductDraft());
  const [savedDraft, setSavedDraft] = useState<ProductDraft | null>(null);
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ product: PosProduct; draft: ProductDraft } | null>(null);

  const set = useCallback((patch: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...patch })), []);

  // Offer to continue an unfinished product; the catalog powers the duplicate checks
  useEffect(() => {
    const stored = readDraft<ProductDraft>(DRAFT_KEY);
    if (hasContent(stored)) setSavedDraft(stored);
    fetchPosCatalog().then((r) => setCatalog(r.data ?? []));
  }, []);
  useAutosave(DRAFT_KEY, draft, !savedDraft && !done);

  // Current step from the URL, never past the first step that still needs something
  const requested = (searchParams.get("step") as ProductStep) || "product";
  const maxStep = firstBlockedStep(draft, catalog);
  const maxIndex = PRODUCT_STEPS.indexOf(maxStep);
  const stepIndex = Math.min(Math.max(PRODUCT_STEPS.indexOf(requested), 0), maxIndex);
  const step = PRODUCT_STEPS[stepIndex];

  const goTo = useCallback(
    (target: ProductStep) => {
      router.replace(`/products/add-item?step=${target}`);
      window.scrollTo({ top: 0 });
    },
    [router],
  );

  const blockers = step === "review" ? [] : stepBlockers(draft, step, catalog);
  // Price step without a price: the main button itself says "continue without price"
  const skippingPrice = step === "price" && blockers.length === 0 && canSkipPrice(draft);

  // A scan anywhere on step 1 fills the barcode
  useBarcodeScanner(
    (code) => {
      set({ sku: code });
      document.getElementById(draft.name.trim() ? "np-sku" : "np-name")?.focus();
    },
    step === "product" && !done,
  );

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await createProduct(toItemCreate(draft));
    setSubmitting(false);
    if (result.data) {
      clearDraft(DRAFT_KEY);
      setCatalog((c) => [...c, result.data!]);
      setDone({ product: result.data, draft });
    } else if (result.existing) {
      // Someone used the code meanwhile: the duplicate card on step 1 explains it
      setCatalog((c) => [...c, result.existing!]);
      goTo("product");
    } else {
      setSubmitError(result.error ?? t("submitError"));
    }
  }

  function next() {
    if (submitting || blockers.length > 0) return;
    if (step === "review") submit();
    else goTo(PRODUCT_STEPS[stepIndex + 1]);
  }

  // Enter = next step. Never on the last step (creating is only with the button).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, button, a, select, [role='dialog'], [role='listbox']")) return;
      if (done) {
        if (!isTypingField(e.target)) {
          e.preventDefault();
          startNew(false);
        }
        return;
      }
      // Never to skip the price by accident
      if (step === "review" || skippingPrice || blockers.length > 0) return;
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

  function startNew(keepCategory: boolean) {
    const previous = done?.draft;
    setDraft(emptyProductDraft(keepCategory && previous ? previous : undefined));
    setDone(null);
    goTo("product");
  }

  if (done) {
    const { product, draft: created } = done;
    const unit = tStockUnits(created.unit);
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center animate-in fade-in zoom-in-95">
        <CheckCircle2 className="h-14 w-14 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t("done.title", { name: product.name })}</h1>
        <p className="text-gray-600">
          {t("done.summary", {
            price: created.price ? formatCurrency(created.price) : t("review.noPriceShort"),
            stock: `${formatNumber(created.stock ?? 0, 3)} ${unit}`,
          })}
        </p>
        {/* Optional and separate: the product already exists whatever happens here */}
        <OfferBuilder itemId={product.id} basePrice={created.price} unit={created.unit} />
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button autoFocus onClick={() => startNew(false)} className="h-11">
            {t("done.another")}
          </Button>
          {created.category.trim() && (
            <Button variant="outline" onClick={() => startNew(true)} className="h-11">
              {t("done.anotherInCategory", { category: created.category.trim() })}
            </Button>
          )}
        </div>
        <Link href="/products" className="text-sm font-medium text-blue-700 hover:underline">
          {t("done.products")}
        </Link>
      </div>
    );
  }

  const nextLabel =
    step === "review"
      ? t("nav.submit")
      : skippingPrice
        ? t("nav.skipPrice")
        : t("nav.next", { step: t(`steps.${PRODUCT_STEPS[stepIndex + 1]}`) });

  return (
    <div className="mx-auto w-full max-w-2xl pb-36">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <StepBar
          steps={PRODUCT_STEPS.map((s) => t(`steps.${s}`))}
          current={stepIndex}
          maxReachable={maxIndex}
          onSelect={(i) => goTo(PRODUCT_STEPS[i])}
        />
        <Link href="/products" className="text-sm text-gray-500 hover:text-gray-800">
          {t("nav.exit")}
        </Link>
      </div>

      {savedDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="flex items-center gap-2 text-sm text-blue-950">
            <History className="h-4 w-4 shrink-0" />
            {t("resume.message", { name: savedDraft.name.trim() || savedDraft.sku.trim() || t("resume.unnamed") })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setDraft(savedDraft);
                setSavedDraft(null);
                goTo(firstBlockedStep(savedDraft, catalog));
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

      <div key={step} className="animate-in fade-in slide-in-from-right-2 duration-200">
        {step === "product" && <StepIdentity draft={draft} set={set} catalog={catalog} />}
        {step === "price" && <StepPrice draft={draft} set={set} />}
        {step === "stock" && <StepStock draft={draft} set={set} />}
        {step === "review" && <StepReview draft={draft} catalog={catalog} goTo={goTo} />}
      </div>

      {/* Sticky bottom bar: back/next, with the reason when next is disabled */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur md:left-16">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Button
            variant="outline"
            className="h-12 gap-1.5"
            onClick={() => (stepIndex === 0 ? router.push("/products") : goTo(PRODUCT_STEPS[stepIndex - 1]))}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("nav.back")}
          </Button>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
            {(blockers.length > 0 || submitError) && (
              <p className="min-w-0 truncate text-right text-sm text-red-600" role="status">
                {submitError ?? t(`blocked.${blockers[0]}`)}
              </p>
            )}
            <Button
              onClick={next}
              disabled={blockers.length > 0 || submitting}
              variant={skippingPrice ? "outline" : "default"}
              className={`h-12 shrink-0 gap-1.5 px-5 ${step === "review" ? "bg-green-600 hover:bg-green-700" : ""}`}
              title={step === "review" || skippingPrice ? undefined : "Enter"}
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
