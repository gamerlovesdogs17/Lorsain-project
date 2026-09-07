import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { SettingsProvider } from "./settingsContext.js";
import { applySettingsToDocument } from "./settings.js";
import "./styles.css";

applySettingsToDocument();

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
createRoot(root).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
