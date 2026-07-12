import { useEffect, useRef, useState, type CSSProperties } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { useLayout } from "./useLayout";
import { widgetRegistry } from "./widgetRegistry";
import { WarningBanner } from "../components/WarningBanner";
import { t } from "../strings.de";

const COLS = 12;
const ROW_HEIGHT = 60;
const MARGIN: [number, number] = [16, 16];

/** Content zoom for a widget: grows/shrinks with its grid area relative to the
 *  widget's default size. sqrt keeps growth gentle; the clamp keeps it readable. */
function contentScale(area: number, defArea: number): number {
  return Math.min(1.8, Math.max(0.9, Math.sqrt(area / defArea)));
}

/** Headers don't scale continuously with the content — they snap to two steps
 *  (1× / 1.25×). Returned as the counter-factor the header applies against the
 *  content zoom (consumed via the --hz custom property in WidgetHeader). */
function headerCounterScale(scale: number): number {
  const headerStep = scale < 1.35 ? 1 : 1.25;
  return headerStep / scale;
}

export function Dashboard() {
  const { widgets, applyLayoutChange, resetLayout } = useLayout();
  const [editMode, setEditMode] = useState(false);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [maxClosing, setMaxClosing] = useState(false);
  const [width, setWidth] = useState<number>(() => window.innerWidth);
  const [viewportH, setViewportH] = useState<number>(() => window.innerHeight);
  const [foldTop, setFoldTop] = useState<number | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setViewportH(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fold marker: where the physical screen ends inside the grid. Everything below
  // is the parking area — reachable by scrolling, but off the wall display.
  useEffect(() => {
    if (!editMode) {
      setFoldTop(null);
      return;
    }
    const rect = gridWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFoldTop(Math.max(0, viewportH - (rect.top + window.scrollY)));
  }, [editMode, viewportH, width]);

  // Close with a short exit animation before unmounting the overlay.
  const closeMaximized = () => {
    setMaxClosing(true);
    window.setTimeout(() => {
      setMaximizedId(null);
      setMaxClosing(false);
    }, 160);
  };

  useEffect(() => {
    if (!maximizedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMaximized();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maximizedId]);

  const layout: Layout[] = widgets.map((w) => w.layout);
  const maximized = maximizedId ? widgets.find((w) => w.id === maximizedId) : undefined;
  const maximizedDef = maximized ? widgetRegistry[maximized.type] : undefined;
  // Approximate the viewport in grid units so the maximized content scales the same way.
  const viewportGridArea = COLS * ((viewportH - 2 * MARGIN[1]) / (ROW_HEIGHT + MARGIN[1]));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3">
        <h1 className="text-ink-low text-sm font-medium">{t.app.title}</h1>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              type="button"
              onClick={resetLayout}
              className="text-sm px-4 py-2 min-h-[2.75rem] rounded-full text-ink-low hover:text-ink-high hover:bg-white/5 transition"
            >
              {t.edit.reset}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className="text-sm px-4 py-2 min-h-[2.75rem] rounded-full text-ink-mid hover:text-ink-high hover:bg-white/5 transition"
          >
            {editMode ? t.edit.exit : t.edit.enter}
          </button>
        </div>
      </header>

      <WarningBanner />

      <main className="flex-1 px-2">
        <div ref={gridWrapRef} className="relative">
          {editMode && foldTop !== null && (
            <div
              className="absolute left-2 right-2 z-20 pointer-events-none border-t border-dashed border-white/25"
              style={{ top: foldTop }}
            >
              <span className="absolute left-3 top-1 text-[11px] text-ink-low bg-canvas px-1">
                {t.edit.fold}
              </span>
            </div>
          )}
          <GridLayout
            className="layout"
            layout={layout}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            width={width - 16}
            margin={MARGIN}
            isDraggable={editMode}
            isResizable={editMode}
            compactType={null}
            preventCollision
            onLayoutChange={applyLayoutChange}
            draggableCancel=".no-drag"
          >
            {widgets.map((w) => {
              const def = widgetRegistry[w.type];
              if (!def) return null;
              const { Component } = def;
              const scale = contentScale(
                w.layout.w * w.layout.h,
                def.defaultLayout.w * def.defaultLayout.h,
              );
              return (
                <div
                  key={w.id}
                  className={[
                    "rounded-2xl bg-surface overflow-hidden",
                    editMode ? "ring-1 ring-white/15 cursor-move" : "ring-1 ring-white/5",
                  ].join(" ")}
                >
                  <div
                    className="h-full w-full"
                    style={{ zoom: scale, "--hz": String(headerCounterScale(scale)) } as CSSProperties}
                  >
                    <Component />
                  </div>
                  {!editMode && (
                    <button
                      type="button"
                      onClick={() => setMaximizedId(w.id)}
                      aria-label={t.edit.maximize}
                      title={t.edit.maximize}
                      className="no-drag absolute bottom-1.5 right-1.5 z-10 p-2 rounded-lg bg-white/[0.05] text-ink-low opacity-60 hover:opacity-100 hover:text-ink-high hover:bg-white/10 transition"
                    >
                      <ExpandIcon />
                    </button>
                  )}
                </div>
              );
            })}
          </GridLayout>
        </div>
      </main>

      {maximized && maximizedDef && (
        <div
          className={`fixed inset-0 z-40 bg-black/75 backdrop-blur-sm p-6 md:p-10 ${maxClosing ? "backdrop-out" : "backdrop-in"}`}
          onClick={closeMaximized}
        >
          <div
            className={`relative h-full w-full rounded-2xl bg-surface ring-1 ring-white/10 shadow-2xl overflow-hidden ${maxClosing ? "panel-out" : "panel-in"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-full w-full"
              style={(() => {
                const scale = contentScale(
                  viewportGridArea,
                  maximizedDef.defaultLayout.w * maximizedDef.defaultLayout.h,
                );
                return { zoom: scale, "--hz": String(headerCounterScale(scale)) } as CSSProperties;
              })()}
            >
              <maximizedDef.Component />
            </div>
            <button
              type="button"
              onClick={closeMaximized}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 px-7 py-3.5 min-h-[3.25rem] rounded-full bg-white/10 hover:bg-white/[0.16] text-ink-high text-base font-medium shadow-lg backdrop-blur-md ring-1 ring-white/15 transition"
            >
              <CollapseIcon />
              {t.edit.closeMaximize}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M9.5 2.5h4v4M13 3L9 7M6.5 13.5h-4v-4M3 13l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path
        d="M13.5 6.5h-4v-4M10 6l4-4M2.5 9.5h4v4M6 10l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
