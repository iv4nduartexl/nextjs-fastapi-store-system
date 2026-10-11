// In-memory product search for the POS: instant, accent-insensitive, words in any order.

export interface PosProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_type: string;
  price: string | null;
  stock: string;
  min_stock: string | null;
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "3*coca" or "3 * 7790001" → { quantity: 3, term: "coca" }. Comma decimals allowed ("1,5*"). */
export function parseMultiplier(input: string): { quantity: number | null; term: string } {
  const match = input.match(/^\s*(\d+(?:[.,]\d+)?)\s*\*\s*(.*)$/);
  if (!match) return { quantity: null, term: input };
  const quantity = parseFloat(match[1].replace(",", "."));
  return { quantity: quantity > 0 ? quantity : null, term: match[2] };
}

/** Exact barcode/SKU match (case-insensitive), the scanner path. */
export function findBySku<T extends PosProduct>(products: T[], code: string): T | undefined {
  const wanted = normalize(code);
  if (!wanted) return undefined;
  return products.find((p) => p.sku != null && normalize(p.sku) === wanted);
}

/** Products matching every word of the query, best matches first. */
export function searchCatalog<T extends PosProduct>(products: T[], query: string, limit = 60): T[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);

  const scored: { product: T; rank: number; name: string }[] = [];
  for (const product of products) {
    const name = normalize(product.name);
    const sku = product.sku ? normalize(product.sku) : "";
    const category = product.category ? normalize(product.category) : "";
    const haystack = `${name} ${sku} ${category}`;
    if (!words.every((w) => haystack.includes(w))) continue;

    let rank = 4;
    if (sku && sku === q) rank = 0;
    else if (name === q) rank = 1;
    else if (name.startsWith(q) || (sku && sku.startsWith(q))) rank = 2;
    else if (words.every((w) => name.split(/\s+/).some((part) => part.startsWith(w)))) rank = 3;
    scored.push({ product, rank, name });
  }

  scored.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map((s) => s.product);
}
