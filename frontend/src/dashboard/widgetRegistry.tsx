import type { ComponentType } from "react";
import { CalendarWidget } from "../widgets/CalendarWidget";
import { ClockWidget } from "../widgets/ClockWidget";
import { ParcelsWidget } from "../widgets/ParcelsWidget";
import { ShoppingWidget } from "../widgets/ShoppingWidget";
import { TodoWidget } from "../widgets/TodoWidget";
import { TrainsWidget } from "../widgets/TrainsWidget";
import { WeatherWidget } from "../widgets/WeatherWidget";

export interface WidgetDefinition {
  type: string;
  title: string;
  Component: ComponentType;
  defaultLayout: { w: number; h: number };
  minSize: { w: number; h: number };
}

// Central registry. Adding a widget = registering it here + creating the component.
export const widgetRegistry: Record<string, WidgetDefinition> = {
  clock: {
    type: "clock",
    title: "Uhrzeit",
    Component: ClockWidget,
    defaultLayout: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
  },
  trains: {
    type: "trains",
    title: "Abfahrten Moosburg",
    Component: TrainsWidget,
    defaultLayout: { w: 7, h: 8 },
    minSize: { w: 4, h: 5 },
  },
  weather: {
    type: "weather",
    title: "Wetter",
    Component: WeatherWidget,
    defaultLayout: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
  },
  shopping: {
    type: "shopping",
    title: "Einkaufsliste",
    Component: ShoppingWidget,
    defaultLayout: { w: 3, h: 5 },
    minSize: { w: 2, h: 3 },
  },
  calendar: {
    type: "calendar",
    title: "Kalender",
    Component: CalendarWidget,
    defaultLayout: { w: 3, h: 5 },
    minSize: { w: 2, h: 3 },
  },
  todos: {
    type: "todos",
    title: "Aufgaben",
    Component: TodoWidget,
    defaultLayout: { w: 3, h: 5 },
    minSize: { w: 2, h: 3 },
  },
  parcels: {
    type: "parcels",
    title: "Sendungen",
    Component: ParcelsWidget,
    defaultLayout: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
  },
};
