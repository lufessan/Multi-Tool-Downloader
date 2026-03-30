import { Link } from "wouter";
import { Download, Scissors, FileAudio, FileVideo, Music, Tv, Radio } from "lucide-react";
import { useRef } from "react";

const tools = [
  {
    href: "/download",
    title: "تنزيل الوسائط",
    description: "حمل الفيديوهات والصوتيات من أي موقع بسهولة وبأعلى جودة",
    icon: Download,
    gradFrom: "#3b82f6",
    gradTo: "#1e40af",
    glow: "#3b82f6",
  },
  {
    href: "/clipper",
    title: "قص المقاطع",
    description: "حدد وقت البداية والنهاية واستخرج جزءاً من أي فيديو يوتيوب",
    icon: Scissors,
    gradFrom: "#f43f5e",
    gradTo: "#be123c",
    glow: "#f43f5e",
  },
  {
    href: "/audio-to-text",
    title: "صوت إلى نص",
    description: "حول أي ملف صوتي إلى نص مكتوب بدقة عالية",
    icon: FileAudio,
    gradFrom: "#f59e0b",
    gradTo: "#b45309",
    glow: "#f59e0b",
  },
  {
    href: "/video-to-text",
    title: "فيديو إلى نص",
    description: "استخرج الصوت من أي فيديو وحوله إلى نص تلقائياً",
    icon: FileVideo,
    gradFrom: "#f97316",
    gradTo: "#c2410c",
    glow: "#f97316",
  },
  {
    href: "/to-mp3",
    title: "تحويل لـ MP3",
    description: "استخرج الصوت من أي فيديو بجودة عالية بنقرة واحدة",
    icon: Music,
    gradFrom: "#10b981",
    gradTo: "#065f46",
    glow: "#10b981",
  },
  {
    href: "/anime",
    title: "التعرف على الأنمي",
    description: "ارفع لقطة أو اكتب وصفاً وسنجد لك الأنمي مع روابط المشاهدة",
    icon: Tv,
    gradFrom: "#8b5cf6",
    gradTo: "#5b21b6",
    glow: "#8b5cf6",
  },
  {
    href: "/podcast",
    title: "التعرف على بودكاست",
    description: "ارفع صورة الغلاف أو مقطعاً صوتياً لتعرف على البودكاست",
    icon: Radio,
    gradFrom: "#a855f7",
    gradTo: "#7e22ce",
    glow: "#a855f7",
  },
];

function Tool3DCard({ tool }: { tool: typeof tools[number] }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 28}deg) rotateX(${-y * 28}deg) translateZ(20px) scale(1.04)`;
    el.style.transition = "transform 0.08s ease-out";
  };

  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = "perspective(700px) rotateY(0deg) rotateX(0deg) translateZ(0px) scale(1)";
    el.style.transition = "transform 0.45s cubic-bezier(0.23,1,0.32,1)";
  };

  const Icon = tool.icon;

  return (
    <Link href={tool.href} className="block focus:outline-none">
      <div
        ref={cardRef}
        className="cursor-pointer select-none"
        style={{ transformStyle: "preserve-3d" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* 3D Icon container */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div
            className="relative w-20 h-20 md:w-24 md:h-24 rounded-3xl flex items-center justify-center"
            style={{
              background: `linear-gradient(145deg, ${tool.gradFrom}, ${tool.gradTo})`,
              boxShadow: `0 8px 32px ${tool.glow}80, 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)`,
              transform: "translateZ(40px)",
            }}
          >
            {/* Inner highlight */}
            <div
              className="absolute inset-0 rounded-3xl"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 60%)",
              }}
            />
            <Icon
              className="w-10 h-10 md:w-12 md:h-12 text-white relative z-10"
              style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" }}
            />
            {/* Bottom glow reflection */}
            <div
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-3/4 h-3 rounded-full blur-md opacity-80"
              style={{ background: tool.glow }}
            />
          </div>

          {/* Title */}
          <h3
            className="text-base md:text-lg font-black text-white text-center leading-tight"
            style={{
              transform: "translateZ(20px)",
              textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 0 30px rgba(0,0,0,0.8)",
            }}
          >
            {tool.title}
          </h3>

          {/* Description */}
          <p
            className="text-xs md:text-sm text-white/75 text-center max-w-[160px] leading-snug"
            style={{
              transform: "translateZ(10px)",
              textShadow: "0 1px 6px rgba(0,0,0,0.9)",
            }}
          >
            {tool.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12">
      {/* Title */}
      <div className="text-center mb-14 space-y-3">
        <h1
          className="text-4xl md:text-6xl font-black text-white"
          style={{ textShadow: "0 0 40px rgba(255,255,255,0.3), 0 4px 20px rgba(0,0,0,0.8)" }}
        >
          أدوات الوسائط
        </h1>
        <p
          className="text-white/70 text-base md:text-lg font-medium"
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
        >
          منصتك الشاملة لمعالجة المحتوى — اختر الأداة وابدأ فوراً
        </p>
      </div>

      {/* 4-column grid */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 w-full max-w-5xl"
        style={{ perspective: "1200px" }}
      >
        {tools.map((tool) => (
          <Tool3DCard key={tool.href} tool={tool} />
        ))}
      </div>
    </div>
  );
}
