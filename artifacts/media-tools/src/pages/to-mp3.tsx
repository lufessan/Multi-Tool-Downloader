import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSimulatedProgress } from "@/hooks/use-simulated-progress";
import { Loader2, Music, UploadCloud, HardDrive, Link } from "lucide-react";

type InputMode = "file" | "url";

export default function ToMp3() {
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const progress = useSimulatedProgress(isConverting);

  const canSubmit = mode === "file" ? !!file : url.trim().length > 5;

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsConverting(true);

    try {
      let res: Response;
      let filename = "audio.mp3";

      if (mode === "file") {
        const formData = new FormData();
        formData.append("file", file!);
        filename = `${file!.name.split(".")[0] || "audio"}.mp3`;
        res = await fetch("/api/converter/to-mp3", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/converter/to-mp3-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        filename = "audio.mp3";
      }

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "فشل التحويل");
      }

      const blob = await res.blob();
      // Try to get filename from Content-Disposition header
      const disposition = res.headers.get("content-disposition");
      if (disposition) {
        const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i);
        if (utf8Match) filename = decodeURIComponent(utf8Match[1]);
        else {
          const plain = disposition.match(/filename="?([^";\n]+)"?/i);
          if (plain) filename = plain[1];
        }
      }

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "تم التحويل", description: "تم تنزيل ملف MP3 بنجاح" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء التحويل";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">تحويل الفيديو إلى MP3</h2>
        <p className="text-muted-foreground text-lg">ارفع ملف فيديو أو أدخل رابطاً واستخرج الصوت بجودة عالية.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleConvert} className="space-y-8">

            {/* Mode toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border bg-muted/30 p-1 gap-1">
              <button
                type="button"
                onClick={() => setMode("file")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === "file" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <UploadCloud className="w-4 h-4" />
                رفع ملف
              </button>
              <button
                type="button"
                onClick={() => setMode("url")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === "url" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Link className="w-4 h-4" />
                رابط
              </button>
            </div>

            {/* File mode */}
            {mode === "file" && (
              <div
                className="border-3 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
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
                <p className="text-xl font-bold">{file ? file.name : "اضغط هنا لاختيار فيديو"}</p>
                <p className="text-base text-muted-foreground mt-2 font-medium">يدعم جميع صيغ الفيديو المعروفة (MP4, MKV, AVI والمزيد)</p>
                {file && (
                  <p className="text-sm text-primary font-semibold mt-2 flex items-center justify-center gap-1">
                    <HardDrive className="w-3.5 h-3.5" />
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
                    placeholder="https://youtube.com/watch?v=... أو أي رابط فيديو/صوت"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="h-14 pr-12 font-medium text-base"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  يدعم يوتيوب، تيك توك، تويتر/X، إنستغرام، ساوندكلاود، وآلاف المواقع الأخرى
                </p>
              </div>
            )}

            {/* Progress */}
            {isConverting && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm px-0.5">
                  <span className="text-muted-foreground">
                    {mode === "url" ? "جاري تنزيل الفيديو وتحويله..." : "جاري استخراج الصوت وتحويله..."}
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
              disabled={!canSubmit || isConverting}
            >
              {isConverting ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Music className="w-6 h-6 ml-2" />}
              {isConverting ? `جاري التحويل... ${progress}%` : "تحويل وتنزيل MP3"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
