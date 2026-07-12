import { useCallback, useEffect, useState } from "react";
import type { Layout } from "react-grid-layout";
import { widgetRegistry } from "./widgetRegistry";

export interface WidgetInstance {
  id: string;
  type: string;
  layout: Layout;
}

const STORAGE_KEY = "home_dashboard.layout.v8";

function defaultWidgets(): WidgetInstance[] {
  const clock = widgetRegistry.clock;
  const trains = widgetRegistry.trains;
  const weather = widgetRegistry.weather;
  const shopping = widgetRegistry.shopping;
  const calendar = widgetRegistry.calendar;
  return [
    {
      id: "clock-1",
      type: "clock",
      layout: { i: "clock-1", x: 0, y: 0, ...clock.defaultLayout, minW: clock.minSize.w, minH: clock.minSize.h },
    },
    {
      id: "weather-1",
      type: "weather",
      layout: { i: "weather-1", x: 0, y: 3, ...weather.defaultLayout, minW: weather.minSize.w, minH: weather.minSize.h },
    },
    {
      id: "trains-1",
      type: "trains",
      layout: { i: "trains-1", x: 4, y: 0, ...trains.defaultLayout, minW: trains.minSize.w, minH: trains.minSize.h },
    },
    {
      id: "shopping-1",
      type: "shopping",
      layout: { i: "shopping-1", x: 4, y: 8, ...shopping.defaultLayout, minW: shopping.minSize.w, minH: shopping.minSize.h },
    },
    {
      id: "calendar-1",
      type: "calendar",
      layout: { i: "calendar-1", x: 8, y: 8, ...calendar.defaultLayout, minW: calendar.minSize.w, minH: calendar.minSize.h },
    },
    {
      id: "todos-1",
      type: "todos",
      layout: {
        i: "todos-1",
        x: 0,
        y: 7,
        ...widgetRegistry.todos.defaultLayout,
        minW: widgetRegistry.todos.minSize.w,
        minH: widgetRegistry.todos.minSize.h,
      },
    },
    {
      id: "parcels-1",
      type: "parcels",
      layout: {
        i: "parcels-1",
        x: 8,
        y: 5,
        ...widgetRegistry.parcels.defaultLayout,
        minW: widgetRegistry.parcels.minSize.w,
        minH: widgetRegistry.parcels.minSize.h,
      },
    },
  ];
}

/** Sanitise a stored layout: drop unknown widget types, refresh min sizes from
 *  the registry, and append any widget type that is missing below the existing
 *  layout (the "parking area"). Widgets can be moved off-screen but never lost. */
function reconcile(stored: WidgetInstance[]): WidgetInstance[] {
  const valid = stored
    .filter((w) => widgetRegistry[w.type] && w.layout)
    .map((w) => {
      const def = widgetRegistry[w.type];
      return { ...w, layout: { ...w.layout, i: w.id, minW: def.minSize.w, minH: def.minSize.h } };
    });
  const present = new Set(valid.map((w) => w.type));
  let y = valid.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  for (const def of Object.values(widgetRegistry)) {
    if (present.has(def.type)) continue;
    const id = `${def.type}-1`;
    valid.push({
      id,
      type: def.type,
      layout: { i: id, x: 0, y, ...def.defaultLayout, minW: def.minSize.w, minH: def.minSize.h },
    });
    y += def.defaultLayout.h;
  }
  return valid;
}

export function useLayout() {
  const [widgets, setWidgets] = useState<WidgetInstance[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return reconcile(JSON.parse(raw) as WidgetInstance[]);
    } catch {
      // fall through to default
    }
    return reconcile(defaultWidgets());
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const applyLayoutChange = useCallback((next: Layout[]) => {
    setWidgets((prev) =>
      prev.map((w) => {
        const updated = next.find((l) => l.i === w.id);
        return updated ? { ...w, layout: { ...w.layout, ...updated } } : w;
      }),
    );
  }, []);

  const resetLayout = useCallback(() => setWidgets(defaultWidgets()), []);

  return { widgets, applyLayoutChange, resetLayout };
}
