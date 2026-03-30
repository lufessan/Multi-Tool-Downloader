import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, FileVideo, UploadCloud } from "lucide-react";

interface TranscriptionResult {
  text: string;
  language: string | null;
  duration: number | null;
}

export default function VideoToText() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleTranscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsTranscribing(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (language) formData.append("language", language);

    try {
      const res = await fetch("/api/transcriber/video", {
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
        <p className="text-muted-foreground text-lg">قم برفع ملف فيديو وسنستخرج الصوت تلقائياً ونحوله إلى نص مكتوب.</p>
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
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-10 h-10 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold">{file ? file.name : "اضغط هنا لاختيار ملف فيديو"}</p>
              <p className="text-base text-muted-foreground mt-2 font-medium">MP4, MKV, AVI, MOV, WebM وغيرها — يُستخرج الصوت تلقائياً</p>
            </div>

            <div className="space-y-3">
              <label className="text-base font-bold">لغة المحتوى (اختياري)</label>
              <Input
                placeholder="مثال: ar للعربية، en للإنجليزية، fr للفرنسية"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                dir="ltr"
                className="text-left h-12"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-bold"
              disabled={!file || isTranscribing}
            >
              {isTranscribing ? (
                <Loader2 className="w-6 h-6 animate-spin ml-2" />
              ) : (
                <FileVideo className="w-6 h-6 ml-2" />
              )}
              {isTranscribing ? "جاري استخراج النص..." : "بدء التفريغ"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 border-primary/20 bg-primary/5">
          <CardContent className="pt-8 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-2xl">النص المستخرج</h3>
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
