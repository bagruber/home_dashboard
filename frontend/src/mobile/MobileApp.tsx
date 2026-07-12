import { useRef, useState, type FormEvent } from "react";
import {
  addShoppingItem,
  clearBought,
  deleteShoppingItem,
  fetchShopping,
  matchSuggestions,
  setShoppingBought,
  type ShoppingItem,
} from "../lib/shopping";
import { usePolling } from "../lib/usePolling";
import { t } from "../strings.de";

const REFRESH_MS = 15_000;

/** Phone view served at /m — the shopping list with thumb-sized controls.
 *  Same backend, same data; add items from the couch or the supermarket. */
export function MobileApp() {
  const {
    data: items,
    setData: setItems,
    error,
    setError,
    reload,
  } = usePolling<ShoppingItem[]>(async (signal) => (await fetchShopping(signal)).items, REFRESH_MS);
  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const productRef = useRef<HTMLInputElement>(null);

  const open = items?.filter((it) => !it.bought) ?? [];
  const bought = items?.filter((it) => it.bought) ?? [];
  const suggestions = matchSuggestions(product, 4);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = product.trim();
    if (!p || submitting) return;
    setSubmitting(true);
    try {
      const added = await addShoppingItem(p, amount.trim() || null);
      setItems((prev) => (prev ? [added, ...prev] : [added]));
      setProduct("");
      setAmount("");
      productRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onToggle = async (item: ShoppingItem) => {
    const next = !item.bought;
    setItems((curr) =>
      curr
        ? curr.map((x) =>
            x.id === item.id
              ? { ...x, bought: next, boughtAt: next ? new Date().toISOString() : null }
              : x,
          )
        : curr,
    );
    try {
      await setShoppingBought(item.id, next);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    const prev = items;
    setItems((curr) => (curr ? curr.filter((x) => x.id !== id) : curr));
    try {
      await deleteShoppingItem(id);
    } catch (err) {
      setItems(prev);
      setError((err as Error).message);
    }
  };

  const onClearBought = async () => {
    try {
      await clearBought();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto flex flex-col px-4 pt-4 pb-8 gap-3">
      <header className="flex items-baseline justify-between">
        <h1 className="text-ink-high text-xl font-semibold">{t.mobile.title}</h1>
        {open.length > 0 && (
          <span className="text-ink-low text-sm tabular-nums">{open.length}</span>
        )}
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={productRef}
            type="text"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder={t.widgets.shopping.productPlaceholder}
            maxLength={120}
            enterKeyHint="done"
            className="flex-1 min-w-0 rounded-xl bg-white/[0.06] border border-white/10 text-ink-high text-base px-4 py-3 placeholder:text-ink-low focus:outline-none focus:border-white/25"
          />
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t.widgets.shopping.amountPlaceholder}
            maxLength={60}
            className="w-24 rounded-xl bg-white/[0.06] border border-white/10 text-ink-high text-base px-3 py-3 placeholder:text-ink-low focus:outline-none focus:border-white/25"
          />
          <button
            type="submit"
            disabled={!product.trim() || submitting}
            className="px-5 rounded-xl bg-white/15 text-ink-high text-xl hover:bg-white/20 disabled:opacity-30 transition"
          >
            +
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setProduct(s);
                  productRef.current?.focus();
                }}
                className="px-3 py-1.5 rounded-full bg-white/[0.06] text-ink-mid text-sm"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      {error && <div className="text-alert text-sm">{t.widgets.shopping.error}</div>}
      {items === null && <div className="text-ink-low text-sm">{t.widgets.shopping.loading}</div>}
      {items && items.length === 0 && (
        <div className="text-ink-low text-base italic">{t.widgets.shopping.empty}</div>
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {open.map((it) => (
            <MobileRow key={it.id} item={it} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {bought.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-ink-low text-xs uppercase tracking-wider">
              {t.widgets.shopping.boughtSection} · {bought.length}
            </span>
            <button
              type="button"
              onClick={onClearBought}
              className="text-ink-low text-sm px-3 py-1.5 rounded-full hover:bg-white/5"
            >
              {t.widgets.shopping.clearBought}
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {bought.map((it) => (
              <MobileRow key={it.id} item={it} onToggle={onToggle} onDelete={onDelete} muted />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MobileRow({
  item,
  onToggle,
  onDelete,
  muted,
}: {
  item: ShoppingItem;
  onToggle: (it: ShoppingItem) => void;
  onDelete: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <li
      className={`row-in flex items-center gap-3 rounded-xl px-3 py-2 ${
        muted ? "bg-white/[0.02]" : "bg-white/[0.05]"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-label={item.bought ? "Erledigt rückgängig" : "Als erledigt markieren"}
        className={`shrink-0 w-11 h-11 rounded-lg border flex items-center justify-center transition ${
          item.bought
            ? "bg-white/20 border-white/30 text-ink-high"
            : "bg-transparent border-white/25 active:bg-white/10"
        }`}
      >
        {item.bought && (
          <svg viewBox="0 0 16 16" width="18" height="18" className="check-pop" aria-hidden>
            <path
              d="M3 8.5L6.5 12L13 5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <span
        className={`flex-1 break-words text-base ${
          item.bought ? "line-through text-ink-low" : "text-ink-high"
        }`}
      >
        {item.product}
      </span>
      {item.amount && (
        <span className={`text-sm tabular-nums ${item.bought ? "text-ink-low" : "text-ink-mid"}`}>
          {item.amount}
        </span>
      )}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={t.widgets.shopping.deleteLabel}
        className="text-ink-low active:text-alert text-2xl leading-none w-11 h-11 flex items-center justify-center"
      >
        ×
      </button>
    </li>
  );
}
