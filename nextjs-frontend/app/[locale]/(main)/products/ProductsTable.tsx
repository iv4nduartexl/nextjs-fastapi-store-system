"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ItemRead } from "@/app/openapi-client";
import {
  createItemDiscountRule,
  deleteDiscountRule,
  fetchItemDiscountRules,
  QuantityDiscountRuleRead,
  removeItem,
  updateDiscountRule,
  updateItem,
} from "@/components/actions/items-action";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { Pencil, Trash2, X } from "lucide-react";
import { unitTypes } from "@/lib/definitions";
import { formatNumber } from "@/lib/format-number";

interface Props {
  items: ItemRead[];
}

type RuleType = "percent" | "fixed_price" | "buy_x_get_y";

type DiscountRuleFormState = {
  name: string;
  min_qty: string;
  rule_type: RuleType;
  percent_off: string;
  fixed_unit_price: string;
  buy_qty: string;
  free_qty: string;
  priority: string;
  is_active: boolean;
};

const emptyDiscountForm: DiscountRuleFormState = {
  name: "",
  min_qty: "1",
  rule_type: "fixed_price",
  percent_off: "",
  fixed_unit_price: "",
  buy_qty: "",
  free_qty: "",
  priority: "100",
  is_active: true,
};

function describeRule(rule: QuantityDiscountRuleRead, t: ReturnType<typeof useTranslations>) {
  if (rule.rule_type === "percent" && rule.percent_off) {
    return `${rule.percent_off}% ${t("discountOff")}`;
  }
  if (rule.rule_type === "fixed_price" && rule.fixed_unit_price) {
    return `${t("discountFixedPrice")}: ${formatCurrency(rule.fixed_unit_price)}`;
  }
  if (rule.rule_type === "buy_x_get_y" && rule.buy_qty && rule.free_qty) {
    return `${t("discountBuyXGetY")}: ${rule.buy_qty} + ${rule.free_qty}`;
  }
  return t("discountRuleIncomplete");
}

function toDiscountForm(rule: QuantityDiscountRuleRead): DiscountRuleFormState {
  return {
    name: rule.name,
    min_qty: rule.min_qty,
    rule_type: rule.rule_type,
    percent_off: rule.percent_off ?? "",
    fixed_unit_price: rule.fixed_unit_price ?? "",
    buy_qty: rule.buy_qty ?? "",
    free_qty: rule.free_qty ?? "",
    priority: rule.priority,
    is_active: rule.is_active,
  };
}

