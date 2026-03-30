import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { Download, Image, Images, Palette, RefreshCw, Save, Type, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  createDraftFromTemplate,
  FONT_OPTIONS,
  type CampaignImageDraft,
  type SavedCampaignImage,
  TEMPLATES,
  type Template,
} from "./campaignImageGeneratorData";
import {
  dataUrlToBlob,
  downloadDataUrl,
  loadLocalGallery,
  mergeCampaignGallery,
  renderCampaignToDataUrl,
  saveLocalGallery,
  slugify,
} from "./campaignImageGeneratorUtils";

/* ── Preview miniature ── */
function CanvasPreview({ template, draft }: { template: Template; draft: CampaignImageDraft }) {
  const scale = template.layout === "split" ? 0.2 : template.layout === "banner" ? 0.35 : 0.3;
  const w = template.width * scale;
  const h = template.height * scale;

  return (
    <div className="relative mx-auto overflow-hidden rounded-xl shadow-lg" style={{ width: w, height: h, backgroundColor: draft.bgColor }}>
      {draft.bgImage ? (
        <div className="absolute inset-0">
          <img src={draft.bgImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/45" />
        </div>
      ) : (
        <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 20% 80%, ${draft.accentColor} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${draft.accentColor} 0%, transparent 50%)` }} />
      )}
      {draft.badge.trim() && (
        <div className="absolute right-3 top-3 z-10 rounded px-2 py-0.5 font-bold tracking-wider" style={{ backgroundColor: draft.accentColor, color: draft.badgeTextColor, fontSize: Math.max(7, draft.badgeSize * scale * 0.68), fontFamily: draft.badgeFontFamily }}>{draft.badge}</div>
      )}
      <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 p-4 text-center ${template.layout === "split" ? "justify-end pb-8" : ""}`}>
        <p className="max-w-[80%] uppercase tracking-[0.2em]" style={{ color: draft.storeNameColor, fontSize: Math.max(7, draft.storeNameSize * scale * 0.68), fontFamily: draft.storeNameFontFamily }}>{draft.storeName}</p>
        <h3 className="max-w-[82%] font-bold leading-tight" style={{ color: draft.headlineColor, fontSize: draft.headlineSize * scale * 0.72, fontFamily: draft.headlineFontFamily }}>{draft.headline}</h3>
        <p className="max-w-[80%] opacity-90" style={{ color: draft.subtextColor, fontSize: draft.subtextSize * scale * 0.68, fontFamily: draft.bodyFontFamily }}>{draft.subtext}</p>
        <div className="mt-1 rounded-full px-3 py-1 font-bold tracking-wide" style={{ backgroundColor: draft.accentColor, color: draft.ctaTextColor, fontSize: draft.ctaSize * scale * 0.56, fontFamily: draft.ctaFontFamily }}>{draft.cta}</div>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function CampaignImageGenerator() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tpl, setTpl] = useState<Template>(TEMPLATES[0]);
  const [draft, setDraft] = useState<CampaignImageDraft>(() => createDraftFromTemplate(TEMPLATES[0]));
  const [filterCat, setFilterCat] = useState("todos");
  const [gallery, setGallery] = useState<SavedCampaignImage[]>([]);
  const [loadingGal, setLoadingGal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeImg, setActiveImg] = useState<SavedCampaignImage | null>(null);

  const filtered = useMemo(() => TEMPLATES.filter(t => filterCat === "todos" || t.categoria === filterCat), [filterCat]);

  const upd = <K extends keyof CampaignImageDraft>(k: K, v: CampaignImageDraft[K]) => setDraft(p => ({ ...p, [k]: v }));

  const selectTpl = (t: Template) => { setTpl(t); setDraft(p => ({ ...createDraftFromTemplate(t), storeName: p.storeName, title: p.title === tpl.nome ? t.nome : p.title })); };

  /* Gallery load */
  const loadGallery = useCallback(async () => {
    setLoadingGal(true);
    const local = loadLocalGallery().filter(i => !user?.tenant_id || !i.tenantId || i.tenantId === user.tenant_id);
    if (!user?.tenant_id) { setGallery(local); setLoadingGal(false); return; }
    try {
      const { data, error } = await (supabase as any).from("campaign_generated_images").select("id, tenant_id, title, image_url, template_id, config, created_at").eq("tenant_id", user.tenant_id).order("created_at", { ascending: false });
      if (error) throw error;
      const cloud: SavedCampaignImage[] = (data || []).map((r: any) => ({ id: r.id, tenantId: r.tenant_id, title: r.title, imageUrl: r.image_url, templateId: r.template_id, createdAt: r.created_at, source: "cloud" as const, draft: { ...createDraftFromTemplate(TEMPLATES.find(t => t.id === r.template_id) || TEMPLATES[0]), ...(r.config || {}) } }));
      setGallery(mergeCampaignGallery(cloud, local));
    } catch { setGallery(local); } finally { setLoadingGal(false); }
  }, [user?.tenant_id]);

  useEffect(() => { loadGallery(); }, [loadGallery]);

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    const r = new FileReader(); r.onload = () => { upd("bgImage", r.result as string); toast.success("Imagem de fundo carregada!"); }; r.readAsDataURL(f); e.target.value = "";
  };

  const handleDownload = async () => { const url = await renderCampaignToDataUrl(tpl, draft); downloadDataUrl(url, `${slugify(draft.title || tpl.nome)}.png`); toast.success("Imagem gerada e baixada!"); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dataUrl = await renderCampaignToDataUrl(tpl, draft);
      if (user?.tenant_id) {
        try {
          const blob = await dataUrlToBlob(dataUrl);
          const path = `${user.tenant_id}/generated/${Date.now()}-${slugify(draft.title)}.png`;
          const { error: upErr } = await supabase.storage.from("campaign-gallery").upload(path, blob, { upsert: true, contentType: "image/png" });
          if (upErr) throw upErr;
          const { data: urlD } = supabase.storage.from("campaign-gallery").getPublicUrl(path);
          let storedBg = draft.bgImage;
          if (draft.bgImage?.startsWith("data:")) {
            const bgBlob = await dataUrlToBlob(draft.bgImage);
            const bgPath = `${user.tenant_id}/bg/${Date.now()}.png`;
            const { error: bgErr } = await supabase.storage.from("campaign-gallery").upload(bgPath, bgBlob, { upsert: true, contentType: bgBlob.type || "image/png" });
            if (!bgErr) storedBg = supabase.storage.from("campaign-gallery").getPublicUrl(bgPath).data.publicUrl;
          }
          const { data, error } = await (supabase as any).from("campaign_generated_images").insert({ tenant_id: user.tenant_id, title: draft.title || tpl.nome, image_url: urlD.publicUrl, template_id: tpl.id, config: { ...draft, bgImage: storedBg }, created_by: user.id }).select("id, tenant_id, title, image_url, template_id, config, created_at").single();
          if (error) throw error;
          const item: SavedCampaignImage = { id: data.id, tenantId: data.tenant_id, title: data.title, imageUrl: data.image_url, templateId: data.template_id, createdAt: data.created_at, source: "cloud", draft: { ...createDraftFromTemplate(tpl), ...(data.config || {}) } };
          setGallery(p => mergeCampaignGallery([item], p));
          toast.success("Arte salva na galeria!"); return;
        } catch { /* fallback local */ }
      }
      const item: SavedCampaignImage = { id: crypto.randomUUID(), tenantId: user?.tenant_id ?? null, title: draft.title || tpl.nome, imageUrl: dataUrl, templateId: tpl.id, createdAt: new Date().toISOString(), source: "local", draft };
      const merged = mergeCampaignGallery([item], gallery); saveLocalGallery(merged); setGallery(merged);
      toast.success("Arte salva localmente!");
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar."); } finally { setSaving(false); }
  };

  const reuse = (item: SavedCampaignImage) => {
    const t = TEMPLATES.find(e => e.id === item.templateId) || TEMPLATES[0];
    setTpl(t); setDraft({ ...createDraftFromTemplate(t), ...item.draft, title: item.title }); toast.success("Arte carregada para edição.");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Image className="h-5 w-5 text-primary" /> Gerador de Imagens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Template picker */}
          <div>
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">Escolha um template</Label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {["todos", "cozinha", "quarto", "planejados", "datas"].map(c => (
                <Badge key={c} variant={filterCat === c ? "default" : "outline"} className="cursor-pointer capitalize text-xs" onClick={() => setFilterCat(c)}>
                  {c === "todos" ? "Todos" : c === "datas" ? "Datas Comemorativas" : c}
                </Badge>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {filtered.map(t => (
                <button key={t.id} onClick={() => selectTpl(t)} className={`rounded-lg border-2 p-2 text-left transition-all ${tpl.id === t.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                  <div className="relative mb-1 aspect-square w-full overflow-hidden rounded" style={{ backgroundColor: t.bgColor }}>
                    <div className="absolute inset-0 flex items-center justify-center px-2 text-center"><span className="text-[8px] font-bold" style={{ color: t.textColor }}>{t.placeholders.headline}</span></div>
                  </div>
                  <p className="truncate text-[10px] font-medium">{t.nome}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Editor + Preview */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div><Label className="text-xs">Nome da arte</Label><Input value={draft.title} onChange={e => upd("title", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                <div><Label className="text-xs">Nome da Loja</Label><Input value={draft.storeName} onChange={e => upd("storeName", e.target.value)} className="mt-1 h-9 text-sm" /></div>
              </div>

              {/* Background upload */}
              <div className="rounded-lg border-2 border-dashed border-border p-3 text-center">
                <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={handleBgUpload} />
                {draft.bgImage ? (
                  <div className="flex items-center justify-center gap-2">
                    <img src={draft.bgImage} alt="" className="h-10 w-10 rounded object-cover" />
                    <span className="text-xs text-muted-foreground">Imagem de fundo aplicada</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => upd("bgImage", null)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Enviar imagem de fundo</Button>
                )}
              </div>

              {/* Text fields */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div><Label className="text-xs">Headline</Label><Input value={draft.headline} onChange={e => upd("headline", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                <div><Label className="text-xs">Subtexto</Label><Input value={draft.subtext} onChange={e => upd("subtext", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                <div><Label className="text-xs">CTA</Label><Input value={draft.cta} onChange={e => upd("cta", e.target.value)} className="mt-1 h-9 text-sm" /></div>
                <div><Label className="text-xs">Badge</Label><Input value={draft.badge} onChange={e => upd("badge", e.target.value)} placeholder="Opcional" className="mt-1 h-9 text-sm" /></div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <Label className="flex items-center gap-1 text-xs"><Palette className="h-3 w-3" /> Fundo</Label>
                  <div className="mt-2 flex gap-2"><input type="color" value={draft.bgColor} onChange={e => upd("bgColor", e.target.value)} className="h-9 w-11 cursor-pointer rounded border border-border" /><Input value={draft.bgColor} onChange={e => upd("bgColor", e.target.value)} className="h-9 text-xs" /></div>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <Label className="flex items-center gap-1 text-xs"><Palette className="h-3 w-3" /> Destaque</Label>
                  <div className="mt-2 flex gap-2"><input type="color" value={draft.accentColor} onChange={e => upd("accentColor", e.target.value)} className="h-9 w-11 cursor-pointer rounded border border-border" /><Input value={draft.accentColor} onChange={e => upd("accentColor", e.target.value)} className="h-9 text-xs" /></div>
                </div>
              </div>

              {/* Typography */}
              <div className="rounded-2xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Type className="h-4 w-4 text-primary" /> Tipografia</div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {([
                    { label: "Nome da Loja", fontKey: "storeNameFontFamily" as const, sizeKey: "storeNameSize" as const, colorKey: "storeNameColor" as const },
                    { label: "Headline", fontKey: "headlineFontFamily" as const, sizeKey: "headlineSize" as const, colorKey: "headlineColor" as const },
                    { label: "Subtexto", fontKey: "bodyFontFamily" as const, sizeKey: "subtextSize" as const, colorKey: "subtextColor" as const },
                    { label: "CTA", fontKey: "ctaFontFamily" as const, sizeKey: "ctaSize" as const, colorKey: "ctaTextColor" as const },
                    { label: "Badge", fontKey: "badgeFontFamily" as const, sizeKey: "badgeSize" as const, colorKey: "badgeTextColor" as const },
                  ]).map(({ label, fontKey, sizeKey, colorKey }) => (
                    <div key={label} className="space-y-2 rounded-xl border border-border p-3">
                      <Label className="text-xs font-medium">{label}</Label>
                      <Select value={draft[fontKey]} onValueChange={v => upd(fontKey, v as any)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONT_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <Input type="number" min={16} max={140} value={draft[sizeKey]} onChange={e => upd(sizeKey, Number(e.target.value) as any)} className="h-9 text-xs" />
                        <input type="color" value={draft[colorKey]} onChange={e => upd(colorKey, e.target.value as any)} className="h-9 w-11 cursor-pointer rounded border border-border" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview column */}
            <div className="flex flex-col items-center gap-3">
              <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
              <CanvasPreview template={tpl} draft={draft} />
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={handleDownload} className="gap-2"><Download className="h-4 w-4" /> Baixar imagem</Button>
                <Button onClick={handleSave} variant="outline" className="gap-2" disabled={saving}>
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar para reuso
                </Button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">{tpl.width}x{tpl.height}px • PNG de alta qualidade</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gallery */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Images className="h-5 w-5 text-primary" /> Galeria de artes salvas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingGal ? <p className="text-sm text-muted-foreground">Carregando galeria...</p> : gallery.length === 0 ? (
            <p className="text-sm text-muted-foreground">Salve uma arte para reutilizar depois e ela aparecerá aqui.</p>
          ) : (
            <ScrollArea className="max-h-[420px] pr-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {gallery.map(item => (
                  <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                    <button className="block w-full" onClick={() => setActiveImg(item)}>
                      <img src={item.imageUrl} alt={item.title} className="aspect-square w-full object-cover" loading="lazy" />
                    </button>
                    <div className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="line-clamp-1 text-sm font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</p></div>
                        <Badge variant="outline" className="text-[10px] uppercase">{item.source}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => reuse(item)}>Reusar</Button>
                        <Button size="sm" className="flex-1" onClick={() => downloadDataUrl(item.imageUrl, `${slugify(item.title)}.png`)}>Baixar</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      <Dialog open={!!activeImg} onOpenChange={o => !o && setActiveImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{activeImg?.title}</DialogTitle></DialogHeader>
          {activeImg && (
            <div className="space-y-4">
              <img src={activeImg.imageUrl} alt={activeImg.title} className="max-h-[70vh] w-full rounded-xl object-contain" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => reuse(activeImg)}>Carregar para edição</Button>
                <Button className="flex-1" onClick={() => downloadDataUrl(activeImg.imageUrl, `${slugify(activeImg.title)}.png`)}>Baixar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
