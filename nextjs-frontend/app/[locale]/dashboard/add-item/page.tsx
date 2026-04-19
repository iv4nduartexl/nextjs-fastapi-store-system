"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addItem } from "@/components/actions/items-action";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submitButton";
import { unitTypes } from "@/lib/definitions";
import { useTranslations } from "next-intl";

const initialState = { message: "" };

export default function CreateItemPage() {
  const [state, dispatch] = useActionState(addItem, initialState);
  const t = useTranslations("addItem");

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto p-6">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-800 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {t("subtitle")}
          </p>
        </header>

        <form
          action={dispatch}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                {t("name")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder={t("namePlaceholder")}
                required
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.name && (
                <p className="text-red-500 text-sm">{state.errors.name}</p>
              )}
            </div>

            {/* SKU */}
            <div className="space-y-2">
              <Label htmlFor="sku" className="text-gray-700 dark:text-gray-300">
                {t("sku")}
              </Label>
              <Input
                id="sku"
                name="sku"
                type="text"
                placeholder={t("skuPlaceholder")}
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.sku && (
                <p className="text-red-500 text-sm">{state.errors.sku}</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category" className="text-gray-700 dark:text-gray-300">
                {t("category")}
              </Label>
              <Input
                id="category"
                name="category"
                type="text"
                placeholder={t("categoryPlaceholder")}
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.category && (
                <p className="text-red-500 text-sm">{state.errors.category}</p>
              )}
            </div>

            {/* Unit Type */}
            <div className="space-y-2">
              <Label htmlFor="unit_type" className="text-gray-700 dark:text-gray-300">
                {t("soldBy")} <span className="text-red-500">*</span>
              </Label>
              <select
                id="unit_type"
                name="unit_type"
                required
                defaultValue="unit"
                className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-gray-100"
              >
                {unitTypes.map((u) => (
                  <option key={u} value={u}>
                    {u === "unit" ? "Unit / Piece" : u.charAt(0).toUpperCase() + u.slice(1)}
                  </option>
                ))}
              </select>
              {state.errors?.unit_type && (
                <p className="text-red-500 text-sm">{state.errors.unit_type}</p>
              )}
            </div>

            {/* Stock */}
            <div className="space-y-2">
              <Label htmlFor="stock" className="text-gray-700 dark:text-gray-300">
                {t("stock")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="stock"
                name="stock"
                type="number"
                step="0.001"
                min="0"
                placeholder={t("stockPlaceholder")}
                required
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.stock && (
                <p className="text-red-500 text-sm">{state.errors.stock}</p>
              )}
            </div>

            {/* Min Stock */}
            <div className="space-y-2">
              <Label htmlFor="min_stock" className="text-gray-700 dark:text-gray-300">
                {t("minStock")}
              </Label>
              <Input
                id="min_stock"
                name="min_stock"
                type="number"
                step="0.001"
                min="0"
                placeholder={t("minStockPlaceholder")}
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.min_stock && (
                <p className="text-red-500 text-sm">{state.errors.min_stock}</p>
              )}
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price" className="text-gray-700 dark:text-gray-300">
                {t("price")}
              </Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                placeholder={t("pricePlaceholder")}
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.price && (
                <p className="text-red-500 text-sm">{state.errors.price}</p>
              )}
            </div>

            {/* Description — full width */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
                {t("description")}
              </Label>
              <Input
                id="description"
                name="description"
                type="text"
                placeholder={t("descriptionPlaceholder")}
                className="w-full border-gray-300 dark:border-gray-600"
              />
              {state.errors?.description && (
                <p className="text-red-500 text-sm">{state.errors.description}</p>
              )}
            </div>
          </div>

          <SubmitButton text={t("submit")} />

          {state?.message && (
            <div className="mt-2 text-center text-sm text-red-500">
              <p>{state.message}</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
