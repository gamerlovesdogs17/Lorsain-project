import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles.css";

// Phase 11.5: apply density preference from localStorage
const density = localStorage.getItem("lorsain-density");
if (density === "compact" || density === "comfortable") {
  document.body.setAttribute("data-density", density);
}

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
