import { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, X, LayoutDashboard, FolderOpen, Copy, HardDrive } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Files", href: "/files", icon: FolderOpen },
  { name: "Duplicates", href: "/duplicates", icon: Copy },
];

const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function Layout() {
  const isDesktop = useIsDesktop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after navigating.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const sidebarVisible = isDesktop || mobileOpen;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur-md shadow-sm">
        <div className="flex h-16 items-center px-4 gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((o) => !o)}
            className="lg:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <HardDrive className="h-6 w-6 text-blue-600" aria-hidden />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Data Vantage
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Mobile backdrop */}
        {!isDesktop && mobileOpen && (
          <div className="fixed inset-0 top-16 z-30 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
        )}

        <aside
          id="app-sidebar"
          className={cn(
            "top-16 left-0 z-40 h-[calc(100vh-4rem)] w-16 border-r border-border bg-card shadow-sm",
            isDesktop ? "sticky" : "fixed transition-transform duration-200",
            sidebarVisible ? "translate-x-0" : "-translate-x-full",
          )}
          hidden={!sidebarVisible}
        >
          <nav className="space-y-1 p-3" aria-label="Main">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "relative group flex items-center justify-center rounded-lg p-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/70 hover:text-foreground hover:bg-accent",
                  )}
                  aria-label={item.name}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-card/90 px-2 py-1 text-sm font-medium text-foreground opacity-0 shadow-sm pointer-events-none transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading…</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
