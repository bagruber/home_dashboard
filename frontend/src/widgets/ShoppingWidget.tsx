import { forwardRef, useMemo, useRef, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  addShoppingItem,
  clearAll,
  clearBought,
  deleteShoppingItem,
  fetchShopping,
  matchSuggestions,
  setShoppingBought,
  type ShoppingItem,
} from "../lib/shopping";
import { usePolling } from "../lib/usePolling";
import { WidgetHeader } from "../components/WidgetHeader";
import { t } from "../strings.de";

const REFRESH_MS = 30_000;

export function ShoppingWidget() {
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
  const [showExport, setShowExport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const productRef = useRef<HTMLInputElement>(null);

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

  const onToggleBought = async (item: ShoppingItem) => {
    const next = !item.bought;
    setItems((curr) =>
      curr
        ? curr.map((x) =>
            x.id === item.id ? { ...x, bought: next, boughtAt: next ? new Date().toISOString() : null } : x,
          )
        : curr,
    );
    try {
      await setShoppingBought(item.id, next);
      // Reload list to get fresh order from server.
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
    setMenuOpen(false);
    try {
      await clearBought();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onClearAll = async () => {
    setMenuOpen(false);
    if (!window.confirm(t.widgets.shopping.confirmClearAll)) return;
    try {
      await clearAll();
      setItems([]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const open = useMemo(() => items?.filter((it) => !it.bought) ?? [], [items]);
  const bought = useMemo(() => items?.filter((it) => it.bought) ?? [], [items]);

  return (
    <div className="relative h-full w-full flex flex-col px-4 py-3 gap-2">
      <WidgetHeader
        title={t.widgets.shopping.title}
        right={
          <>
          {open.length > 0 && (
            <span className="text-ink-low text-xs tabular-nums mr-1">{open.length}</span>
          )}
          <button
            type="button"
            onClick={() => setShowExport(true)}
            aria-label={t.widgets.shopping.exportLabel}
            title={t.widgets.shopping.exportLabel}
            disabled={open.length === 0}
            className="text-ink-low hover:text-ink-high disabled:opacity-30 disabled:cursor-not-allowed transition p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
          >
            <QrIcon />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menü"
              className="text-ink-low hover:text-ink-high transition p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
            >
              <KebabIcon />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 bg-surface-2 rounded-lg ring-1 ring-white/10 py-1 min-w-[10rem] z-10"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={onClearBought}
                  disabled={bought.length === 0}
                  className="block w-full text-left px-3 py-1.5 text-sm text-ink-mid hover:text-ink-high disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t.widgets.shopping.clearBought}
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={!items || items.length === 0}
                  className="block w-full text-left px-3 py-1.5 text-sm text-alert/80 hover:text-alert disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t.widgets.shopping.clearAll}
                </button>
              </div>
            )}
          </div>
          </>
        }
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-1 no-drag">
        <div className="flex gap-1.5">
          <ProductInput
            ref={productRef}
            value={product}
            onChange={setProduct}
            disabled={submitting}
          />
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t.widgets.shopping.amountPlaceholder}
            className="w-20 rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
            maxLength={60}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={!product.trim() || submitting}
            className="px-3 py-1.5 rounded-md bg-white/10 text-ink-high text-sm hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition leading-none"
          >
            {t.widgets.shopping.add}
          </button>
        </div>
      </form>

      {error && <div className="text-alert text-sm">{t.widgets.shopping.error}</div>}

      <div className="flex-1 overflow-auto no-drag">
        {items === null && <div className="text-ink-low text-sm">{t.widgets.shopping.loading}</div>}
        {items && items.length === 0 && (
          <div className="text-ink-low text-sm italic">{t.widgets.shopping.empty}</div>
        )}
        {open.length > 0 && (
          <ul className="flex flex-col gap-1">
            {open.map((it) => (
              <ItemRow key={it.id} item={it} onToggle={onToggleBought} onDelete={onDelete} />
            ))}
          </ul>
        )}
        {bought.length > 0 && (
          <div className="mt-3">
            <div className="text-ink-low text-xs uppercase tracking-wider mb-1.5 pl-1">
              {t.widgets.shopping.boughtSection} · {bought.length}
            </div>
            <ul className="flex flex-col gap-1">
              {bought.map((it) => (
                <ItemRow key={it.id} item={it} onToggle={onToggleBought} onDelete={onDelete} muted />
              ))}
            </ul>
          </div>
        )}
      </div>

      {showExport && items && open.length > 0 && (
        <ExportOverlay items={open} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}

interface ProductInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

const ProductInput = forwardRef<HTMLInputElement, ProductInputProps>(function ProductInput(
  { value, onChange, disabled },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const suggestions = matchSuggestions(value);
  const showSuggestions = focused && suggestions.length > 0;
  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder={t.widgets.shopping.productPlaceholder}
        disabled={disabled}
        maxLength={120}
        className="w-full rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
      />
      {showSuggestions && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-surface-2 rounded-md ring-1 ring-white/10 py-1 z-10 max-h-44 overflow-auto">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s);
                  setFocused(false);
                }}
                className="block w-full text-left px-3 py-1.5 text-sm text-ink-mid hover:text-ink-high hover:bg-white/5"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

interface ItemRowProps {
  item: ShoppingItem;
  onToggle: (it: ShoppingItem) => void;
  onDelete: (id: string) => void;
  muted?: boolean;
}

function ItemRow({ item, onToggle, onDelete, muted }: ItemRowProps) {
  return (
    <li
      className={`row-in flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
        muted ? "bg-white/[0.015]" : "bg-white/[0.025] hover:bg-white/[0.05]"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-label={item.bought ? "Erledigt rückgängig" : "Als erledigt markieren"}
        className={`shrink-0 w-9 h-9 rounded-md border flex items-center justify-center transition ${
          item.bought
            ? "bg-white/20 border-white/30 text-ink-high"
            : "bg-transparent border-white/25 hover:border-white/50 active:bg-white/10"
        }`}
      >
        {item.bought && <CheckMark />}
      </button>
      <span
        className={`flex-1 break-words text-[14px] ${
          item.bought ? "line-through text-ink-low" : "text-ink-high"
        }`}
      >
        {item.product}
      </span>
      {item.amount && (
        <span className={`text-xs tabular-nums whitespace-nowrap ${item.bought ? "text-ink-low" : "text-ink-mid"}`}>
          {item.amount}
        </span>
      )}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={t.widgets.shopping.deleteLabel}
        className="text-ink-low hover:text-alert transition text-lg leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
      >
        ×
      </button>
    </li>
  );
}

function ExportOverlay({ items, onClose }: { items: ShoppingItem[]; onClose: () => void }) {
  const text = items
    .map((it) => `- ${it.product}${it.amount ? ` (${it.amount})` : ""}`)
    .join("\n");
  const payload = `${t.widgets.shopping.title}\n${text}`;
  // The QR opens the live mobile list (works for any device on the same network);
  // the copy button still exports a plain-text snapshot.
  const mobileUrl = `${window.location.origin}/m`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="no-drag absolute inset-0 z-20 flex items-center justify-center bg-black/85 backdrop-blur-sm rounded-2xl"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 rounded-2xl px-5 py-4 flex flex-col items-center gap-3 max-w-[90%]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-ink-mid text-sm">{t.widgets.shopping.exportTitle}</div>
        <div className="bg-white p-2 rounded-lg">
          <QRCodeSVG value={mobileUrl} size={196} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
        <div className="text-ink-low text-xs text-center max-w-[14rem]">
          {t.widgets.shopping.exportHint}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-ink-high text-sm hover:bg-white/15 transition"
          >
            {copied ? t.widgets.shopping.copied : t.widgets.shopping.copy}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-ink-mid hover:text-ink-high text-sm transition"
          >
            {t.widgets.shopping.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className="check-pop" aria-hidden>
      <path
        d="M3 8.5L6.5 12L13 5"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className="check-pop" aria-hidden>
      <path
        d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM10 10h1v1h-1zM12 10h2v1h-2zM10 12h1v2h-1zM12 12h1v1h-1zM13 13h1v1h-1z"
        fill="currentColor"
      />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className="check-pop" aria-hidden>
      <circle cx="8" cy="3" r="1.5" fill="currentColor" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="13" r="1.5" fill="currentColor" />
    </svg>
  );
}
