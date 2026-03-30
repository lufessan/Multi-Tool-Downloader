import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSimulatedProgress } from "@/hooks/use-simulated-progress";
import { formatElapsed } from "@/hooks/use-elapsed-timer";
import { Loader2, Scissors, Search, Clock, HardDrive, Cookie } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetYouTubeInfo } from "@workspace/api-client-react";
import type { VideoFormat } from "@workspace/api-client-react";

type ClipType = "video" | "audio" | "mp3";

function CookiesHelp() {
  return (
    <div className="border border-yellow-500/40 bg-yellow-500/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 font-bold text-yellow-400">
        <Cookie className="w-5 h-5 shrink-0" />
        <span>YouTube حجب الطلب — الحل: إضافة ملف Cookies</span>
      </div>
      <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside marker:font-bold marker:text-yellow-400">
        <li>ثبّت إضافة <strong className="text-foreground">Get cookies.txt LOCALLY</strong> في متصفح Chrome</li>
        <li>افتح YouTube وتأكد من تسجيل الدخول</li>
        <li>اضغط على أيقونة الإضافة واختر <strong className="text-foreground">Export</strong> — سيتم تحميل ملف <code className="bg-muted px-1 rounded text-xs">cookies.txt</code></li>
        <li>افتح الملف بأي محرر نصوص وانسخ كامل المحتوى</li>
        <li>افتح إعدادات Render → Environment → أضف متغير <code className="bg-muted px-1 rounded text-xs">YOUTUBE_COOKIES</code> والصق المحتوى</li>
        <li>احفظ وانتظر إعادة النشر (1-2 دقيقة)</li>
      </ol>
      <p className="text-xs text-muted-foreground">ملاحظة: الـ Cookies صالحة لأشهر عدة قبل الحاجة للتحديث.</p>
    </div>
  );
}

function timeToSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function estimateClipSize(format: VideoFormat | undefined, startTime: string, endTime: string, totalDuration: number | null | undefined): string | null {
  if (!format?.filesize || !totalDuration || totalDuration <= 0) return null;
  const clipSecs = timeToSeconds(endTime) - timeToSeconds(startTime);
  if (clipSecs <= 0) return null;
  const estimated = (format.filesize / totalDuration) * clipSecs;
  return estimated > 1024 * 1024
    ? `${(estimated / 1024 / 1024).toFixed(1)} MB`
    : `${(estimated / 1024).toFixed(0)} KB`;
}

