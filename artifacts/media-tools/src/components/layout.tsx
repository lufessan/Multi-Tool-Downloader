import { Link, useLocation } from "wouter";
import { Download, Scissors, FileText, Music, Tv, Radio, LayoutGrid, FileAudio, FileVideo } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "الرئيسية", icon: LayoutGrid },
  { href: "/download", label: "تنزيل الوسائط", icon: Download },
  { href: "/clipper", label: "قص المقاطع", icon: Scissors },
  { href: "/audio-to-text", label: "صوت إلى نص", icon: FileAudio },
  { href: "/video-to-text", label: "فيديو إلى نص", icon: FileVideo },
  { href: "/to-mp3", label: "تحويل لـ MP3", icon: Music },
  { href: "/anime", label: "التعرف على الأنمي", icon: Tv },
  { href: "/podcast", label: "التعرف على بودكاست", icon: Radio },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="w-72 border-l border-border/50 bg-card/30 flex-shrink-0 flex-col hidden md:flex">
        <div className="p-8">
          <Link href="/" className="inline-block group">
            <h1 className="text-3xl font-black text-primary tracking-tight cursor-pointer group-hover:opacity-90 transition-opacity">أدوات الوسائط</h1>
            <p className="text-sm text-muted-foreground mt-2 font-medium">مجموعة أدواتك الاحترافية</p>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all font-bold text-sm",
                isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6 md:hidden">
          <Link href="/" className="inline-block">
            <h1 className="text-xl font-black text-primary">أدوات الوسائط</h1>
          </Link>
        </header>
        <div className="flex-1 p-6 lg:p-12 overflow-auto">
          <div className="max-w-4xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