export function ProductsTable({ items }: Props) {
  const t = useTranslations("products");
  const tTable = useTranslations("dashboard");
  const router = useRouter();

  const [editTarget, setEditTarget] = useState<ItemRead | null>(null);
  const [editForm, setEditForm] = useState<Partial<ItemRead>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [discountRules, setDiscountRules] = useState<QuantityDiscountRuleRead[]>([]);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountDeletingId, setDiscountDeletingId] = useState<string | null>(null);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [discountForm, setDiscountForm] =
    useState<DiscountRuleFormState>(emptyDiscountForm);

  const [deleteTarget, setDeleteTarget] = useState<ItemRead | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function loadDiscountRules(itemId: string) {
    setDiscountLoading(true);
    const result = await fetchItemDiscountRules(itemId);
    setDiscountLoading(false);
    if (result.error) {
      setDiscountError(result.error);
      return;
    }
    setDiscountRules(result.data ?? []);
  }

  async function openEdit(item: ItemRead) {
    setEditTarget(item);
    setEditForm({ ...item });
    setEditError("");
    setDiscountError("");
    setEditingDiscountId(null);
    setDiscountForm(emptyDiscountForm);
    await loadDiscountRules(item.id as string);
  }

  function closeEdit() {
    setEditTarget(null);
    setEditError("");
    setDiscountError("");
    setDiscountRules([]);
    setEditingDiscountId(null);
    setDiscountForm(emptyDiscountForm);
  }

  async function handleSave() {
    if (!editTarget) return;
    setEditLoading(true);
    setEditError("");
    const result = await updateItem(editTarget.id as string, {
      name: editForm.name,
      description: editForm.description,
      sku: editForm.sku,
      category: editForm.category,
      unit_type: editForm.unit_type,
      stock:
        editForm.stock != null
          ? parseFloat(editForm.stock as unknown as string)
          : undefined,
      min_stock:
        editForm.min_stock != null
          ? parseFloat(editForm.min_stock as unknown as string)
          : null,
      price:
        editForm.price != null
          ? parseFloat(editForm.price as unknown as string)
          : null,
    });
    setEditLoading(false);
    if (result?.error) {
      setEditError(result.error as string);
    } else {
      closeEdit();
      router.refresh();
    }
  }

  async function handleDiscountSave() {
    if (!editTarget) return;
    setDiscountSaving(true);
    setDiscountError("");

    const payload = {
      name: discountForm.name.trim(),
      min_qty: parseFloat(discountForm.min_qty || "0"),
      rule_type: discountForm.rule_type,
      percent_off:
        discountForm.rule_type === "percent"
          ? parseFloat(discountForm.percent_off || "0")
          : null,
      fixed_unit_price:
        discountForm.rule_type === "fixed_price"
          ? parseFloat(discountForm.fixed_unit_price || "0")
          : null,
      buy_qty:
        discountForm.rule_type === "buy_x_get_y"
          ? parseFloat(discountForm.buy_qty || "0")
          : null,
      free_qty:
        discountForm.rule_type === "buy_x_get_y"
          ? parseFloat(discountForm.free_qty || "0")
          : null,
      priority: parseFloat(discountForm.priority || "100"),
      is_active: discountForm.is_active,
    };

    const result = editingDiscountId
      ? await updateDiscountRule(editingDiscountId, payload)
      : await createItemDiscountRule(editTarget.id as string, payload);

    setDiscountSaving(false);
    if (result.error) {
      setDiscountError(result.error);
      return;
    }

    setEditingDiscountId(null);
    setDiscountForm(emptyDiscountForm);
    await loadDiscountRules(editTarget.id as string);
  }

  async function handleDiscountDelete(ruleId: string) {
    if (!editTarget) return;
    setDiscountDeletingId(ruleId);
    setDiscountError("");
    const result = await deleteDiscountRule(ruleId);
    setDiscountDeletingId(null);
    if (result.error) {
      setDiscountError(result.error);
      return;
    }
    if (editingDiscountId === ruleId) {
      setEditingDiscountId(null);
      setDiscountForm(emptyDiscountForm);
    }
    await loadDiscountRules(editTarget.id as string);
  }

  function startDiscountEdit(rule: QuantityDiscountRuleRead) {
    setEditingDiscountId(rule.id);
    setDiscountForm(toDiscountForm(rule));
    setDiscountError("");
  }

  function resetDiscountForm() {
    setEditingDiscountId(null);
    setDiscountForm(emptyDiscountForm);
    setDiscountError("");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    await removeItem(deleteTarget.id as string);
    setDeleteLoading(false);
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <th className="text-left px-4 py-3">{tTable("table.name")}</th>
            <th className="text-left px-4 py-3">{tTable("table.sku")}</th>
            <th className="text-left px-4 py-3">{tTable("table.category")}</th>
            <th className="text-center px-4 py-3">{tTable("table.soldBy")}</th>
            <th className="text-right px-4 py-3">{tTable("table.stock")}</th>
            <th className="text-right px-4 py-3">{tTable("table.price")}</th>
            <th className="text-center px-4 py-3 w-24">
              {tTable("table.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-10 text-gray-400">
                {tTable("noResults")}
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const lowStock =
                item.min_stock != null &&
                parseFloat(item.stock ?? "0") <=
                  parseFloat(item.min_stock as unknown as string);
              return (
                <tr
                  key={item.id as string}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {item.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.category ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {tTable(`unitTypes.${item.unit_type ?? "unit"}`)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${lowStock ? "text-red-500 font-semibold" : ""}`}
                  >
                    {formatNumber(item.stock, 2) ?? "0"}{" "}
                    {lowStock && <span title="Low stock">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.price != null
                      ? formatCurrency(item.price as unknown as string)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title={tTable("table.edit")}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title={tTable("table.delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* ── Edit modal ── */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditTarget(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Pencil size={15} className="text-blue-500" />
                <h3 className="font-semibold text-gray-800 text-sm">
                  {t("editProduct")}
                </h3>
              </div>
              <button
                onClick={closeEdit}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(80vh - 130px)" }}>
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  {tTable("table.name")} *
                </label>
                <Input
                  autoFocus
                  value={editForm.name ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="h-9 text-sm"
                />
              </div>

              {/* SKU + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {tTable("table.sku")}
                  </label>
                  <Input
                    value={editForm.sku ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        sku: e.target.value || undefined,
                      }))
                    }
                    placeholder="SKU"
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {tTable("table.category")}
                  </label>
                  <CategoryCombobox
                    value={editForm.category ?? ""}
                    onChange={(v) =>
                      setEditForm((f) => ({ ...f, category: v || undefined }))
                    }
                    placeholder="Category"
                  />
                </div>
              </div>

              {/* Unit type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  {tTable("table.soldBy")}
                </label>
                <select
                  value={editForm.unit_type ?? "unit"}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      unit_type: e.target.value as ItemRead["unit_type"],
                    }))
                  }
                  className="w-full h-9 text-sm bg-gray-50 rounded-lg border border-gray-200 px-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {unitTypes.map((u) => (
                    <option key={u} value={u}>
                      {tTable(`unitTypes.${u}`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock + Min stock */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {tTable("table.stock")}
                  </label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={editForm.stock ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        stock: e.target.value as unknown as string & number,
                      }))
                    }
                    className="h-9 text-sm text-right font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {t("minStock")}
                  </label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={editForm.min_stock ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        min_stock: e.target.value as unknown as string & number,
                      }))
                    }
                    placeholder="—"
                    className="h-9 text-sm text-right font-mono"
                  />
                </div>
              </div>

              {/* Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  {tTable("table.price")}
                  {(editForm.unit_type ?? "unit") === "gram" && (
                    <span className="ml-1 text-[10px] text-gray-400">
                      (/kg)
                    </span>
                  )}
                </label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editForm.price ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      price: e.target.value as unknown as string & number,
                    }))
                  }
                  placeholder="—"
                  className="h-9 text-sm text-right font-mono"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  {t("description")}
                </label>
                <textarea
                  value={editForm.description ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      description: e.target.value || undefined,
                    }))
                  }
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">
                      {t("discountRulesTitle")}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {t("discountRulesSubtitle")}
                    </p>
                  </div>
                  {editingDiscountId && (
                    <button
                      type="button"
                      onClick={resetDiscountForm}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                    >
                      {t("discountNewRule")}
                    </button>
                  )}
                </div>

                {discountLoading ? (
                  <p className="text-xs text-gray-400">{t("discountLoading")}</p>
                ) : discountRules.length === 0 ? (
                  <p className="text-xs text-gray-400">{t("discountEmpty")}</p>
                ) : (
                  <div className="space-y-2">
                    {discountRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">
                              {rule.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {describeRule(rule, t)}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {t("discountMinQty")}: {rule.min_qty}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                rule.is_active
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-200 text-gray-600"
                              }`}
                            >
                              {rule.is_active
                                ? t("discountActive")
                                : t("discountInactive")}
                            </span>
                            <button
                              type="button"
                              onClick={() => startDiscountEdit(rule)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                            >
                              {tTable("table.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscountDelete(rule.id)}
                              disabled={discountDeletingId === rule.id}
                              className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                            >
                              {discountDeletingId === rule.id
                                ? t("deleting")
                                : tTable("table.delete")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        {t("discountRuleName")}
                      </label>
                      <Input
                        value={discountForm.name}
                        onChange={(e) =>
                          setDiscountForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        {t("discountMinQty")}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={discountForm.min_qty}
                        onChange={(e) =>
                          setDiscountForm((prev) => ({
                            ...prev,
                            min_qty: e.target.value,
                          }))
                        }
                        className="h-9 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        {t("discountRuleType")}
                      </label>
                      <select
                        value={discountForm.rule_type}
                        onChange={(e) =>
                          setDiscountForm((prev) => ({
                            ...prev,
                            rule_type: e.target.value as RuleType,
                          }))
                        }
                        className="w-full h-9 text-sm bg-white rounded-lg border border-gray-200 px-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="fixed_price">{t("discountTypeFixedPrice")}</option>
                        <option value="percent">{t("discountTypePercent")}</option>
                        <option value="buy_x_get_y">{t("discountTypeBuyXGetY")}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        {t("discountPriority")}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={discountForm.priority}
                        onChange={(e) =>
                          setDiscountForm((prev) => ({
                            ...prev,
                            priority: e.target.value,
                          }))
                        }
                        className="h-9 text-sm font-mono"
                      />
                    </div>
                  </div>

                  {discountForm.rule_type === "percent" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        {t("discountPercentOff")}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountForm.percent_off}
                        onChange={(e) =>
                          setDiscountForm((prev) => ({
                            ...prev,
                            percent_off: e.target.value,
                          }))
                        }
                        className="h-9 text-sm font-mono"
                      />
                    </div>
                  )}

                  {discountForm.rule_type === "fixed_price" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        {t("discountFixedPrice")}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountForm.fixed_unit_price}
                        onChange={(e) =>
                          setDiscountForm((prev) => ({
                            ...prev,
                            fixed_unit_price: e.target.value,
                          }))
                        }
                        className="h-9 text-sm font-mono"
                      />
                    </div>
                  )}

                  {discountForm.rule_type === "buy_x_get_y" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600">
                          {t("discountBuyQty")}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={discountForm.buy_qty}
                          onChange={(e) =>
                            setDiscountForm((prev) => ({
                              ...prev,
                              buy_qty: e.target.value,
                            }))
                          }
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600">
                          {t("discountFreeQty")}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={discountForm.free_qty}
                          onChange={(e) =>
                            setDiscountForm((prev) => ({
                              ...prev,
                              free_qty: e.target.value,
                            }))
                          }
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                    <input
                      type="checkbox"
                      checked={discountForm.is_active}
                      onChange={(e) =>
                        setDiscountForm((prev) => ({
                          ...prev,
                          is_active: e.target.checked,
                        }))
                      }
                    />
                    {t("discountRuleActive")}
                  </label>

                  <div className="flex justify-end gap-2">
                    {editingDiscountId && (
                      <button
                        type="button"
                        onClick={resetDiscountForm}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                      >
                        {t("cancel")}
                      </button>
                    )}
                    <Button
                      type="button"
                      onClick={handleDiscountSave}
                      disabled={discountSaving || !discountForm.name.trim()}
                      className="h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {discountSaving
                        ? t("saving")
                        : editingDiscountId
                          ? t("discountUpdateRule")
                          : t("discountAddRule")}
                    </Button>
                  </div>
                </div>
              </div>

              {(editError || discountError) && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {editError || discountError}
                </p>
              )}
            </div>

            {/* Sticky footer with action buttons */}
            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={closeEdit}
                  className="h-10 text-sm"
                >
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={editLoading || !editForm.name?.trim()}
                  className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {editLoading ? t("saving") : t("saveChanges")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 size={18} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {t("deleteConfirmTitle")}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t("deleteConfirmDesc")}
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">
                  {deleteTarget.name}
                </p>
                {deleteTarget.sku && (
                  <p className="text-xs text-gray-400 font-mono">
                    {deleteTarget.sku}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  className="h-10 text-sm"
                >
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="h-10 text-sm bg-red-500 hover:bg-red-600 text-white"
                >
                  {deleteLoading ? t("deleting") : t("deleteConfirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
