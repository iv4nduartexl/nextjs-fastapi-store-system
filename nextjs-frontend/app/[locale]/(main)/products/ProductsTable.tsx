"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ItemRead } from "@/app/openapi-client";
import { updateItem, removeItem } from "@/components/actions/items-action";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { Pencil, Trash2, X } from "lucide-react";
import { unitTypes } from "@/lib/definitions";

interface Props {
  items: ItemRead[];
}

export function ProductsTable({ items }: Props) {
  const t = useTranslations("products");
  const tTable = useTranslations("dashboard");
  const router = useRouter();

  const [editTarget, setEditTarget] = useState<ItemRead | null>(null);
  const [editForm, setEditForm] = useState<Partial<ItemRead>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<ItemRead | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  function openEdit(item: ItemRead) {
    setEditTarget(item);
    setEditForm({ ...item });
    setEditError("");
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
      stock: editForm.stock != null ? parseFloat(editForm.stock as unknown as string) : undefined,
      min_stock: editForm.min_stock != null ? parseFloat(editForm.min_stock as unknown as string) : null,
      price: editForm.price != null ? parseFloat(editForm.price as unknown as string) : null,
    });
    setEditLoading(false);
    if (result?.error) {
      setEditError(result.error as string);
    } else {
      setEditTarget(null);
      router.refresh();
    }
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
            <th className="text-center px-4 py-3 w-24">{tTable("table.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-10 text-gray-400">{tTable("noResults")}</td>
            </tr>
          ) : (
            items.map((item) => {
              const lowStock =
                item.min_stock != null &&
                parseFloat(item.stock ?? "0") <= parseFloat(item.min_stock as unknown as string);
              return (
                <tr key={item.id as string} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{item.category ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{tTable(`unitTypes.${item.unit_type ?? "unit"}`)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${lowStock ? "text-red-500 font-semibold" : ""}`}>
                    {item.stock ?? "0"} {lowStock && <span title="Low stock">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.price != null ? formatCurrency(item.price as unknown as string) : "—"}
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
          onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Pencil size={15} className="text-blue-500" />
                <h3 className="font-semibold text-gray-800 text-sm">{t("editProduct")}</h3>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">{tTable("table.name")} *</label>
                <Input
                  autoFocus
                  value={editForm.name ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>

              {/* SKU + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">{tTable("table.sku")}</label>
                  <Input
                    value={editForm.sku ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value || undefined }))}
                    placeholder="SKU"
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">{tTable("table.category")}</label>
                  <CategoryCombobox
                    value={editForm.category ?? ""}
                    onChange={(v) => setEditForm((f) => ({ ...f, category: v || undefined }))}
                    placeholder="Category"
                  />
                </div>
              </div>

              {/* Unit type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">{tTable("table.soldBy")}</label>
                <select
                  value={editForm.unit_type ?? "unit"}
                  onChange={(e) => setEditForm((f) => ({ ...f, unit_type: e.target.value as ItemRead["unit_type"] }))}
                  className="w-full h-9 text-sm bg-gray-50 rounded-lg border border-gray-200 px-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {unitTypes.map((u) => (
                    <option key={u} value={u}>{tTable(`unitTypes.${u}`)}</option>
                  ))}
                </select>
              </div>

              {/* Stock + Min stock */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">{tTable("table.stock")}</label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={editForm.stock ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, stock: e.target.value as unknown as string & number }))}
                    className="h-9 text-sm text-right font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">{t("minStock")}</label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={editForm.min_stock ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, min_stock: e.target.value as unknown as string & number }))}
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
                    <span className="ml-1 text-[10px] text-gray-400">(/kg)</span>
                  )}
                </label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editForm.price ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value as unknown as string & number }))}
                  placeholder="—"
                  className="h-9 text-sm text-right font-mono"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">{t("description")}</label>
                <textarea
                  value={editForm.description ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value || undefined }))}
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {editError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{editError}</p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditTarget(null)} className="h-10 text-sm">
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
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 size={18} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{t("deleteConfirmTitle")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("deleteConfirmDesc")}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{deleteTarget.name}</p>
                {deleteTarget.sku && <p className="text-xs text-gray-400 font-mono">{deleteTarget.sku}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} className="h-10 text-sm">
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
