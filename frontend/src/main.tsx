import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./lib/theme-provider";
import { FiltersProvider } from "./lib/filters";
import { ToastProvider } from "./components/Toast";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" storageKey="data-vantage-theme">
        <FiltersProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </FiltersProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
