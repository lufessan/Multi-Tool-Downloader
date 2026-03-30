import { useState } from "react";
import { useGetVideoInfo } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download as DownloadIcon, Search } from "lucide-react";
import type { VideoFormat } from "@workspace/api-client-react";

export default function Download() {
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const getInfo = useGetVideoInfo();
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  const handleGetInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    getInfo.mutate({ data: { url } }, {
      onError: () => toast({ title: "حدث خطأ", description: "تعذر جلب معلومات الفيديو. تأكد من صحة الرابط.", variant: "destructive" })
    });
  };

  const handleDownload = async (formatId: string | null = null, ext: string = 'mp4', type: 'video'|'audio' = 'video') => {
    setDownloadingFormat(formatId || 'best');
    try {
      const res = await fetch('/api/downloader/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type, format_id: formatId })
      });
      if (!res.ok) throw new Error("فشل التنزيل");
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `download.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "تم التنزيل", description: "تم بدء تنزيل الملف بنجاح" });
    } catch (err) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء التنزيل", variant: "destructive" });
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">تنزيل الوسائط</h2>
        <p className="text-muted-foreground text-lg">حمل الفيديوهات والصوتيات من أي موقع بسهولة.</p>
      </div>

      <Card className="border-primary/20 bg-card/60 backdrop-blur-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleGetInfo} className="flex gap-4">
            <Input 
              placeholder="ضع رابط الفيديو هنا... (مثال: youtube.com/watch?v=...)" 
              value={url} 
              onChange={e => setUrl(e.target.value)} 
              className="text-left h-12 text-lg" dir="ltr"
            />
            <Button type="submit" size="lg" className="h-12 px-8" disabled={getInfo.isPending}>
              {getInfo.isPending ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Search className="w-5 h-5 ml-2" />}
              <span className="font-bold">بحث</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {getInfo.data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          <Card className="lg:col-span-1 border-border/50 bg-card/40 overflow-hidden h-fit">
            {getInfo.data.thumbnail && (
              <div className="aspect-video w-full bg-muted">
                <img src={getInfo.data.thumbnail} alt={getInfo.data.title} className="w-full h-full object-cover" />
              </div>
            )}
            <CardHeader className="p-4">
              <CardTitle className="text-lg leading-snug">{getInfo.data.title}</CardTitle>
              {getInfo.data.uploader && (
                <p className="text-sm text-muted-foreground mt-2 font-medium">{getInfo.data.uploader}</p>
              )}
            </CardHeader>
          </Card>

          <Card className="lg:col-span-2 border-border/50 bg-card/40">
            <CardContent className="p-6 space-y-6">
              <div className="flex justify-between items-center bg-primary/10 border border-primary/20 p-5 rounded-xl">
                <div>
                  <h4 className="font-bold text-lg text-primary">تنزيل سريع (أفضل جودة)</h4>
                  <p className="text-sm text-muted-foreground mt-1">تنزيل الفيديو بأفضل جودة متوفرة تلقائياً</p>
                </div>
                <Button size="lg" onClick={() => handleDownload(null)} disabled={downloadingFormat !== null} className="font-bold">
                  {downloadingFormat === 'best' ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <DownloadIcon className="w-5 h-5 ml-2" />}
                  تنزيل الآن
                </Button>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-xl">الجودات المتوفرة المخصصة</h3>
                <div className="grid gap-3">
                  {getInfo.data.formats.map((f: VideoFormat) => (
                    <div key={f.format_id} className="flex flex-wrap sm:flex-nowrap justify-between items-center border border-border/50 bg-background/50 p-4 rounded-xl hover:border-primary/30 transition-colors">
                      <div className="flex flex-col mb-3 sm:mb-0">
                        <span className="font-bold text-lg" dir="ltr">{f.resolution} <span className="text-muted-foreground text-sm uppercase">{f.ext}</span></span>
                        {f.filesize && <span className="text-sm text-muted-foreground font-medium">{(f.filesize / 1024 / 1024).toFixed(2)} MB</span>}
                      </div>
                      <Button variant="secondary" className="w-full sm:w-auto font-bold"
                        onClick={() => handleDownload(f.format_id, f.ext)} 
                        disabled={downloadingFormat !== null}>
                        {downloadingFormat === f.format_id ? <Loader2 className="w-4 h-4 animate-spin" /> : "تنزيل"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}