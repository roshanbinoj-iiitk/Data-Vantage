import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Duplicates } from "./pages/Duplicates";
import { FolderView } from "./pages/FolderView";
import { useTheme } from "./lib/theme-provider";
import { Button } from "./components/ui/button";
import { useScan } from "./hooks/use-scan";
import { cn } from "./lib/utils";

function App() {
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const { progress } = useScan();

  const navItems = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/duplicates", label: "Duplicates", icon: "📋" },
    { path: "/folders", label: "Files", icon: "📁" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* progress indicator bar */}
        {progress && progress.isScanning && (
          <div className="h-1 w-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary animate-progress" />
          </div>
        )}
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="text-primary">◆</span>
              Data-Vantage
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive =
                  item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            title="Toggle theme"
          >
            {resolvedTheme === "dark" ? "☀️" : "🌙"}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/duplicates/:scanId?" element={<Duplicates />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/folders/:scanId?" element={<FolderView />} />
          <Route path="/folders" element={<FolderView />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 mt-12">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          Data-Vantage v1.0 — High-performance file scanner & duplicate detector
        </div>
      </footer>
    </div>
  );
}

export default App;
