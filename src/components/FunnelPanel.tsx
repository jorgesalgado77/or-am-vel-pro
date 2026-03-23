import { useState, useEffect, useRef, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, ExternalLink, Loader2, Save, Plus, X, Link2, Palette, Type, ListChecks, BarChart3, Video, ImageIcon, Upload, Trash2, GripVertical, Instagram, Facebook, Youtube, Globe, Twitter, Share2, DollarSign, Pencil, Check } from "lucide-react";
import { FunnelMetrics } from "@/components/funnel/FunnelMetrics";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// TikTok icon (not in lucide)
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.37a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.8z"/>
  </svg>
);

interface SocialLinks {
  instagram_url: string;
  facebook_url: string;
  youtube_url: string;
  twitter_url: string;
  tiktok_url: string;
  website_url: string;
}

interface FunnelConfig {
  headline: string;
  sub_headline: string;
  cta_text: string;
  primary_color: string;
  benefits: string[];
  promo_video_url: string;
  carousel_images: string[];
  social_links: SocialLinks;
  investment_ranges: string[];
}

const DEFAULT_SOCIAL: SocialLinks = {
  instagram_url: "",
  facebook_url: "",
  youtube_url: "",
  twitter_url: "",
  tiktok_url: "",
  website_url: "",
};

const DEFAULT_INVESTMENT_RANGES = [
  "Até R$ 20.000",
  "R$ 20.000 a R$ 50.000",
  "R$ 50.000 a R$ 100.000",
  "R$ 100.000 a R$ 200.000",
  "Acima de R$ 200.000",
  "Não sei informar",
];

const DEFAULT_CONFIG: FunnelConfig = {
  headline: "Ganhe seu Projeto 3D Gratuito",
  sub_headline: "",
  cta_text: "Solicite seu Projeto 3D Grátis",
  primary_color: "hsl(199,89%,48%)",
  benefits: [
    "Projeto 3D gratuito e sem compromisso",
    "Atendimento personalizado por especialista",
    "Orçamento detalhado em até 24h",
    "Melhores condições de pagamento",
  ],
  promo_video_url: "",
  carousel_images: [],
  social_links: DEFAULT_SOCIAL,
  investment_ranges: DEFAULT_INVESTMENT_RANGES,
};

