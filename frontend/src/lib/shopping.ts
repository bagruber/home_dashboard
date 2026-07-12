export interface ShoppingItem {
  id: string;
  product: string;
  amount: string | null;
  bought: boolean;
  createdAt: string;
  boughtAt: string | null;
}

export interface ShoppingList {
  items: ShoppingItem[];
}

// Hard-coded family staples. Surfaces as autocomplete suggestions for the product field.
export const PRODUCT_SUGGESTIONS = [
  "Mozarella",
  "Gurken",
  "Vollmilch",
  "Pesto Rosso",
  "Avocados",
  "Zwiebeln",
  "Mineralwasser",
  "Cola",
  "Apfelsaft",
] as const;

export function matchSuggestions(input: string, limit = 6): string[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  return PRODUCT_SUGGESTIONS.filter((s) => {
    const lower = s.toLowerCase();
    return tokens.every((tok) => lower.includes(tok));
  })
    .filter((s) => s.toLowerCase() !== q)
    .slice(0, limit);
}

export async function fetchShopping(signal?: AbortSignal): Promise<ShoppingList> {
  const res = await fetch("/api/shopping", { signal });
  if (!res.ok) throw new Error(`shopping: ${res.status}`);
  return res.json();
}

export async function addShoppingItem(product: string, amount: string | null): Promise<ShoppingItem> {
  const res = await fetch("/api/shopping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product, amount }),
  });
  if (!res.ok) throw new Error(`shopping add: ${res.status}`);
  return res.json();
}

export async function setShoppingBought(id: string, bought: boolean): Promise<ShoppingItem> {
  const res = await fetch(`/api/shopping/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bought }),
  });
  if (!res.ok) throw new Error(`shopping patch: ${res.status}`);
  return res.json();
}

export async function deleteShoppingItem(id: string): Promise<void> {
  const res = await fetch(`/api/shopping/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`shopping delete: ${res.status}`);
}

export async function clearBought(): Promise<number> {
  const res = await fetch("/api/shopping/clear-bought", { method: "POST" });
  if (!res.ok) throw new Error(`shopping clear-bought: ${res.status}`);
  const data = (await res.json()) as { removed: number };
  return data.removed;
}

export async function clearAll(): Promise<number> {
  const res = await fetch("/api/shopping/clear-all", { method: "POST" });
  if (!res.ok) throw new Error(`shopping clear-all: ${res.status}`);
  const data = (await res.json()) as { removed: number };
  return data.removed;
}
