import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./lib/theme-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" storageKey="data-vantage-theme">
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
