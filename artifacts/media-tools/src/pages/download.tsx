import { useState } from "react";
import { useGetVideoInfo } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useElapsedTimer, formatElapsed } from "@/hooks/use-elapsed-timer";
import { Loader2, Download as DownloadIcon, Search, Video, Music, Clock, HardDrive } from "lucide-react";
import type { VideoFormat } from "@workspace/api-client-react";

export default function Download() {
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const getInfo = useGetVideoInfo();
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadType, setDownloadType] = useState<"video" | "audio">("video");
  const fetchElapsed = useElapsedTimer(getInfo.isPending);
  const downloadElapsed = useElapsedTimer(downloadingFormat !== null);

  const handleGetInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    getInfo.mutate({ data: { url } }, {
      onError: () => toast({ title: "حدث خطأ", description: "تعذر جلب معلومات الفيديو. تأكد من صحة الرابط.", variant: "destructive" })
    });
  };

  const handleDownload = async (formatId: string | null = null, ext: string = "mp4", type: "video" | "audio" = "video") => {
    const key = formatId || "best";
    setDownloadingFormat(key);
    try {
      const res = await fetch("/api/downloader/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, type, format_id: formatId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "فشل التنزيل");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `download.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "تم التنزيل", description: "تم بدء تنزيل الملف بنجاح" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء التنزيل";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setDownloadingFormat(null);
    }
  };

  const isDownloading = downloadingFormat !== null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">تنزيل الوسائط</h2>
        <p className="text-muted-foreground text-lg">حمل الفيديوهات والصوتيات من أي موقع بسهولة.</p>
      </div>

      <Card className="border-primary/20 bg-card/60 backdrop-blur-sm">
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={handleGetInfo} className="flex gap-4">
            <Input
              placeholder="ضع رابط الفيديو هنا... (مثال: youtube.com/watch?v=...)"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="text-left h-12 text-lg" dir="ltr"
            />
            <Button type="submit" size="lg" className="h-12 px-8" disabled={getInfo.isPending}>
              {getInfo.isPending ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Search className="w-5 h-5 ml-2" />}
              <span className="font-bold">جلب البيانات</span>
            </Button>
          </form>

          {getInfo.isPending && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground px-1">
                <span>جاري جلب معلومات الرابط...</span>
                <span className="font-bold tabular-nums">{formatElapsed(fetchElapsed)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse w-full" />
              </div>
            </div>
          )}
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
                <p className="text-sm text-primary mt-1 font-semibold">{getInfo.data.uploader}</p>
              )}
              {getInfo.data.duration && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatElapsed(getInfo.data.duration)}
                </p>
              )}
            </CardHeader>
          </Card>

          <Card className="lg:col-span-2 border-border/50 bg-card/40">
            <CardContent className="p-6 space-y-6">
              <div className="bg-primary/10 border border-primary/20 p-5 rounded-xl space-y-4">
                <h4 className="font-bold text-lg text-primary">تنزيل سريع</h4>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    size="lg"
                    variant={downloadType === "video" ? "default" : "outline"}
                    onClick={() => setDownloadType("video")}
                    className="font-bold flex-1"
                    disabled={isDownloading}
                  >
                    <Video className="w-5 h-5 ml-2" />
                    فيديو (أفضل جودة)
                  </Button>
                  <Button
                    size="lg"
                    variant={downloadType === "audio" ? "default" : "outline"}
                    onClick={() => setDownloadType("audio")}
                    className="font-bold flex-1"
                    disabled={isDownloading}
                  >
                    <Music className="w-5 h-5 ml-2" />
                    صوت فقط (MP3)
                  </Button>
                </div>

                {isDownloading && downloadingFormat === "best" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground px-1">
                      <span>جاري التنزيل والمعالجة...</span>
                      <span className="font-bold tabular-nums">{formatElapsed(downloadElapsed)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full animate-pulse w-full" />
                    </div>
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full font-bold"
                  onClick={() => handleDownload(null, downloadType === "audio" ? "mp3" : "mp4", downloadType)}
                  disabled={isDownloading}
                >
                  {isDownloading && downloadingFormat === "best"
                    ? <Loader2 className="w-5 h-5 animate-spin ml-2" />
                    : <DownloadIcon className="w-5 h-5 ml-2" />
                  }
                  {isDownloading && downloadingFormat === "best"
                    ? `جاري التنزيل... (${formatElapsed(downloadElapsed)})`
                    : "تنزيل الآن"
                  }
                </Button>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-xl">الجودات المتوفرة</h3>
                <div className="grid gap-3">
                  {getInfo.data.formats.map((f: VideoFormat) => (
                    <div key={f.format_id} className="flex flex-wrap sm:flex-nowrap justify-between items-center border border-border/50 bg-background/50 p-4 rounded-xl hover:border-primary/30 transition-colors">
                      <div className="flex flex-col mb-3 sm:mb-0">
                        <span className="font-bold text-lg" dir="ltr">
                          {f.resolution} <span className="text-muted-foreground text-sm uppercase">{f.ext}</span>
                        </span>
                        {f.filesize && (
                          <span className="text-sm text-muted-foreground font-medium flex items-center gap-1">
                            <HardDrive className="w-3.5 h-3.5" />
                            {(f.filesize / 1024 / 1024).toFixed(2)} MB
                          </span>
                        )}
                      </div>
                      <div className="w-full sm:w-auto space-y-1">
                        {isDownloading && downloadingFormat === f.format_id && (
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full sm:w-24">
                            <div className="h-full bg-primary rounded-full animate-pulse w-full" />
                          </div>
                        )}
                        <Button
                          variant="secondary"
                          className="w-full sm:w-auto font-bold"
                          onClick={() => handleDownload(f.format_id, f.ext)}
                          disabled={isDownloading}
                        >
                          {isDownloading && downloadingFormat === f.format_id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : "تنزيل"
                          }
                        </Button>
                      </div>
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
