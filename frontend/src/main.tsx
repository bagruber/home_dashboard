import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MobileApp } from "./mobile/MobileApp";
import "./index.css";

// Tiny path switch instead of a router: /m is the phone view, everything else
// renders the wall dashboard.
const isMobileRoute = /^\/m(\/|$)/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isMobileRoute ? <MobileApp /> : <App />}</StrictMode>,
);
