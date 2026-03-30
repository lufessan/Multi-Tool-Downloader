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
    el.style.transform = `perspective(700px) rotateY(${x * 28}deg) rotateX(${-y * 28}deg) translateZ(20px) scale(1.06)`;
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
        <div className="flex flex-col items-center gap-2 py-1">
          {/* Icon box */}
          <div
            className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl flex items-center justify-center"
            style={{
              background: `linear-gradient(145deg, ${tool.gradFrom}, ${tool.gradTo})`,
              boxShadow: `0 6px 24px ${tool.glow}80, 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)`,
              transform: "translateZ(40px)",
            }}
          >
            <div
              className="absolute inset-0 rounded-2xl md:rounded-3xl"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 60%)",
              }}
            />
            <Icon
              className="w-8 h-8 md:w-10 md:h-10 text-white relative z-10"
              style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" }}
            />
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-2 rounded-full blur-md opacity-75"
              style={{ background: tool.glow }}
            />
          </div>

          {/* Title */}
          <h3
            className="text-sm md:text-base font-black text-white text-center leading-tight"
            style={{
              transform: "translateZ(20px)",
              textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 0 30px rgba(0,0,0,0.8)",
            }}
          >
            {tool.title}
          </h3>

          {/* Description */}
          <p
            className="text-[11px] md:text-xs text-white/70 text-center leading-snug"
            style={{
              transform: "translateZ(10px)",
              textShadow: "0 1px 6px rgba(0,0,0,0.9)",
              maxWidth: "120px",
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
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10 overflow-x-hidden"
    >
      {/* Title */}
      <div className="text-center mb-10 space-y-2">
        <h1
          className="text-4xl md:text-6xl font-black text-white"
          style={{ textShadow: "0 0 40px rgba(255,255,255,0.3), 0 4px 20px rgba(0,0,0,0.8)" }}
        >
          أدوات الوسائط
        </h1>
        <p
          className="text-white/70 text-sm md:text-base font-medium"
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
        >
          منصتك الشاملة لمعالجة المحتوى — اختر الأداة وابدأ فوراً
        </p>
      </div>

      {/* Flex wrap — centers last row automatically */}
      <div
        className="flex flex-wrap justify-center gap-6 md:gap-10 w-full max-w-3xl mx-auto"
        style={{ perspective: "1200px" }}
      >
        {tools.map((tool) => (
          <div key={tool.href} className="w-[140px] md:w-[160px]">
            <Tool3DCard tool={tool} />
          </div>
        ))}
      </div>
    </div>
  );
}
