import { Link } from "wouter";
import { Download, Scissors, FileText, Music, Tv, Radio } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const tools = [
  { href: "/download", title: "تنزيل الوسائط", description: "حمل الفيديوهات والصوتيات من أي موقع بسهولة وبأعلى جودة", icon: Download, color: "text-blue-400" },
  { href: "/clipper", title: "قص المقاطع", description: "حدد وقت البداية والنهاية واستخرج جزءاً من فيديو يوتيوب", icon: Scissors, color: "text-rose-400" },
  { href: "/transcribe", title: "تفريغ النص", description: "حول أي ملف صوتي أو فيديو إلى نص مكتوب بدقة عالية", icon: FileText, color: "text-amber-400" },
  { href: "/to-mp3", title: "تحويل لـ MP3", description: "استخرج الصوت من أي فيديو بنقرة واحدة", icon: Music, color: "text-emerald-400" },
  { href: "/anime", title: "التعرف على الأنمي", description: "ارفع صورة لقطة أو أدخل وصفاً وسنجد لك الأنمي", icon: Tv, color: "text-indigo-400" },
  { href: "/podcast", title: "التعرف على البودكاست", description: "ارفع غلاف البودكاست أو مقطعاً صوتياً لنجد لك المصدر", icon: Radio, color: "text-purple-400" },
];

export default function Home() {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-4">
        <h2 className="text-4xl font-black tracking-tight text-foreground">مرحباً بك في <span className="text-primary">أدوات الوسائط</span></h2>
        <p className="text-muted-foreground text-xl max-w-2xl font-medium">منصتك الشاملة لمعالجة وتحليل المحتوى بذكاء وسرعة. اختر الأداة التي تحتاجها وابدأ فوراً.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href} className="block group">
            <Card className="h-full border-border/40 hover:border-primary/50 transition-all duration-300 bg-card/40 hover:bg-card hover:shadow-xl hover:shadow-primary/5">
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-background border border-border/50 shadow-sm flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <tool.icon className={`w-7 h-7 ${tool.color}`} />
                </div>
                <CardTitle className="text-2xl font-bold">{tool.title}</CardTitle>
                <CardDescription className="text-base mt-2 font-medium leading-relaxed">{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}