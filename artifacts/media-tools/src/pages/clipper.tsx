import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Scissors, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetYouTubeInfo } from "@workspace/api-client-react";
import type { VideoFormat } from "@workspace/api-client-react";

type ClipType = "video" | "audio" | "mp3";

export default function Clipper() {
  const [url, setUrl] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:10");
  const [type, setType] = useState<ClipType>("video");
  const [formatId, setFormatId] = useState<string>("best");
  const [isClipping, setIsClipping] = useState(false);
  const { toast } = useToast();

  const getInfo = useGetYouTubeInfo();

  const handleFetchInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setFormatId("best");
    getInfo.mutate({ data: { url } }, {
      onError: () => toast({ title: "خطأ", description: "تعذر جلب معلومات الفيديو. تأكد من صحة الرابط.", variant: "destructive" })
    });
  };

  const handleTypeChange = (val: string) => {
    if (val === "video" || val === "audio" || val === "mp3") {
      setType(val);
    }
  };

  const handleFormatChange = (val: string) => {
    setFormatId(val);
  };

  const handleClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsClipping(true);
    try {
      const body = {
        url,
        start_time: startTime,
        end_time: endTime,
        type,
        format_id: formatId === "best" ? null : formatId,
      };
      const res = await fetch('/api/clipper/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("فشل القص");
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `clip.${type === 'mp3' ? 'mp3' : type === 'audio' ? 'm4a' : 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "اكتمل القص", description: "تم تنزيل المقطع بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "حدث خطأ أثناء قص المقطع", variant: "destructive" });
    } finally {
      setIsClipping(false);
    }
  };

  const videoFormats = getInfo.data?.formats?.filter((f: VideoFormat) => f.resolution && f.resolution !== "صوت فقط") ?? [];
  const audioFormats = getInfo.data?.formats?.filter((f: VideoFormat) => f.resolution === "صوت فقط") ?? [];
  const showFormats = type === "video" ? videoFormats : audioFormats;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">قص مقاطع يوتيوب</h2>
        <p className="text-muted-foreground text-lg">حدد وقت البداية والنهاية واستخرج جزءاً محدداً من أي فيديو بالجودة التي تريدها.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleFetchInfo} className="flex gap-4 mb-6">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              dir="ltr"
              className="text-left h-12"
            />
            <Button type="submit" size="lg" className="h-12 px-6 shrink-0" disabled={getInfo.isPending}>
              {getInfo.isPending ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Search className="w-5 h-5 ml-2" />}
              <span className="font-bold">بحث</span>
            </Button>
          </form>

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
                <Select value={formatId} onValueChange={handleFormatChange} dir="rtl">
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
                ابحث عن الفيديو أولاً لاختيار الجودة المطلوبة، أو اقص مباشرة بأفضل جودة
              </p>
            )}

            <div className="pt-2">
              <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={isClipping || !url}>
                {isClipping ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Scissors className="w-6 h-6 ml-2" />}
                {isClipping ? "جاري القص والمعالجة..." : "بدء القص والتنزيل"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
