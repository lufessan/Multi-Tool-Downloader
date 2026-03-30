import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Radio, UploadCloud, Link as LinkIcon, FileText } from "lucide-react";
import type { PodcastRecognitionResponse, PodcastResult, SourceLink } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export default function Podcast() {
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<PodcastRecognitionResponse | null>(null);
  const { toast } = useToast();
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image && !audio) {
      toast({ title: "تنبيه", description: "الرجاء إرفاق صورة غلاف أو مقطع صوتي", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setResult(null);

    const formData = new FormData();
    if (image) formData.append("image", image);
    if (audio) formData.append("audio", audio);

    try {
      const res = await fetch('/api/podcast/recognize', {
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
        <h2 className="text-3xl font-black">التعرف على البودكاست</h2>
        <p className="text-muted-foreground text-lg">ابحث عن بودكاست من خلال صورة الغلاف أو مقطع صوتي.</p>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardContent className="pt-8">
          <form onSubmit={handleSearch} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div 
                className="border-3 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
                onClick={() => imageRef.current?.click()}
              >
                <input type="file" ref={imageRef} className="hidden" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} />
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{image ? image.name : "صورة الغلاف (اختياري)"}</p>
              </div>

              <div 
                className="border-3 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all bg-background/50 group"
                onClick={() => audioRef.current?.click()}
              >
                <input type="file" ref={audioRef} className="hidden" accept="audio/*" onChange={e => setAudio(e.target.files?.[0] || null)} />
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Radio className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{audio ? audio.name : "مقطع صوتي (اختياري)"}</p>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full h-14 text-xl font-bold" disabled={isSearching}>
              {isSearching ? <Loader2 className="w-6 h-6 animate-spin ml-2" /> : <Radio className="w-6 h-6 ml-2" />}
              {isSearching ? "جاري البحث..." : "ابحث عن البودكاست"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 pt-4">
          {result.transcription && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <h4 className="font-bold text-lg">النص المستخرج من الصوت لفهم السياق:</h4>
                </div>
                <p className="text-base leading-relaxed font-medium">{result.transcription}</p>
              </CardContent>
            </Card>
          )}

          {result.results.length > 0 && (
            <div className="grid gap-6">
              <h3 className="text-2xl font-black border-r-4 border-primary pr-4">نتائج البحث ({result.method === 'audio' ? 'بالصوت' : 'بالصورة'})</h3>
              {result.results.map((podcast: PodcastResult, i: number) => (
                <Card key={i} className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
                  <div className="flex flex-col md:flex-row">
                    {podcast.image && (
                      <img src={podcast.image} alt={podcast.title} className="w-full md:w-56 object-cover h-56 md:h-auto bg-muted" />
                    )}
                    <div className="p-6 md:p-8 flex-1 space-y-4">
                      <div>
                        <h4 className="text-2xl font-bold">{podcast.title}</h4>
                        {podcast.author && <p className="text-base text-muted-foreground mt-1 font-medium">بواسطة {podcast.author}</p>}
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {podcast.categories?.map((c: string) => (
                          <Badge key={c} variant="secondary" className="text-sm px-3 py-1">{c}</Badge>
                        ))}
                      </div>

                      {podcast.description && <p className="text-base text-muted-foreground leading-relaxed line-clamp-3 font-medium">{podcast.description}</p>}

                      {podcast.source_links && podcast.source_links.length > 0 && (
                        <div className="flex gap-3 pt-2 flex-wrap">
                          {podcast.source_links.map((link: SourceLink, j: number) => (
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
          )}
        </div>
      )}
    </div>
  );
}