export function FunnelPanel() {
  const { settings } = useCompanySettings();
  const { user } = useAuth();
  const [config, setConfig] = useState<FunnelConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newBenefit, setNewBenefit] = useState("");
  const [newInvestRange, setNewInvestRange] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const codigoLoja = settings.codigo_loja || "";
  const publicUrl = codigoLoja ? `${window.location.origin}/loja/${codigoLoja}` : null;

  useEffect(() => {
    if (!user?.tenant_id) return;
    (async () => {
      const { data } = await supabase.from("tenant_funnel_config" as any).select("*").eq("tenant_id", user.tenant_id).maybeSingle();
      if (data) {
        const d = data as any;
        setConfig({
          headline: d.headline || DEFAULT_CONFIG.headline,
          sub_headline: d.sub_headline || "",
          cta_text: d.cta_text || DEFAULT_CONFIG.cta_text,
          primary_color: d.primary_color || DEFAULT_CONFIG.primary_color,
          benefits: d.benefits || DEFAULT_CONFIG.benefits,
          promo_video_url: d.promo_video_url || "",
          carousel_images: d.carousel_images || [],
          social_links: d.social_links || DEFAULT_SOCIAL,
          investment_ranges: d.investment_ranges || DEFAULT_INVESTMENT_RANGES,
        });
      }
      setLoading(false);
    })();
  }, [user?.tenant_id]);

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${user?.tenant_id}/${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("funnel-media").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("funnel-media").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("Vídeo deve ter no máximo 50MB"); return; }
    setUploadingVideo(true);
    const url = await uploadFile(file, "videos");
    if (url) setConfig((p) => ({ ...p, promo_video_url: url }));
    setUploadingVideo(false);
    if (e.target) e.target.value = "";
  };

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 10 - config.carousel_images.length;
    if (files.length > remaining) { toast.error(`Máximo de 10 imagens. Você pode adicionar mais ${remaining}.`); return; }
    setUploadingImages(true);
    const urls: string[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} excede 10MB`); continue; }
      const url = await uploadFile(file, "carousel");
      if (url) urls.push(url);
    }
    if (urls.length) setConfig((p) => ({ ...p, carousel_images: [...p.carousel_images, ...urls] }));
    setUploadingImages(false);
    if (e.target) e.target.value = "";
  };

  const removeCarouselImage = (idx: number) => {
    if (idx === 0) return; // First image is locked (platform branding)
    setConfig((p) => ({ ...p, carousel_images: p.carousel_images.filter((_, i) => i !== idx) }));
  };

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    // Prevent moving first image or moving anything to position 0
    if (from === 0 || to === 0) return;
    setConfig((p) => {
      const imgs = [...p.carousel_images];
      const [moved] = imgs.splice(from, 1);
      imgs.splice(to, 0, moved);
      return { ...p, carousel_images: imgs };
    });
  }, []);

  const handleSave = async () => {
    if (!user?.tenant_id) return;
    setSaving(true);
    try {
      const payload: any = {
        tenant_id: user.tenant_id,
        headline: config.headline,
        sub_headline: config.sub_headline,
        cta_text: config.cta_text,
        primary_color: config.primary_color,
        benefits: config.benefits,
        promo_video_url: config.promo_video_url,
        carousel_images: config.carousel_images,
        social_links: config.social_links,
        investment_ranges: config.investment_ranges,
      };
      const { error } = await (supabase as any).from("tenant_funnel_config").upsert(payload, { onConflict: "tenant_id" });
      if (error) {
        // If social_links column doesn't exist yet, retry without it
        if (error.message?.includes("social_links")) {
          const { social_links, ...rest } = payload;
          const { error: err2 } = await (supabase as any).from("tenant_funnel_config").upsert(rest, { onConflict: "tenant_id" });
          if (err2) throw err2;
          toast.success("Configurações salvas! (Execute o SQL para habilitar redes sociais)");
        } else {
          throw error;
        }
      } else {
        toast.success("Configurações do funil salvas!");
      }
    } catch (e: any) { toast.error("Erro ao salvar: " + (e?.message || "erro desconhecido")); }
    finally { setSaving(false); }
  };

  const copyLink = () => { if (!publicUrl) return; navigator.clipboard.writeText(publicUrl); toast.success("Link copiado!"); };

  const addBenefit = () => {
    if (!newBenefit.trim()) return;
    setConfig((p) => ({ ...p, benefits: [...p.benefits, newBenefit.trim()] }));
    setNewBenefit("");
  };

  const removeBenefit = (i: number) => {
    setConfig((p) => ({ ...p, benefits: p.benefits.filter((_, idx) => idx !== i) }));
  };

  const addInvestRange = () => {
    if (!newInvestRange.trim()) return;
    setConfig((p) => ({ ...p, investment_ranges: [...p.investment_ranges, newInvestRange.trim()] }));
    setNewInvestRange("");
  };

  const removeInvestRange = (i: number) => {
    setConfig((p) => ({ ...p, investment_ranges: p.investment_ranges.filter((_, idx) => idx !== i) }));
  };

  const [editingRangeIdx, setEditingRangeIdx] = useState<number | null>(null);
  const [editingRangeValue, setEditingRangeValue] = useState("");

  const startEditRange = (i: number) => {
    setEditingRangeIdx(i);
    setEditingRangeValue(config.investment_ranges[i]);
  };

  const confirmEditRange = () => {
    if (editingRangeIdx === null || !editingRangeValue.trim()) return;
    setConfig((p) => ({
      ...p,
      investment_ranges: p.investment_ranges.map((r, idx) => idx === editingRangeIdx ? editingRangeValue.trim() : r),
    }));
    setEditingRangeIdx(null);
    setEditingRangeValue("");
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Link público */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Link2 className="h-5 w-5 text-primary" /> Link Público da Sua Loja</CardTitle>
          <CardDescription>Compartilhe este link nas redes sociais, WhatsApp e anúncios para capturar leads automaticamente.</CardDescription>
        </CardHeader>
        <CardContent>
          {publicUrl ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 bg-muted rounded-xl px-4 py-3 text-sm font-mono text-foreground truncate border border-border">{publicUrl}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyLink} className="gap-2"><Copy className="h-4 w-4" /> Copiar</Button>
                <Button variant="outline" size="sm" asChild className="gap-2"><a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Abrir</a></Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Configure o código da loja em <strong>Configurações → Empresa</strong> para gerar seu link.</p>
          )}
        </CardContent>
      </Card>

      {/* Métricas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" /> Métricas de Captação</CardTitle>
          <CardDescription>Acompanhe a performance do seu funil de captação de leads.</CardDescription>
        </CardHeader>
        <CardContent><FunnelMetrics /></CardContent>
      </Card>

      {/* Vídeo Promocional */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Video className="h-5 w-5 text-primary" /> Vídeo Promocional</CardTitle>
          <CardDescription>Faça upload de um vídeo promocional que será exibido na página pública da sua loja.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
          {config.promo_video_url ? (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-border bg-black">
                <video src={config.promo_video_url} controls className="w-full aspect-video" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => videoInputRef.current?.click()} disabled={uploadingVideo} className="gap-2">
                  <Upload className="h-4 w-4" /> Trocar vídeo
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfig(p => ({ ...p, promo_video_url: "" }))} className="gap-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> Remover
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => videoInputRef.current?.click()}
            >
              {uploadingVideo ? (
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              ) : (
                <>
                  <Video className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">Clique para enviar seu vídeo promocional</p>
                  <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WEBM • Até 50MB</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Carrossel de Imagens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ImageIcon className="h-5 w-5 text-primary" /> Carrossel de Imagens</CardTitle>
          <CardDescription>Adicione até 10 imagens que serão exibidas em carrossel na página pública. O visitante pode expandir cada imagem.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={imagesInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagesUpload} />
          {config.carousel_images.length > 0 && (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="carousel-images" direction="horizontal">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {config.carousel_images.map((img, i) => (
                      <Draggable key={`img-${i}-${img}`} draggableId={`img-${i}`} index={i} isDragDisabled={i === 0}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn(
                              "relative group rounded-lg overflow-hidden border aspect-square",
                              i === 0 ? "border-primary/50 ring-1 ring-primary/30" : "border-border",
                              snapshot.isDragging && "ring-2 ring-primary shadow-lg z-10"
                            )}
                          >
                            <img src={img} alt={`Imagem ${i + 1}`} className="w-full h-full object-cover" />
                            {i === 0 ? (
                              <div className="absolute top-1 left-1 bg-primary/80 text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                                🔒 Fixa
                              </div>
                            ) : (
                              <>
                                <div {...dragProvided.dragHandleProps} className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <button
                                  onClick={() => removeCarouselImage(i)}
                                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">{i + 1}</div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
          {config.carousel_images.length < 10 && (
            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => imagesInputRef.current?.click()}
            >
              {uploadingImages ? (
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">Clique para adicionar imagens</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP • Até 10MB cada • {10 - config.carousel_images.length} restantes</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Textos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Type className="h-5 w-5 text-primary" /> Textos da Página</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Título Principal</Label>
            <Input value={config.headline} onChange={(e) => setConfig(p => ({ ...p, headline: e.target.value }))} placeholder="Ganhe seu Projeto 3D Gratuito" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Subtítulo</Label>
            <Textarea value={config.sub_headline} onChange={(e) => setConfig(p => ({ ...p, sub_headline: e.target.value }))} placeholder="Deixe vazio para usar o texto padrão" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Texto do Botão</Label>
            <Input value={config.cta_text} onChange={(e) => setConfig(p => ({ ...p, cta_text: e.target.value }))} placeholder="Solicite seu Projeto 3D Grátis" />
          </div>
        </CardContent>
      </Card>

      {/* Cor primária */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Palette className="h-5 w-5 text-primary" /> Cor Principal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input type="color" value={config.primary_color.startsWith("#") ? config.primary_color : "#2196F3"} onChange={(e) => setConfig(p => ({ ...p, primary_color: e.target.value }))} className="h-10 w-14 rounded-lg border border-border cursor-pointer" />
            <Input value={config.primary_color} onChange={(e) => setConfig(p => ({ ...p, primary_color: e.target.value }))} className="max-w-[200px]" placeholder="#2196F3" />
            <div className="h-10 w-10 rounded-lg shadow-inner" style={{ backgroundColor: config.primary_color }} />
          </div>
        </CardContent>
      </Card>

      {/* Benefícios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ListChecks className="h-5 w-5 text-primary" /> Benefícios Listados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm">{b}</div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeBenefit(i)}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newBenefit} onChange={(e) => setNewBenefit(e.target.value)} placeholder="Novo benefício..." onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBenefit())} />
            <Button variant="outline" size="icon" onClick={addBenefit}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Faixas de Investimento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><DollarSign className="h-5 w-5 text-primary" /> Faixas de Investimento</CardTitle>
          <CardDescription>Configure as opções de investimento que aparecerão no formulário da landing page pública.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.investment_ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm">{r}</div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeInvestRange(i)}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newInvestRange} onChange={(e) => setNewInvestRange(e.target.value)} placeholder="Ex: R$ 50.000 a R$ 100.000" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInvestRange())} />
            <Button variant="outline" size="icon" onClick={addInvestRange}><Plus className="h-4 w-4" /></Button>
          </div>
          {config.investment_ranges.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => setConfig(p => ({ ...p, investment_ranges: DEFAULT_INVESTMENT_RANGES }))}>
              Carregar valores padrão
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Share2 className="h-5 w-5 text-primary" /> Redes Sociais</CardTitle>
          <CardDescription>Informe os links das suas redes sociais. Apenas os campos preenchidos serão exibidos na página pública.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            { key: "instagram_url" as const, icon: Instagram, label: "Instagram", placeholder: "https://instagram.com/sualoja" },
            { key: "facebook_url" as const, icon: Facebook, label: "Facebook", placeholder: "https://facebook.com/sualoja" },
            { key: "youtube_url" as const, icon: Youtube, label: "YouTube", placeholder: "https://youtube.com/@sualoja" },
            { key: "tiktok_url" as const, icon: TikTokIcon, label: "TikTok", placeholder: "https://tiktok.com/@sualoja" },
            { key: "twitter_url" as const, icon: Twitter, label: "X / Twitter", placeholder: "https://x.com/sualoja" },
            { key: "website_url" as const, icon: Globe, label: "Site / Portfólio", placeholder: "https://www.sualoja.com.br" },
          ]).map(({ key, icon: Icon, label, placeholder }) => (
            <div key={key} className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 space-y-1">
                <Label className="text-sm font-medium">{label}</Label>
                <Input
                  value={config.social_links[key]}
                  onChange={(e) => setConfig(p => ({ ...p, social_links: { ...p.social_links, [key]: e.target.value } }))}
                  placeholder={placeholder}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 px-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
