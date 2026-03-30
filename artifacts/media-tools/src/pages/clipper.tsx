import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Scissors } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Clipper() {
  const [url, setUrl] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:10");
  const [type, setType] = useState<"video"|"audio"|"mp3">("video");
  const [isClipping, setIsClipping] = useState(false);
  const { toast } = useToast();

  const handleClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsClipping(true);
    try {
      const res = await fetch('/api/clipper/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, start_time: startTime, end_time: endTime, type })
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
    } catch (err) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء قص المقطع", variant: "destructive" });
    } finally {
      setIsClipping(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">قص مقاطع يوتيوب</h2>
        <p className="text-muted-foreground text-lg">حدد وقت البداية والنهاية واستخرج جزءاً محدداً من أي فيديو.</p>
      </div>
      
      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleClip} className="space-y-6">
            <div className="space-y-3">
              <label className="text-base font-bold">رابط الفيديو</label>
              <Input placeholder="https://youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} dir="ltr" className="text-left h-12" />
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-base font-bold">وقت البداية</label>
                <Input placeholder="00:00:00" value={startTime} onChange={e => setStartTime(e.target.value)} dir="ltr" className="text-center h-12 font-mono font-bold text-lg tracking-wider" />
              </div>
              <div className="space-y-3">
                <label className="text-base font-bold">وقت النهاية</label>
                <Input placeholder="00:00:10" value={endTime} onChange={e => setEndTime(e.target.value)} dir="ltr" className="text-center h-12 font-mono font-bold text-lg tracking-wider" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-base font-bold">صيغة المخرجات</label>
              <Select value={type} onValueChange={(val: any) => setType(val)} dir="rtl">
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

            <div className="pt-4">
              <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={isClipping}>
                {isClipping ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Scissors className="w-6 h-6 ml-2" />}
                بدء القص والتنزيل
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}