export default function Clipper() {
  const [url, setUrl] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:10");
  const [type, setType] = useState<ClipType>("video");
  const [formatId, setFormatId] = useState<string>("best");
  const [isClipping, setIsClipping] = useState(false);
  const [cookiesError, setCookiesError] = useState(false);
  const { toast } = useToast();
  const getInfo = useGetYouTubeInfo();
  const clipProgress = useSimulatedProgress(isClipping);
  const fetchProgress = useSimulatedProgress(getInfo.isPending);

  const handleFetchInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setFormatId("best");
    setCookiesError(false);
    getInfo.mutate({ data: { url } }, {
      onError: () => toast({ title: "خطأ", description: "تعذر جلب معلومات الفيديو. تأكد من صحة الرابط.", variant: "destructive" })
    });
  };

  const handleTypeChange = (val: string) => {
    if (val === "video" || val === "audio" || val === "mp3") {
      setType(val as ClipType);
      setFormatId("best");
    }
  };

  const handleClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsClipping(true);
    setCookiesError(false);
    try {
      const body = {
        url,
        start_time: startTime,
        end_time: endTime,
        type,
        format_id: formatId === "best" ? null : formatId,
      };
      const res = await fetch("/api/clipper/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; cookies_required?: boolean };
        if (err.cookies_required) { setCookiesError(true); return; }
        throw new Error(err.error || "فشل القص");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `clip.${type === "mp3" ? "mp3" : type === "audio" ? "m4a" : "mp4"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "اكتمل القص", description: "تم تنزيل المقطع بنجاح" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء قص المقطع";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setIsClipping(false);
    }
  };

  const videoFormats = getInfo.data?.formats?.filter((f: VideoFormat) => f.resolution && f.resolution !== "صوت فقط") ?? [];
  const audioFormats = getInfo.data?.formats?.filter((f: VideoFormat) => f.resolution === "صوت فقط") ?? [];
  const showFormats = type === "video" ? videoFormats : audioFormats;

  const selectedFormat = showFormats.find((f: VideoFormat) => f.format_id === formatId);
  const estimatedSize = estimateClipSize(selectedFormat, startTime, endTime, getInfo.data?.duration);
  const clipDuration = Math.max(0, timeToSeconds(endTime) - timeToSeconds(startTime));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">قص مقاطع يوتيوب</h2>
        <p className="text-muted-foreground text-lg">حدد وقت البداية والنهاية واستخرج جزءاً محدداً من أي فيديو بالجودة التي تريدها.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8 space-y-4">
          <form onSubmit={handleFetchInfo} className="flex gap-4">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              dir="ltr"
              className="text-left h-12"
            />
            <Button type="submit" size="lg" className="h-12 px-6 shrink-0" disabled={getInfo.isPending}>
              {getInfo.isPending ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Search className="w-5 h-5 ml-2" />}
              <span className="font-bold">جلب البيانات</span>
            </Button>
          </form>

          {getInfo.isPending && (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-sm px-0.5">
                <span className="text-muted-foreground">جاري جلب بيانات الفيديو...</span>
                <span className="font-black tabular-nums text-primary text-base">{fetchProgress}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${fetchProgress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {cookiesError && <CookiesHelp />}

      {getInfo.data && (
        <Card className="border-primary/20 bg-card/60 overflow-hidden animate-in slide-in-from-bottom-4 duration-400">
          <div className="flex gap-4 p-5">
            {getInfo.data.thumbnail && (
              <img
                src={getInfo.data.thumbnail}
                alt={getInfo.data.title}
                className="w-40 h-24 object-cover rounded-xl shrink-0 bg-muted"
              />
            )}
            <div className="flex-1 min-w-0 space-y-1.5 pt-1">
              <p className="font-bold text-base leading-snug line-clamp-2">{getInfo.data.title}</p>
              {getInfo.data.uploader && (
                <p className="text-sm text-primary font-semibold">{getInfo.data.uploader}</p>
              )}
              {getInfo.data.duration && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  المدة الكاملة: {formatElapsed(getInfo.data.duration)}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="border-border/50 bg-card/40">
        <CardHeader className="pb-2 pt-6 px-8">
          <CardTitle className="text-xl">إعدادات القص</CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <form onSubmit={handleClip} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-base font-bold">وقت البداية</label>
                <Input
                  placeholder="00:00:00"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  dir="ltr"
                  className="text-center h-12 font-mono font-bold text-lg tracking-wider"
                />
              </div>
              <div className="space-y-3">
                <label className="text-base font-bold">وقت النهاية</label>
                <Input
                  placeholder="00:00:10"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  dir="ltr"
                  className="text-center h-12 font-mono font-bold text-lg tracking-wider"
                />
              </div>
            </div>

            {clipDuration > 0 && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 shrink-0" />
                  مدة المقطع: <strong className="text-foreground">{formatElapsed(clipDuration)}</strong>
                </span>
                {estimatedSize && (
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 shrink-0" />
                    الحجم التقريبي: <strong className="text-foreground">{estimatedSize}</strong>
                  </span>
                )}
              </div>
            )}

            <div className="space-y-3">
              <label className="text-base font-bold">صيغة المخرجات</label>
              <Select value={type} onValueChange={handleTypeChange} dir="rtl">
                <SelectTrigger className="h-12 font-bold">
                  <SelectValue placeholder="اختر الصيغة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video" className="font-bold">فيديو (MP4)</SelectItem>
                  <SelectItem value="audio" className="font-bold">صوت (M4A)</SelectItem>
                  <SelectItem value="mp3" className="font-bold">صوت (MP3)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {showFormats.length > 0 && (
              <div className="space-y-3">
                <label className="text-base font-bold">الجودة</label>
                <Select value={formatId} onValueChange={setFormatId} dir="rtl">
                  <SelectTrigger className="h-12 font-bold">
                    <SelectValue placeholder="اختر الجودة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best" className="font-bold">أفضل جودة تلقائياً</SelectItem>
                    {showFormats.map((f: VideoFormat) => (
                      <SelectItem key={f.format_id} value={f.format_id} className="font-medium" dir="ltr">
                        {f.resolution} — {f.ext.toUpperCase()}
                        {f.filesize ? ` (${(f.filesize / 1024 / 1024).toFixed(1)} MB)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!getInfo.data && (
              <p className="text-sm text-muted-foreground text-center py-2">
                اضغط "جلب البيانات" أولاً لعرض معلومات الفيديو وخيارات الجودة
              </p>
            )}

            {isClipping && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm px-0.5">
                  <span className="text-muted-foreground">جاري القص والمعالجة...</span>
                  <span className="font-black tabular-nums text-primary text-base">{clipProgress}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${clipProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={isClipping || !url}>
                {isClipping ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Scissors className="w-6 h-6 ml-2" />}
                {isClipping ? `جاري القص... ${clipProgress}%` : "بدء القص والتنزيل"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
