import type { CSSProperties, ReactNode } from "react";

/** Uniform widget header: title left, actions right (marked no-drag).
 *  While the widget content zooms continuously with its cell size, the header
 *  counter-scales via --hz (set by the Dashboard) so it only snaps between two
 *  discrete sizes — titles and action buttons stay calm when resizing. */
export function WidgetHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header
      className="flex items-center justify-between gap-2"
      style={{ zoom: "var(--hz, 1)" } as CSSProperties}
    >
      <h2 className="text-ink-mid text-sm truncate">{title}</h2>
      {right && <div className="flex items-center gap-1 no-drag shrink-0">{right}</div>}
    </header>
  );
}
