import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { SettingsProvider } from "./settingsContext.js";
import { applySettingsToDocument } from "./settings.js";
import "./ui/tokens.css";
import "./styles.css";
import "./ui/tokens.css";
applySettingsToDocument();
const root = document.getElementById("root");
if (!root)
    throw new Error("root element missing");
createRoot(root).render(_jsx(StrictMode, { children: _jsx(SettingsProvider, { children: _jsx(App, {}) }) }));
//# sourceMappingURL=main.js.map