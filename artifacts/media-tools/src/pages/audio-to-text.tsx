import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSimulatedProgress } from "@/hooks/use-simulated-progress";
import { Loader2, Copy, FileText, UploadCloud } from "lucide-react";
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

export default function AudioToText() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("auto");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const progress = useSimulatedProgress(isTranscribing);

  const handleTranscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsTranscribing(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (language && language !== "auto") formData.append("language", language);

    try {
      const res = await fetch("/api/transcriber/audio", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "فشل التفريغ");
      }
      const data = await res.json() as TranscriptionResult;
      setResult(data);
      toast({ title: "اكتمل التفريغ", description: "تم استخراج النص بنجاح" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء تفريغ النص";
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
        <h2 className="text-3xl font-black">تفريغ الصوت إلى نص</h2>
        <p className="text-muted-foreground text-lg">قم برفع ملف صوتي (MP3، WAV، M4A، وغيرها) وسنحوله إلى نص مكتوب.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleTranscribe} className="space-y-8">
            <div
              className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
              onClick={() => fileRef.current?.click()}
            >
              <input
                type="file"
                ref={fileRef}
                className="hidden"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-10 h-10 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold">{file ? file.name : "اضغط هنا لاختيار ملف صوتي"}</p>
              <p className="text-base text-muted-foreground mt-2 font-medium">MP3, WAV, M4A, OGG, FLAC وغيرها</p>
              {file && (
                <p className="text-sm text-primary mt-1 font-semibold">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-base font-bold">لغة الملف الصوتي</label>
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

            {isTranscribing && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm px-0.5">
                  <span className="text-muted-foreground">جاري التفريغ بالذكاء الاصطناعي...</span>
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
              disabled={!file || isTranscribing}
            >
              {isTranscribing ? (
                <Loader2 className="w-6 h-6 animate-spin ml-2" />
              ) : (
                <FileText className="w-6 h-6 ml-2" />
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
