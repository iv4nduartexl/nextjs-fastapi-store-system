"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  createPurchase,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
  SupplierCreate,
} from "@/components/actions/purchases-action";
import type { ItemRead } from "@/app/openapi-client";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import {
  ArrowLeft,
  Search,
  Plus,
  X,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Landmark,
  PackageSearch,
  Tag,
} from "lucide-react";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { SupplierCombobox } from "@/components/ui/suppliers-combobox";
import { UUID } from "crypto";

interface LineItem {
  itemId?: string;
  itemName: string;
  unitType: string;
  quantity: number;
  costPrice: number;
  totalCostPrice: number;
  sellPrice?: number;
  sku?: string;
  category?: string;
  // For linked products — used to decide overwrite confirmation
  existingStock?: number;
  existingPrice?: number;
  // Original catalog values — to highlight unchanged fields in blue
  catalogSku?: string;
  catalogCategory?: string;
}

const UNIT_TYPES = ["unit", "gram", "liter", "pack"];

const PAYMENT_METHODS: {
  value: PurchasePaymentMethod;
  icon: React.ElementType;
}[] = [
  { value: "cash", icon: Banknote },
  { value: "card", icon: CreditCard },
  { value: "transfer", icon: ArrowRightLeft },
  { value: "credit", icon: Landmark },
];

const PAYMENT_STATUSES: PurchasePaymentStatus[] = ["paid", "unpaid", "partial"];

