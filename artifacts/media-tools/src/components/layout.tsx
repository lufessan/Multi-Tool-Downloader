import { Link, useLocation } from "wouter";
import { Home } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isHome = location === "/";

  return (
    <div
      className="min-h-[100dvh] text-foreground selection:bg-primary/30 overflow-x-hidden"
      style={{
        backgroundImage: "url('/luffy-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: isHome
            ? "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)"
            : "rgba(0,0,0,0.72)",
          backdropFilter: isHome ? "none" : "blur(2px)",
        }}
      />

      <div className="relative z-10 min-h-[100dvh]">
        {/* Top bar for inner pages */}
        {!isHome && (
          <header className="sticky top-0 z-20 h-14 flex items-center px-5 border-b border-white/10 bg-black/40 backdrop-blur-md">
            <Link
              href="/"
              className="flex items-center gap-2 text-white/80 hover:text-white transition-colors font-bold text-sm"
            >
              <Home className="w-4 h-4" />
              <span>الرئيسية</span>
            </Link>
          </header>
        )}

        {/* Content */}
        <main className={isHome ? "" : "p-4 md:p-8"}>
          {isHome ? (
            children
          ) : (
            <div className="max-w-3xl mx-auto">{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}
