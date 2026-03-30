import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useElapsedTimer, formatElapsed } from "@/hooks/use-elapsed-timer";
import { Loader2, Tv, UploadCloud, Link as LinkIcon, CheckCircle, AlertCircle } from "lucide-react";
import type { AnimeRecognitionResponse, AnimeResult, SourceLink } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export default function Anime() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<AnimeRecognitionResponse | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const elapsed = useElapsedTimer(isSearching);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setImage(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setImagePreview(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image && !description) {
      toast({ title: "تنبيه", description: "الرجاء إرفاق صورة أو كتابة وصف", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setResult(null);

    const formData = new FormData();
    if (image) formData.append("image", image);
    if (description) formData.append("description", description);

    try {
      const res = await fetch("/api/anime/recognize", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "فشل البحث");
      }
      const data = await res.json() as AnimeRecognitionResponse;
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء البحث";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const topResult: AnimeResult | undefined = result?.results?.[0];
  const similarity = topResult?.similarity;
  const isHighConfidence = similarity !== null && similarity !== undefined && similarity >= 85;
  const isMediumConfidence = similarity !== null && similarity !== undefined && similarity >= 60 && similarity < 85;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">التعرف على الأنمي</h2>
        <p className="text-muted-foreground text-lg">ارفع لقطة شاشة من الأنمي وسنتعرف عليه فوراً بدقة عالية.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleSearch} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div
                className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group overflow-hidden"
                onClick={() => fileRef.current?.click()}
              >
                <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handleImageChange} />
                {imagePreview ? (
                  <img src={imagePreview} alt="معاينة" className="w-full h-40 object-cover rounded-xl mx-auto" />
                ) : (
                  <>
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold">ارفع لقطة شاشة من الأنمي</p>
                    <p className="text-sm text-muted-foreground mt-1">JPG, PNG, WebP</p>
                  </>
                )}
                {image && (
                  <p className="text-sm text-primary font-semibold mt-3">{image.name}</p>
                )}
              </div>

              <div className="space-y-4 flex flex-col justify-center bg-background/50 p-6 rounded-2xl border border-border">
                <label className="text-lg font-bold">أو اكتب وصفاً للمشهد</label>
                <Input
                  placeholder="مثال: شاب بشعر أصفر يقاتل وحشاً كبيراً..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="h-14 text-base"
                />
                <p className="text-xs text-muted-foreground">يمكنك استخدام الصورة أو الوصف أو كليهما معاً</p>
              </div>
            </div>

            {isSearching && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground px-1">
                  <span>جاري البحث في قواعد بيانات الأنمي...</span>
                  <span className="font-bold tabular-nums">{formatElapsed(elapsed)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full h-14 text-xl font-bold" disabled={isSearching}>
              {isSearching ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Tv className="w-6 h-6 ml-2" />}
              {isSearching ? `جاري البحث... (${formatElapsed(elapsed)})` : "ابحث عن الأنمي"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && result.results.length === 0 && (
        <Card className="border-destructive/30 bg-destructive/5 animate-in slide-in-from-bottom-4">
          <CardContent className="pt-6 text-center py-10">
            <AlertCircle className="w-12 h-12 text-destructive/60 mx-auto mb-3" />
            <p className="font-bold text-lg">لم يتم العثور على نتائج</p>
            <p className="text-muted-foreground mt-1">حاول برفع صورة أوضح من مشهد الأنمي مباشرة</p>
          </CardContent>
        </Card>
      )}

      {topResult && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 pt-2">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black border-r-4 border-primary pr-4">نتيجة البحث</h3>
            {similarity !== null && similarity !== undefined && (
              <div className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full ${
                isHighConfidence ? "bg-green-500/15 text-green-400" :
                isMediumConfidence ? "bg-yellow-500/15 text-yellow-400" :
                "bg-orange-500/15 text-orange-400"
              }`}>
                {isHighConfidence ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                دقة التطابق: {similarity}%
              </div>
            )}
          </div>

          {!isHighConfidence && similarity !== null && similarity !== undefined && (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-2">
              {isMediumConfidence
                ? "النتيجة محتملة — تأكد من مطابقتها للأنمي الذي تبحث عنه"
                : "دقة التطابق منخفضة — حاول برفع صورة أوضح من الأنمي مباشرة"}
            </p>
          )}

          <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
            <div className="flex flex-col md:flex-row">
              {topResult.thumbnail && (
                <img
                  src={topResult.thumbnail}
                  alt={topResult.title}
                  className="w-full md:w-64 object-cover h-56 md:h-auto bg-muted"
                />
              )}
              <div className="p-6 md:p-8 flex-1 space-y-5">
                <div>
                  <h4 className="text-2xl font-bold">{topResult.title_ar || topResult.title}</h4>
                  {topResult.title_en && topResult.title_en !== topResult.title && (
                    <p className="text-base text-muted-foreground font-medium mt-1" dir="ltr">{topResult.title_en}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {topResult.episode !== null && topResult.episode !== undefined && (
                    <Badge variant="secondary" className="text-sm px-3 py-1">الحلقة: {topResult.episode}</Badge>
                  )}
                  {topResult.character && (
                    <Badge variant="secondary" className="text-sm px-3 py-1">الشخصية: {topResult.character}</Badge>
                  )}
                  {topResult.genres?.map((g: string) => (
                    <Badge key={g} variant="outline" className="text-sm px-3 py-1 bg-background">{g}</Badge>
                  ))}
                </div>

                {topResult.description && (
                  <p className="text-base text-muted-foreground leading-relaxed line-clamp-3 font-medium">
                    {topResult.description}
                  </p>
                )}

                {topResult.source_links && topResult.source_links.length > 0 && (
                  <div className="flex gap-3 pt-2 flex-wrap">
                    {topResult.source_links.map((link: SourceLink, j: number) => (
                      <a
                        key={j}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-sm bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold hover:bg-primary/20 transition-colors"
                      >
                        <LinkIcon className="w-4 h-4 ml-2" />
                        {link.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
