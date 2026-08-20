import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { injectTokenVars, tokens } from "./tokens";
import { App } from "./App";
import "./style.css";

injectTokenVars();
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute("content", tokens.paper);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
