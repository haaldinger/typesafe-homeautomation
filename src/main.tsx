import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import Panel from "./Panel.tsx";
import "./index.css";

// /panel is the wall-panel view for small touch screens.
const isPanel = window.location.pathname.replace(/\/+$/, "") === "/panel";

createRoot(document.getElementById("root")!).render(<StrictMode>{isPanel ? <Panel /> : <App />}</StrictMode>);
