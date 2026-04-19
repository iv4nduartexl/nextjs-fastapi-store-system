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
} from "@/components/actions/purchases-action";
import type { ItemRead } from "@/app/openapi-client";
import { formatCurrency } from "@/lib/currency";
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

interface LineItem {
  itemId?: string;
  itemName: string;
  unitType: string;
  quantity: number;
  costPrice: number;
  sku?: string;
  category?: string;
}

const UNIT_TYPES = ["unit", "kg", "gram", "liter", "pack"];

const PAYMENT_METHODS: { value: PurchasePaymentMethod; icon: React.ElementType }[] = [
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
  const [supplierName, setSupplierName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>("cash");
  const [paymentStatus, setPaymentStatus] = useState<PurchasePaymentStatus>("paid");
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

  // Product search debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setSearchOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?size=20&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items ?? []);
          setSearchOpen(true);
        }
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
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
        costPrice: 0,
      },
    ]);
    setSearchQuery("");
    setSearchOpen(false);
  }

  function addBlankLine() {
    setLines((prev) => [
      ...prev,
      { itemName: "", unitType: "unit", quantity: 1, costPrice: 0, sku: "", category: "" },
    ]);
  }

  function updateLine<K extends keyof LineItem>(index: number, field: K, value: LineItem[K]) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce((s, l) => {
    // Gram type: costPrice IS the total for the batch, not per unit
    return s + (l.unitType === "gram" ? l.costPrice : l.costPrice * l.quantity);
  }, 0);
  const taxNum = parseFloat(tax) || 0;
  const totalCost = subtotal + taxNum;

  async function handleSubmit() {
    if (lines.length === 0) { setErrorMsg(t("form.noItems")); return; }
    if (lines.some((l) => !l.itemName.trim())) {
      setErrorMsg("All items need a product name.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");

    const result = await createPurchase({
      supplier_name: supplierName || undefined,
      reference_number: referenceNumber || undefined,
      purchase_date: new Date(purchaseDate).toISOString(),
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      tax: taxNum,
      notes: notes || undefined,
      items: lines.map((l) => ({
        item_id: l.itemId,
        item_name: l.itemName,
        unit_type: l.unitType,
        quantity: l.quantity,
        cost_price: l.costPrice, // gram type: backend treats as total cost
        sku: l.sku || undefined,
        category: l.category || undefined,
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
              <label className="text-xs font-medium text-gray-600">{t("form.supplierName")}</label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder={t("form.supplierNamePlaceholder")}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t("form.referenceNumber")}</label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder={t("form.referenceNumberPlaceholder")}
                className="h-9 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t("form.purchaseDate")}</label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
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
              <label className="text-xs font-medium text-gray-600">{t("form.paymentStatus")}</label>
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
            <label className="text-xs font-medium text-gray-600 block mb-1.5">{t("form.notes")}</label>
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <Input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("form.searchProduct")}
                  className="pl-8 h-9 text-sm bg-gray-50"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
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
                        <p className="font-medium text-gray-800 truncate">{p.name}</p>
                        {p.category && <p className="text-xs text-gray-400 truncate">{p.category}</p>}
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
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-24">
                        {t("form.qty")}
                      </th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-32">
                        {t("form.costPrice")}
                      </th>
                      <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">
                        {t("form.subtotal")}
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
                            onChange={(e) => updateLine(i, "unitType", e.target.value)}
                            className="w-14 text-[11px] font-black text-gray-500 bg-gray-100 rounded-lg text-center py-1.5 px-1 border-0 focus:ring-1 focus:ring-green-400 appearance-none"
                          >
                            {UNIT_TYPES.map((u) => (
                              <option key={u} value={u}>
                                {tDash(`unitAbbr.${u}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* Name + Tag icon */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Input
                              value={line.itemName}
                              onChange={(e) => updateLine(i, "itemName", e.target.value)}
                              placeholder={t("form.productNamePlaceholder")}
                              className="h-8 text-sm border-0 bg-transparent p-0 focus:ring-0 font-medium flex-1 min-w-0"
                            />
                            {line.itemId ? (
                              <span className="shrink-0 text-[10px] text-green-600 font-medium whitespace-nowrap">
                                ✓ {t("detail.linked")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                title={t("form.metaModalTitle")}
                                onClick={() => setMetaModal(i)}
                                className={`shrink-0 p-1 rounded-md transition-colors ${
                                  line.sku || line.category
                                    ? "text-amber-500 hover:text-amber-600 bg-amber-50 hover:bg-amber-100"
                                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                                }`}
                              >
                                <Tag size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                        {/* Qty */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0.001}
                            step={line.unitType === "kg" || line.unitType === "gram" || line.unitType === "liter" ? 0.001 : 1}
                            value={line.quantity}
                            onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 1)}
                            className="h-8 text-sm text-right font-mono w-full"
                          />
                        </td>
                        {/* Cost price */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={line.costPrice === 0 ? "" : line.costPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              updateLine(i, "costPrice", raw ? parseInt(raw, 10) : 0);
                            }}
                            placeholder="0"
                            className="h-8 text-sm text-right font-mono w-full rounded-md border border-input bg-background px-3 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        {/* Line subtotal */}
                        <td className="px-5 py-2 text-right tabular-nums">
                          {line.unitType === "gram" ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md leading-none uppercase tracking-wide">
                                TOTAL
                              </span>
                              <span className="text-[10px] text-amber-600 leading-tight text-right max-w-[7rem]">
                                {t("form.costPriceTotalDesc")}
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono font-semibold text-gray-800">
                              {formatCurrency(line.costPrice * line.quantity)}
                            </span>
                          )}
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
                <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
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
                <span className="text-xl font-black tabular-nums">{formatCurrency(totalCost)}</span>
              </div>
            </div>

            {errorMsg && (
              <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || lines.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-11 mt-1"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── SKU / Category modal ── */}
      {metaModal !== null && lines[metaModal] && !lines[metaModal].itemId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setMetaModal(null); }}
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

            <div className="px-5 pt-4 pb-0">
              <p className="text-xs text-gray-400 mb-3 truncate font-medium">
                {lines[metaModal].itemName || t("form.productNamePlaceholder")}
              </p>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">{t("form.sku")}</label>
                <Input
                  autoFocus
                  value={lines[metaModal].sku ?? ""}
                  onChange={(e) => updateLine(metaModal!, "sku", e.target.value)}
                  placeholder={t("form.skuPlaceholder")}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">{t("form.category")}</label>
                <Input
                  value={lines[metaModal].category ?? ""}
                  onChange={(e) => updateLine(metaModal!, "category", e.target.value)}
                  placeholder={t("form.categoryPlaceholder")}
                  className="h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") setMetaModal(null); }}
                />
              </div>
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
    </div>
  );
}
