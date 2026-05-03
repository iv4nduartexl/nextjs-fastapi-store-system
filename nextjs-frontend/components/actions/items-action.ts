"use server";

import { cookies } from "next/headers";
import { readItem, deleteItem, createItem } from "@/app/clientService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { itemSchema } from "@/lib/definitions";
import { ItemUpdate } from "@/app/openapi-client";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://backend:8000";

export interface QuantityDiscountRuleRead {
  id: string;
  name: string;
  scope: "global" | "item" | "category";
  item_id: string | null;
  category: string | null;
  is_active: boolean;
  priority: string;
  min_qty: string;
  rule_type: "percent" | "fixed_price" | "buy_x_get_y";
  percent_off: string | null;
  fixed_unit_price: string | null;
  buy_qty: string | null;
  free_qty: string | null;
}

export interface QuantityDiscountRuleInput {
  name: string;
  min_qty: number;
  rule_type: "percent" | "fixed_price" | "buy_x_get_y";
  percent_off?: number | null;
  fixed_unit_price?: number | null;
  buy_qty?: number | null;
  free_qty?: number | null;
  priority?: number;
  is_active?: boolean;
}

export async function fetchItems(
  page: number = 1,
  size: number = 10,
  q?: string,
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return { message: "No access token found" };
  }

  const { data, error } = await readItem({
    query: {
      page: page,
      size: size,
      order: "-created_at",
      ...(q ? { q } : {}),
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    return { message: error };
  }

  return data;
}

export async function removeItem(id: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return { message: "No access token found" };
  }

  const { error } = await deleteItem({
    headers: {
      Authorization: `Bearer ${token}`,
    },
    path: {
      item_id: id,
    },
  });

  if (error) {
    return { message: error };
  }
  revalidatePath("/products");
}

export async function updateItem(id: string, data: ItemUpdate) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return { error: "Unauthorized" };

  const res = await fetch(`${API_BASE_URL}/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: unknown }).detail;
    return {
      error:
        typeof detail === "string"
          ? detail
          : (JSON.stringify(detail) ?? "Failed to update item"),
    };
  }

  revalidatePath("/products");
  return { data: await res.json() };
}

export async function fetchItemDiscountRules(
  itemId: string,
): Promise<{ data?: QuantityDiscountRuleRead[]; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return { error: "Unauthorized" };

  const res = await fetch(
    `${API_BASE_URL}/sales/discount-rules?item_id=${encodeURIComponent(itemId)}&include_inactive=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }

  return { data: await res.json() };
}

export async function createItemDiscountRule(
  itemId: string,
  data: QuantityDiscountRuleInput,
): Promise<{ data?: QuantityDiscountRuleRead; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return { error: "Unauthorized" };

  const res = await fetch(`${API_BASE_URL}/sales/discount-rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...data,
      scope: "item",
      item_id: itemId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }

  revalidatePath("/products");
  return { data: await res.json() };
}

export async function updateDiscountRule(
  ruleId: string,
  data: Partial<QuantityDiscountRuleInput>,
): Promise<{ data?: QuantityDiscountRuleRead; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return { error: "Unauthorized" };

  const res = await fetch(
    `${API_BASE_URL}/sales/discount-rules/${encodeURIComponent(ruleId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }

  revalidatePath("/products");
  return { data: await res.json() };
}

export async function deleteDiscountRule(
  ruleId: string,
): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return { error: "Unauthorized" };

  const res = await fetch(
    `${API_BASE_URL}/sales/discount-rules/${encodeURIComponent(ruleId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }

  revalidatePath("/products");
  return {};
}

export async function addItem(prevState: {}, formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return { message: "No access token found" };
  }

  const validatedFields = itemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sku: formData.get("sku") || undefined,
    category: formData.get("category") || undefined,
    unit_type: formData.get("unit_type"),
    stock: formData.get("stock"),
    min_stock: formData.get("min_stock") || undefined,
    price: formData.get("price") || undefined,
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const {
    name,
    description,
    sku,
    category,
    unit_type,
    stock,
    min_stock,
    price,
  } = validatedFields.data;

  const input = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: {
      name,
      description,
      sku,
      category,
      unit_type: unit_type as import("@/app/openapi-client").UnitType,
      stock: parseFloat(stock),
      min_stock: min_stock ? parseFloat(min_stock) : undefined,
      price: price ? parseFloat(price) : undefined,
    },
  };
  const { error } = await createItem(input);
  if (error) {
    const detail = (error as { detail?: unknown }).detail;
    return {
      message:
        typeof detail === "string"
          ? detail
          : (JSON.stringify(detail) ?? "Unknown error"),
    };
  }
  redirect(`/products`);
}
