import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSimulatedProgress } from "@/hooks/use-simulated-progress";
import { Loader2, Music, UploadCloud, HardDrive } from "lucide-react";

export default function ToMp3() {
  const [file, setFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const progress = useSimulatedProgress(isConverting);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsConverting(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch('/api/converter/to-mp3', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error("فشل التحويل");
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${file.name.split('.')[0] || 'audio'}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "تم التحويل", description: "تم تنزيل ملف MP3 بنجاح" });
    } catch (err) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء التحويل", variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">تحويل الفيديو إلى MP3</h2>
        <p className="text-muted-foreground text-lg">استخرج الصوت بجودة عالية من أي ملف فيديو بنقرة واحدة.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleConvert} className="space-y-8">
            <div 
              className="border-3 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
              onClick={() => fileRef.current?.click()}
            >
              <input type="file" ref={fileRef} className="hidden" accept="video/*" onChange={e => setFile(e.target.files?.[0] || null)} />
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

            {isConverting && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm px-0.5">
                  <span className="text-muted-foreground">جاري استخراج الصوت وتحويله...</span>
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

            <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={!file || isConverting}>
              {isConverting ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Music className="w-6 h-6 ml-2" />}
              {isConverting ? `جاري التحويل... ${progress}%` : "تحويل وتنزيل MP3"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}