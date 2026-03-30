import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Tv, UploadCloud, Link as LinkIcon } from "lucide-react";
import type { AnimeRecognitionResponse, AnimeResult, SourceLink } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export default function Anime() {
  const [image, setImage] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<AnimeRecognitionResponse | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

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
      const res = await fetch('/api/anime/recognize', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error("فشل البحث");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء البحث", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black">التعرف على الأنمي</h2>
        <p className="text-muted-foreground text-lg">ارفع لقطة شاشة أو اكتب وصفاً للمشهد وسنقوم بإيجاد الأنمي المطلوب.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleSearch} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div 
                className="border-3 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
                onClick={() => fileRef.current?.click()}
              >
                <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} />
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{image ? image.name : "ارفع صورة لقطة الأنمي (اختياري)"}</p>
              </div>

              <div className="space-y-4 flex flex-col justify-center bg-background/50 p-6 rounded-2xl border border-border">
                <label className="text-lg font-bold">أو اكتب وصفاً للمشهد</label>
                <Input placeholder="مثال: شاب بشعر أصفر يقاتل وحشاً كبيراً..." value={description} onChange={e => setDescription(e.target.value)} className="h-14 text-base" />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full h-14 text-xl font-bold" disabled={isSearching}>
              {isSearching ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Tv className="w-6 h-6 ml-2" />}
              {isSearching ? "جاري البحث..." : "ابحث عن الأنمي"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && result.results.length > 0 && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 pt-4">
          <h3 className="text-2xl font-black border-r-4 border-primary pr-4">نتائج البحث ({result.method === 'image' ? 'بالصورة' : 'بالنص'})</h3>
          <div className="grid gap-6">
            {result.results.map((anime: AnimeResult, i: number) => (
              <Card key={i} className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
                <div className="flex flex-col md:flex-row">
                  {anime.thumbnail && (
                    <img src={anime.thumbnail} alt={anime.title} className="w-full md:w-64 object-cover h-56 md:h-auto bg-muted" />
                  )}
                  <div className="p-6 md:p-8 flex-1 space-y-5">
                    <div>
                      <h4 className="text-2xl font-bold">{anime.title_ar || anime.title}</h4>
                      <p className="text-base text-muted-foreground font-medium mt-1" dir="ltr">{anime.title_en || anime.title}</p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {anime.similarity && (
                        <Badge variant="default" className="text-sm px-3 py-1 font-bold">نسبة التطابق: {anime.similarity}%</Badge>
                      )}
                      {anime.episode && (
                        <Badge variant="secondary" className="text-sm px-3 py-1">الحلقة: {anime.episode}</Badge>
                      )}
                      {anime.genres?.map((g: string) => (
                        <Badge key={g} variant="outline" className="text-sm px-3 py-1 bg-background">{g}</Badge>
                      ))}
                    </div>

                    {anime.description && <p className="text-base text-muted-foreground leading-relaxed line-clamp-3 font-medium">{anime.description}</p>}

                    {anime.source_links && anime.source_links.length > 0 && (
                      <div className="flex gap-3 pt-2 flex-wrap">
                        {anime.source_links.map((link: SourceLink, j: number) => (
                          <a key={j} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold hover:bg-primary/20 transition-colors">
                            <LinkIcon className="w-4 h-4 ml-2" />
                            {link.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}