export default function NewPurchasePage() {
  const t = useTranslations("purchases");
  const tDash = useTranslations("dashboard");
  const router = useRouter();

  // Header fields
  const [supplier, setSupplier] = useState<SupplierCreate>({ name: "" });
  const [referenceNumber, setReferenceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<Date | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PurchasePaymentMethod>("cash");
  const [paymentStatus, setPaymentStatus] =
    useState<PurchasePaymentStatus>("paid");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");

  // Items
  const [lines, setLines] = useState<LineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ItemRead[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [metaModal, setMetaModal] = useState<number | null>(null);
  // Overwrite confirmation modal
  const [overwriteModal, setOverwriteModal] = useState(false);
  const [pendingOverwrites, setPendingOverwrites] = useState<number[]>([]); // line indices

  // Product search debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/items?size=20&q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items ?? []);
          setSearchOpen(true);
        }
      } catch {
        /* silent */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addLineFromProduct(product: ItemRead) {
    setLines((prev) => [
      ...prev,
      {
        itemId: product.id as string,
        itemName: product.name,
        unitType: product.unit_type ?? "unit",
        quantity: 1,
        totalCostPrice: 0,
        costPrice: 0,
        sellPrice: product.price != null ? Number(product.price) : undefined,
        existingStock: product.stock != null ? Number(product.stock) : 0,
        existingPrice:
          product.price != null ? Number(product.price) : undefined,
        sku: product.sku ?? undefined,
        category: product.category ?? undefined,
        catalogSku: product.sku ?? undefined,
        catalogCategory: product.category ?? undefined,
      },
    ]);
    setSearchQuery("");
    setSearchOpen(false);
  }

  function addBlankLine() {
    setLines((prev) => [
      ...prev,
      {
        itemName: "",
        unitType: "unit",
        quantity: 1,
        totalCostPrice: 0,
        costPrice: 0,
        sku: "",
        category: "",
      },
    ]);
  }

  function updateLine<K extends keyof LineItem>(
    index: number,
    field: K,
    value: LineItem[K],
  ) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce((s, l) => {
    // Gram: totalCostPrice is per 1000g (per kg). Subtotal = Sum(price)
    return s + l.totalCostPrice;
  }, 0);
  const taxNum = parseFloat(tax) || 0;
  const totalCost = subtotal + taxNum;

  async function handleSubmit() {
    if (lines.length === 0) {
      setErrorMsg(t("form.noItems"));
      return;
    }
    if (lines.some((l) => !l.itemName.trim())) {
      setErrorMsg(t("form.noNameItems"));
      return;
    }
    if (lines.some((l) => !l.totalCostPrice)) {
      setErrorMsg(t("form.noPriceItems"));
      return;
    }

    // Check if any linked product has existing stock AND a changed sell price
    const needsConfirm = lines
      .map((l, i) => ({ l, i }))
      .filter(
        ({ l }) =>
          l.itemId &&
          l.sellPrice !== undefined &&
          (l.existingStock ?? 0) > 0 &&
          l.sellPrice !== l.existingPrice,
      )
      .map(({ i }) => i);

    if (needsConfirm.length > 0 && !overwriteModal) {
      setPendingOverwrites(needsConfirm);
      setOverwriteModal(true);
      return;
    }

    await doSubmit();
  }

  async function doSubmit(confirmedOverwrites?: number[]) {
    const overwriteSet = new Set(confirmedOverwrites ?? []);
    setSubmitting(true);
    setErrorMsg("");


    const result = await createPurchase({
      supplier: supplier || undefined,
      reference_number: referenceNumber || undefined,
      purchase_date: purchaseDate ? purchaseDate.toISOString() : undefined,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      tax: taxNum,
      notes: notes || undefined,
      items: lines.map((l, i) => ({
        item_id: l.itemId,
        item_name: l.itemName,
        unit_type: l.unitType,
        quantity: l.quantity,
        total_cost_price: l.totalCostPrice,
        sku: l.sku || undefined,
        category: l.category || undefined,
        sell_price: l.sellPrice !== undefined ? l.sellPrice : undefined,
        overwrite_sell_price: overwriteSet.has(i),
      })),
    });

    setSubmitting(false);
    if (result.error) {
      setErrorMsg(result.error);
    } else if (result.data) {
      router.push(`/purchases/${result.data.id}`);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          {t("detail.back")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t("form.title")}</h1>
        <p className="text-gray-500 mt-1 text-sm">{t("form.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Supplier + Settings ── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Supplier card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {t("form.supplierSection")}
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">
                {t("form.supplierName")}
              </label>
              <SupplierCombobox
                onChange={(supplier) => setSupplier(supplier)}
                placeholder={t("form.supplierNamePlaceholder")}
                className="w-full"
                value={supplier}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">
                {t("form.referenceNumber")}
              </label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder={t("form.referenceNumberPlaceholder")}
                className="h-9 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">
                {t("form.purchaseDate")}
              </label>
              <Input
                type="date"
                value={purchaseDate ? purchaseDate.toISOString().slice(0, 10) : ""}
                onChange={(e) => setPurchaseDate(e.target.value ? new Date(e.target.value) : null)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Payment card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {t("form.paymentMethod")}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentMethod(value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                    paymentMethod === value
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Icon size={14} />
                  {t(`paymentMethod.${value}`)}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">
                {t("form.paymentStatus")}
              </label>
              <div className="flex gap-2">
                {PAYMENT_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPaymentStatus(s)}
                    className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                      paymentStatus === s
                        ? s === "paid"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : s === "unpaid"
                            ? "border-red-400 bg-red-50 text-red-700"
                            : "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {t(`paymentStatus.${s}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              {t("form.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("form.notesPlaceholder")}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>

        {/* ── Right: Items + Summary ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Items card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {t("form.itemsSection")}
              </h2>
            </div>

            {/* Product search */}
            <div className="px-5 pt-4 pb-2 relative">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={14}
                />
                <Input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("form.searchProduct")}
                  className="pl-8 h-9 text-sm bg-gray-50"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Dropdown results */}
              {searchOpen && searchResults.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute left-5 right-5 top-full z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                >
                  {searchResults.map((p) => (
                    <button
                      key={p.id as string}
                      type="button"
                      onClick={() => addLineFromProduct(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left text-sm"
                    >
                      <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] font-black text-gray-500 shrink-0">
                        {tDash(`unitAbbr.${p.unit_type ?? "unit"}`)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {p.name}
                        </p>
                        {p.category && (
                          <p className="text-xs text-gray-400 truncate">
                            {p.category}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Line items table */}
            {lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-14">
                        {t("form.unitType")}
                      </th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        {t("form.productName")}
                      </th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-24">
                        {t("form.qty")}
                      </th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-32">
                        {t("form.totalCostPrice")}
                      </th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-12">
                        {t("form.details")}
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lines.map((line, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {/* Unit select */}
                        <td className="px-5 py-2">
                          <select
                            value={line.unitType}
                            onChange={(e) =>
                              updateLine(i, "unitType", e.target.value)
                            }
                            className="w-14 text-[11px] font-black text-gray-500 bg-gray-100 rounded-lg text-center py-1.5 px-1 border-0 focus:ring-1 focus:ring-green-400 appearance-none"
                          >
                            {UNIT_TYPES.map((u) => (
                              <option key={u} value={u}>
                                {tDash(`unitAbbr.${u}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* Name */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={line.itemName}
                              onChange={(e) =>
                                updateLine(i, "itemName", e.target.value)
                              }
                              placeholder={t("form.productNamePlaceholder")}
                              readOnly={!!line.itemId}
                              className={`h-8 text-sm border-0 bg-transparent p-0 focus:ring-0 font-medium flex-1 min-w-0 ${
                                line.itemId
                                  ? "text-gray-700 cursor-default select-none"
                                  : ""
                              }`}
                            />
                            {line.itemId && (
                              <span
                                className="shrink-0 w-1.5 h-1.5 rounded-full bg-green-400"
                                title={t("detail.linked")}
                              />
                            )}
                          </div>
                        </td>
                        {/* Qty */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={String(line.quantity)}
                            onBlur={() => {
                              if (!line.quantity) {
                                updateLine(i, "quantity", 1);
                              }
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              updateLine(
                                i,
                                "quantity",
                                raw ? parseInt(raw, 10) : 0,
                              );
                            }}
                            className="h-8 text-sm text-right font-mono w-full"
                          />
                        </td>
                        {/* Total cost price */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={
                              line.totalCostPrice === 0
                                ? ""
                                : formatNumber(line.totalCostPrice)
                            }
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              updateLine(
                                i,
                                "totalCostPrice",
                                raw ? parseInt(raw, 10) : 0,
                              );
                            }}
                            placeholder="0"
                            className="h-8 text-sm text-right font-mono w-full rounded-md border border-input bg-background px-3 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        {/* Additional details */}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setMetaModal(i)}
                            title={t("form.additionalDetailsTitle")}
                            className={`p-1.5 rounded-lg transition-colors ${
                              line.itemId
                                ? line.sellPrice !== undefined &&
                                  line.sellPrice !== line.existingPrice
                                  ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                                  : line.sellPrice !== undefined
                                    ? "text-blue-500 bg-blue-50 hover:bg-blue-100"
                                    : "text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                                : line.sku ||
                                    line.category ||
                                    line.sellPrice !== undefined
                                  ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                                  : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            <Tag size={14} />
                          </button>
                        </td>
                        {/* Remove */}
                        <td className="pr-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <PackageSearch size={32} className="text-gray-200" />
                <p className="text-sm">{t("form.noItems")}</p>
              </div>
            )}

            {/* Add blank line */}
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={addBlankLine}
                className="inline-flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium"
              >
                <Plus size={15} />
                {t("form.addItem")}
              </button>
            </div>
          </div>

          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {t("form.summarySection")}
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("form.subtotalLabel")}</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span>{t("form.taxLabel")}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    placeholder={t("form.taxPlaceholder")}
                    className="h-7 w-28 text-right text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-gray-200 font-bold text-gray-900">
                <span>{t("form.totalLabel")}</span>
                <span className="text-xl font-black tabular-nums">
                  {formatCurrency(totalCost)}
                </span>
              </div>
            </div>

            {errorMsg && (
              <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                {errorMsg}
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                lines.length === 0 ||
                totalCost <= 0 ||
                isNaN(totalCost)
              }
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-11 mt-1"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── SKU / Category modal ── */}
      {metaModal !== null && lines[metaModal] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMetaModal(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-amber-500" />
                <h3 className="font-semibold text-gray-800 text-sm">
                  {t("form.metaModalTitle")}
                </h3>
              </div>
              <button
                onClick={() => setMetaModal(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* SKU + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {t("form.sku")}
                  </label>
                  <Input
                    value={lines[metaModal].sku ?? ""}
                    onChange={(e) =>
                      updateLine(metaModal!, "sku", e.target.value || undefined)
                    }
                    placeholder={t("form.skuPlaceholder")}
                    className={`h-9 text-sm font-mono ${
                      lines[metaModal].sku &&
                      lines[metaModal].sku === lines[metaModal].catalogSku
                        ? "text-blue-600"
                        : ""
                    }`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {t("form.category")}
                  </label>
                  <CategoryCombobox
                    value={lines[metaModal].category ?? ""}
                    onChange={(v) =>
                      updateLine(metaModal!, "category", v || undefined)
                    }
                    placeholder={t("form.categoryPlaceholder")}
                    inputClassName={
                      lines[metaModal].category &&
                      lines[metaModal].category ===
                        lines[metaModal].catalogCategory
                        ? "text-blue-600"
                        : ""
                    }
                  />
                </div>
              </div>

              {/* Unit + Quantity — side by side, always editable */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {t("form.unitType")}
                  </label>
                  <select
                    value={lines[metaModal].unitType}
                    onChange={(e) =>
                      updateLine(metaModal!, "unitType", e.target.value)
                    }
                    className="w-full h-9 text-sm bg-gray-50 rounded-lg border border-gray-200 px-2 focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {tDash(`unitAbbr.${u}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {t("form.qty")}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    onBlur={() => {
                      if (!lines[metaModal].quantity) {
                        updateLine(metaModal!, "quantity", 1);
                      }
                    }}
                    value={String(lines[metaModal].quantity)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      updateLine(
                        metaModal!,
                        "quantity",
                        raw ? parseInt(raw, 10) : 0,
                      );
                    }}
                    className="h-9 text-sm text-right font-mono"
                  />
                </div>
              </div>

              {/* Product name — editable for new products only */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  {t("form.productName")}
                </label>
                {lines[metaModal].itemId ? (
                  <p className="h-9 flex items-center px-3 rounded-lg bg-gray-50 border border-gray-100 text-sm font-medium text-gray-700 truncate">
                    {lines[metaModal].itemName}
                    <span className="ml-2 text-[10px] text-green-600 font-semibold shrink-0">
                      ✓ {t("detail.linked")}
                    </span>
                  </p>
                ) : (
                  <Input
                    autoFocus
                    value={lines[metaModal].itemName}
                    onChange={(e) =>
                      updateLine(metaModal!, "itemName", e.target.value)
                    }
                    placeholder={t("form.productNamePlaceholder")}
                    className="h-9 text-sm"
                  />
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />
              {/* Cost price */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  {t("form.totalCostPrice")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    lines[metaModal].totalCostPrice === 0
                      ? ""
                      : formatNumber(lines[metaModal].totalCostPrice)
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    updateLine(
                      metaModal!,
                      "totalCostPrice",
                      raw ? parseInt(raw, 10) : 0,
                    );
                  }}
                  placeholder="0"
                  className="w-full h-9 text-sm text-right rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-[11px] text-amber-600">
                  {lines[metaModal].unitType === "gram"
                    ? t("form.perKgHint")
                    : t("form.costPrice")}
                  {" = "}
                  {lines[metaModal].unitType === "gram"
                    ? formatCurrency(
                        (1000 * lines[metaModal].totalCostPrice) /
                          lines[metaModal].quantity,
                        2,
                      )
                    : formatCurrency(
                        lines[metaModal].totalCostPrice /
                          lines[metaModal].quantity,
                        2,
                      )}
                </span>
              </div>

              {/* Sell price — all products */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-blue-600">
                  {t("form.sellPrice")}
                </label>
                {lines[metaModal].itemId &&
                  lines[metaModal].existingPrice !== undefined && (
                    <p className="text-[11px] text-gray-400">
                      {t("form.currentSellPrice")}:{" "}
                      {lines[metaModal].existingPrice! > 0
                        ? formatCurrency(lines[metaModal].existingPrice!)
                        : "—"}
                    </p>
                  )}
                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    lines[metaModal].sellPrice === undefined ||
                    lines[metaModal].sellPrice === 0
                      ? ""
                      : formatNumber(lines[metaModal].sellPrice!)
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    updateLine(
                      metaModal!,
                      "sellPrice",
                      raw ? parseInt(raw, 10) : undefined,
                    );
                  }}
                  placeholder={t("form.sellPricePlaceholder")}
                  className="w-full h-11 text-2xl font-black text-right rounded-xl border border-blue-200 bg-blue-50 px-4 font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {lines[metaModal].itemId &&
                  (lines[metaModal].existingStock ?? 0) > 0 &&
                  lines[metaModal].sellPrice !== undefined &&
                  lines[metaModal].sellPrice !==
                    lines[metaModal].existingPrice && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                      ⚠ {t("form.sellPriceOverwriteWarn")}
                    </p>
                  )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <Button
                onClick={() => setMetaModal(null)}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold h-10 text-sm"
              >
                {t("form.metaDone")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Sell price overwrite confirmation ── */}
      {overwriteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOverwriteModal(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-amber-500" />
                <h3 className="font-semibold text-gray-800 text-sm">
                  {t("form.overwritePriceTitle")}
                </h3>
              </div>
              <button
                onClick={() => setOverwriteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                {t("form.overwritePriceDesc")}
              </p>
              <div className="space-y-2">
                {pendingOverwrites.map((idx) => {
                  const l = lines[idx];
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-amber-50 rounded-xl px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {l.itemName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t("form.currentSellPrice")}:{" "}
                          {l.existingPrice
                            ? formatCurrency(l.existingPrice)
                            : "—"}
                          {" → "}
                          <span className="font-bold text-blue-600">
                            {formatCurrency(l.sellPrice ?? 0)}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOverwriteModal(false);
                    // Keep sell prices but don't overwrite existing stock
                    doSubmit([]);
                  }}
                  className="h-10 text-sm"
                >
                  {t("form.overwriteNo")}
                </Button>
                <Button
                  onClick={() => {
                    setOverwriteModal(false);
                    doSubmit(pendingOverwrites);
                  }}
                  className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {t("form.overwriteYes")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
