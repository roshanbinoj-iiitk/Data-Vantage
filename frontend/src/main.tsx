import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./lib/theme-provider";
import { FiltersProvider } from "./lib/filters";
import { AppQueryProvider } from "./lib/query-client";
import { ToastProvider } from "./components/Toast";
import { ScanProvider } from "./hooks/use-scan";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" storageKey="data-vantage-theme">
        <ToastProvider>
          <AppQueryProvider>
            <FiltersProvider>
              <ScanProvider>
                <App />
              </ScanProvider>
            </FiltersProvider>
          </AppQueryProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
