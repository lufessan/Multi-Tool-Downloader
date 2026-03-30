import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSimulatedProgress } from "@/hooks/use-simulated-progress";
import { formatElapsed } from "@/hooks/use-elapsed-timer";
import { Loader2, Copy, FileVideo, UploadCloud, Link } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LANGUAGES = [
  { code: "auto", label: "تلقائي (اكتشاف اللغة تلقائياً)" },
  { code: "ar", label: "العربية" },
  { code: "en", label: "الإنجليزية" },
  { code: "fr", label: "الفرنسية" },
  { code: "es", label: "الإسبانية" },
  { code: "de", label: "الألمانية" },
  { code: "it", label: "الإيطالية" },
  { code: "pt", label: "البرتغالية" },
  { code: "ru", label: "الروسية" },
  { code: "ja", label: "اليابانية" },
  { code: "ko", label: "الكورية" },
  { code: "zh", label: "الصينية" },
  { code: "tr", label: "التركية" },
  { code: "fa", label: "الفارسية" },
  { code: "hi", label: "الهندية" },
  { code: "ur", label: "الأوردية" },
  { code: "id", label: "الإندونيسية" },
  { code: "nl", label: "الهولندية" },
  { code: "pl", label: "البولندية" },
  { code: "sv", label: "السويدية" },
  { code: "el", label: "اليونانية" },
];

interface TranscriptionResult {
  text: string;
  language: string | null;
  duration: number | null;
}

type InputMode = "file" | "url";

export default function VideoToText() {
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("auto");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const progress = useSimulatedProgress(isTranscribing);

  const canSubmit = mode === "file" ? !!file : url.trim().length > 5;

  const handleTranscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsTranscribing(true);
    setResult(null);

    try {
      let res: Response;

      if (mode === "file") {
        const formData = new FormData();
        formData.append("file", file!);
        if (language && language !== "auto") formData.append("language", language);
        res = await fetch("/api/transcriber/video", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/transcriber/from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), language: language !== "auto" ? language : undefined }),
        });
      }

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "فشل التفريغ");
      }
      const data = await res.json() as TranscriptionResult;
      setResult(data);
      toast({ title: "اكتمل التفريغ", description: "تم استخراج النص بنجاح" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء تفريغ الفيديو";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setIsTranscribing(false);
    }
  };

  const copyText = () => {
    if (result?.text) {
      navigator.clipboard.writeText(result.text);
      toast({ title: "تم النسخ", description: "تم نسخ النص إلى الحافظة" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">تفريغ الفيديو إلى نص</h2>
        <p className="text-muted-foreground text-lg">ارفع ملف فيديو أو أدخل رابطاً من أي موقع وسنستخرج النص تلقائياً.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleTranscribe} className="space-y-8">

            {/* Mode toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border bg-muted/30 p-1 gap-1">
              <button
                type="button"
                onClick={() => { setMode("file"); setResult(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === "file" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <UploadCloud className="w-4 h-4" />
                رفع ملف
              </button>
              <button
                type="button"
                onClick={() => { setMode("url"); setResult(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === "url" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Link className="w-4 h-4" />
                رابط
              </button>
            </div>

            {/* File mode */}
            {mode === "file" && (
              <div
                className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
                onClick={() => fileRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileRef}
                  className="hidden"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold">{file ? file.name : "اضغط هنا لاختيار ملف فيديو"}</p>
                <p className="text-base text-muted-foreground mt-2 font-medium">MP4, MKV, AVI, MOV, WebM وغيرها — يُستخرج الصوت تلقائياً</p>
                {file && (
                  <p className="text-sm text-primary mt-1 font-semibold">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            )}

            {/* URL mode */}
            {mode === "url" && (
              <div className="space-y-3">
                <div className="relative">
                  <Link className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="https://youtube.com/watch?v=... أو أي رابط فيديو"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="h-14 pr-12 font-medium text-base"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  يدعم يوتيوب، تيك توك، تويتر/X، إنستغرام، فيسبوك، وآلاف المواقع الأخرى
                </p>
              </div>
            )}

            {/* Language selector */}
            <div className="space-y-3">
              <label className="text-base font-bold">لغة محتوى الفيديو</label>
              <Select value={language} onValueChange={setLanguage} dir="rtl">
                <SelectTrigger className="h-12 font-bold">
                  <SelectValue placeholder="اختر اللغة أو اتركها تلقائياً" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code} className="font-medium">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">تحديد اللغة يزيد من دقة التفريغ</p>
            </div>

            {/* Progress */}
            {isTranscribing && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm px-0.5">
                  <span className="text-muted-foreground">
                    {mode === "url" ? "جاري تنزيل الفيديو وتفريغ المحتوى..." : "جاري استخراج الصوت والتفريغ..."}
                  </span>
                  <span className="font-black tabular-nums text-primary text-base">{progress}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-bold"
              disabled={!canSubmit || isTranscribing}
            >
              {isTranscribing ? (
                <Loader2 className="w-6 h-6 animate-spin ml-2" />
              ) : (
                <FileVideo className="w-6 h-6 ml-2" />
              )}
              {isTranscribing ? `جاري التفريغ... ${progress}%` : "بدء التفريغ"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 border-primary/20 bg-primary/5">
          <CardContent className="pt-8 space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-2xl">النص المستخرج</h3>
                {result.language && (
                  <p className="text-sm text-muted-foreground mt-1">
                    اللغة المكتشفة: <strong>{LANGUAGES.find(l => l.code === result.language)?.label || result.language}</strong>
                  </p>
                )}
                {result.duration && (
                  <p className="text-sm text-muted-foreground">
                    مدة الصوت: <strong>{formatElapsed(Math.round(result.duration))}</strong>
                  </p>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={copyText} className="font-bold">
                <Copy className="w-4 h-4 ml-2" />
                نسخ النص
              </Button>
            </div>
            <div className="p-6 bg-background rounded-xl border border-border text-lg leading-relaxed whitespace-pre-wrap font-medium">
              {result.text}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
