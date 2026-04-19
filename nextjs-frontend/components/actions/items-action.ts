"use server";

import { cookies } from "next/headers";
import { readItem, deleteItem, createItem } from "@/app/clientService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { itemSchema } from "@/lib/definitions";

export async function fetchItems(page: number = 1, size: number = 10) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return { message: "No access token found" };
  }

  const { data, error } = await readItem({
    query: {
      page: page,
      size: size,
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
  revalidatePath("/dashboard");
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

  const { name, description, sku, category, unit_type, stock, min_stock, price } = validatedFields.data;

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
      stock,
      min_stock,
      price,
    },
  };
  const { error } = await createItem(input);
  if (error) {
    return { message: `${error.detail}` };
  }
  redirect(`/dashboard`);
}
