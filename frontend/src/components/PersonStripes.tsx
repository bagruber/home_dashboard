import { getPerson, PEOPLE } from "../lib/people";

const STRIPE_WIDTH = 3;
const STRIPE_GAP = 4;
const STRIPE_STEP = STRIPE_WIDTH + STRIPE_GAP;
// Push past the row's rounded corner (rounded-lg = 8px) so stripes don't appear
// to leak outside the card. A bit of right padding finishes the block.
const STRIPE_LEFT = 10;
const STRIPE_RIGHT = 4;
const STRIPE_ANGLE_DEG = 25;

/** Width in pixels that PersonStripes will occupy for a given number of persons. */
export function personStripesWidth(count: number): number {
  if (count === 0) return 0;
  return STRIPE_LEFT + count * STRIPE_STEP + STRIPE_RIGHT;
}

// Diagonal accent stripes on the left edge of a card, one per assigned person.
// Tilted to feel less like a hospital-corridor sticker and more like fabric tape.
export function PersonStripes({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  const width = personStripesWidth(ids.length);
  return (
    <div
      className="absolute left-0 top-0 bottom-0 pointer-events-none overflow-hidden"
      style={{ width }}
    >
      {ids.map((id, i) => {
        const p = getPerson(id);
        if (!p) return null;
        return (
          <div
            key={`${id}-${i}`}
            className={`${p.bgClass} absolute rounded-sm`}
            style={{
              left: STRIPE_LEFT + i * STRIPE_STEP,
              top: "-20%",
              width: STRIPE_WIDTH,
              height: "140%",
              transform: `rotate(${STRIPE_ANGLE_DEG}deg)`,
              transformOrigin: "top",
            }}
          />
        );
      })}
    </div>
  );
}

// Small inline tile (rounded square) for compact rows like the todo list.
export function PersonDot({ id, size = 22 }: { id: string; size?: number }) {
  const p = getPerson(id);
  if (!p) return null;
  return (
    <span
      className={`${p.bgClass} inline-flex items-center justify-center rounded-md text-[11px] text-white font-semibold shrink-0`}
      style={{ width: size, height: size }}
      aria-label={p.fullName}
      title={p.fullName}
    >
      {p.displayName.charAt(0)}
    </span>
  );
}

// Toggle-style picker — one button per person. Selected state filled, unselected ghost.
export function PersonPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {PEOPLE.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={[
              "px-3 py-1.5 min-h-[2rem] rounded-md text-xs font-medium transition",
              on
                ? `${p.bgClass} text-white`
                : "bg-white/[0.04] text-ink-low hover:text-ink-mid",
            ].join(" ")}
          >
            {p.displayName}
          </button>
        );
      })}
    </div>
  );
}
