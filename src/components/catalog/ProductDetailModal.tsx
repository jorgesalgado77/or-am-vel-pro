/**
 * ProductDetailModal — Responsive product detail with gallery, video, and permission gating
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import type { Product } from "@/hooks/useProductCatalog";
import { formatCurrency } from "@/lib/financing";
import { X, ZoomIn, ZoomOut, Play, Pause, UserPlus, ShoppingCart, Maximize, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

interface ProductImage {
  id: string;
  image_url: string;
}

interface MediaItem {
  type: "image" | "video";
  url: string;
  thumbUrl: string;
  id: string;
}

interface Props {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STOCK_LABELS: Record<string, string> = {
  em_estoque: "Em estoque",
  sob_encomenda: "Sob encomenda",
  indisponivel: "Indisponível",
};

interface ClientOption { id: string; name: string; }
interface SimulationOption { id: string; valor_tela: number; created_at: string; }

function getYouTubeThumb(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  return url;
}

/* ─── Fullscreen Image Viewer with pinch-zoom ─── */
function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col" onClick={onClose}>
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button className="bg-black/60 rounded-full p-2 text-white" onClick={e => { e.stopPropagation(); setScale(s => Math.min(s + 0.5, 4)); }}><ZoomIn className="h-5 w-5" /></button>
        <button className="bg-black/60 rounded-full p-2 text-white" onClick={e => { e.stopPropagation(); setScale(s => Math.max(s - 0.5, 0.5)); }}><ZoomOut className="h-5 w-5" /></button>
        <button className="bg-black/60 rounded-full p-2 text-white" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt=""
          className="max-w-none transition-transform duration-200"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
      </div>
    </div>
  );
}

/* ─── Fullscreen Video Player ─── */
function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  const isEmbed = url.includes("youtube") || url.includes("youtu.be") || url.includes("vimeo");
  const embedUrl = getVideoEmbedUrl(url);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); }
    else { videoRef.current.pause(); setPlaying(false); }
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="absolute top-3 right-3 z-10">
        <button className="bg-black/60 rounded-full p-2 text-white" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {isEmbed && embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full max-w-4xl max-h-[80vh] rounded-lg"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen"
          />
        ) : (
          <video
            ref={videoRef}
            src={url}
            autoPlay
            className="w-full h-full max-w-4xl max-h-[80vh] object-contain"
            onEnded={() => setPlaying(false)}
          />
        )}
      </div>

      {/* Controls for direct video */}
      {!isEmbed && (
        <div className="shrink-0 bg-black/80 px-4 py-3 flex items-center justify-center gap-4 flex-wrap">
          <button className="text-white" onClick={togglePlay}>
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>
          <button className="text-white" onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <div className="flex gap-1">
            {[1, 1.5, 2].map(s => (
              <button
                key={s}
                className={`text-xs px-2 py-1 rounded ${speed === s ? "bg-primary text-primary-foreground" : "bg-white/20 text-white"}`}
                onClick={() => changeSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
          <button className="text-white" onClick={() => videoRef.current?.requestFullscreen()}>
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Modal ─── */
export function ProductDetailModal({ product, open, onOpenChange }: Props) {
  const { currentUser } = useCurrentUser();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [selectedMediaIdx, setSelectedMediaIdx] = useState(0);

  const [showAddFlow, setShowAddFlow] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [simulations, setSimulations] = useState<SimulationOption[]>([]);
  const [selectedSimId, setSelectedSimId] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);

  const cargoNome = (currentUser?.cargo_nome || "").toLowerCase();
  const isAdmin = ["administrador", "admin"].includes(cargoNome);
  const isRestricted = ["vendedor", "projetista"].includes(cargoNome);
  const videoUrl = (product as any)?.video_url || "";

  // Build unified media list (images + video)
  const media = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = images.map(img => ({
      type: "image" as const,
      url: img.image_url,
      thumbUrl: img.image_url,
      id: img.id,
    }));
    if (videoUrl) {
      items.push({
        type: "video",
        url: videoUrl,
        thumbUrl: getYouTubeThumb(videoUrl) || "/placeholder.svg",
        id: "video-0",
      });
    }
    return items;
  }, [images, videoUrl]);

  const featured = media[selectedMediaIdx] || media[0] || null;

  // Load images — query WITHOUT is_default since column doesn't exist
  useEffect(() => {
    if (product && open) {
      supabase.from("product_images" as any)
        .select("id, image_url, is_default")
        .eq("product_id", product.id)
        .then(({ data, error }) => {
          if (error) {
            // Fallback without is_default if column doesn't exist yet
            supabase.from("product_images" as any)
              .select("id, image_url")
              .eq("product_id", product.id)
              .then(({ data: d2 }) => {
            setImages((d2 || []) as any);
                setSelectedMediaIdx(0);
                setPlayingVideo(false);
              });
            setImages((data || []) as any);
            const defaultIdx = (data || []).findIndex((i: any) => i.is_default);
            setSelectedMediaIdx(defaultIdx >= 0 ? defaultIdx : 0);
          }
          setViewerImage(null);
          setPlayingVideo(false);
          setShowAddFlow(false);
        });
    }
  }, [product, open]);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoadingClients(false); return; }
    let query = supabase.from("clients" as any).select("id, name").eq("tenant_id", tenantId).order("name").limit(100);
    if (isRestricted && currentUser?.id) query = query.eq("responsavel_id", currentUser.id);
    const { data } = await query;
    setClients((data || []) as unknown as ClientOption[]);
    setLoadingClients(false);
  }, [isRestricted, currentUser?.id]);

  const loadSimulations = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from("simulations" as any)
      .select("id, valor_tela, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);
    setSimulations((data || []) as unknown as SimulationOption[]);
  }, []);

  const handleAddToSimulation = async () => {
    if (!product) return;
    if (!selectedClientId) {
      sessionStorage.setItem("simulator_prefill", JSON.stringify({ ambiente: product.name, valor: product.sale_price, pecas: 1 }));
      window.dispatchEvent(new CustomEvent("navigate-to-simulator"));
      onOpenChange(false);
      toast.success("Produto incluído na simulação!");
      return;
    }
    if (selectedSimId) {
      const sim = simulations.find(s => s.id === selectedSimId);
      if (sim) {
        const newTotal = (sim.valor_tela || 0) + product.sale_price;
        await supabase.from("simulations" as any).update({ valor_tela: newTotal } as any).eq("id", selectedSimId);
        toast.success("Produto adicionado à simulação!");
        onOpenChange(false);
      }
    } else {
      sessionStorage.setItem("simulator_prefill", JSON.stringify({ ambiente: product.name, valor: product.sale_price, pecas: 1 }));
      window.dispatchEvent(new CustomEvent("navigate-to-simulator"));
      window.dispatchEvent(new CustomEvent("simulate-client", { detail: { clientId: selectedClientId } }));
      onOpenChange(false);
      toast.success("Produto incluído na simulação!");
    }
  };

  if (!product) return null;

  return (
    <>
      <Dialog open={open && !viewerImage} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-16px)] sm:w-[calc(100vw-24px)] max-w-lg max-h-[calc(100dvh-16px)] sm:max-h-[calc(100dvh-24px)] p-0 overflow-hidden flex flex-col gap-0">
          <DialogHeader className="shrink-0 px-3 sm:px-4 pt-3 pb-2 border-b">
            <DialogTitle className="text-sm sm:text-base leading-tight pr-6">{product.name}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3">
            <div className="space-y-3">
              {/* Featured media */}
              {media.length > 0 && featured && (
                <div className="space-y-2">
                  <div
                    className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border bg-muted cursor-pointer group"
                    onClick={() => {
                      if (featured.type === "video") setViewerVideo(featured.url);
                      else setViewerImage(featured.url);
                    }}
                  >
                    {featured.type === "video" ? (
                      <>
                        <img src={featured.thumbUrl} alt="Vídeo" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="h-12 w-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                            <Play className="h-6 w-6 text-primary-foreground ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <img src={featured.url} alt={product.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Thumbnail carousel */}
                  {media.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {media.map((item, idx) => (
                        <button
                          key={item.id}
                          className={`relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-md overflow-hidden border-2 transition-colors ${idx === selectedMediaIdx ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}
                          onClick={() => setSelectedMediaIdx(idx)}
                        >
                          <img src={item.thumbUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                          {item.type === "video" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Play className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {media.length === 0 && (
                <div className="w-full aspect-[4/3] rounded-lg border bg-muted flex items-center justify-center">
                  <span className="text-muted-foreground text-sm">Sem imagens</span>
                </div>
              )}

              {/* Product details */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs block">Código Interno</span><p className="font-mono text-xs">{product.internal_code}</p></div>
                {product.manufacturer_code && <div><span className="text-muted-foreground text-xs block">Cód. Fabricante</span><p className="font-mono text-xs">{product.manufacturer_code}</p></div>}
                <div><span className="text-muted-foreground text-xs block">Categoria</span><p className="capitalize text-xs">{product.category}</p></div>
                {product.environment && <div><span className="text-muted-foreground text-xs block">Ambiente</span><p className="capitalize text-xs">{product.environment}</p></div>}
              </div>

              {product.description && (
                <div><span className="text-xs text-muted-foreground block">Descrição</span><p className="text-xs mt-1">{product.description}</p></div>
              )}

              {(product.width > 0 || product.height > 0 || product.depth > 0) && (
                <div><span className="text-xs text-muted-foreground block">Dimensões (L × A × P)</span>
                  <p className="text-sm font-medium">{product.width} × {product.height} × {product.depth} cm</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Preço de Venda</span>
                  <p className="font-bold text-primary text-base sm:text-lg">{formatCurrency(product.sale_price)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Estoque</span>
                  <p className="font-medium text-xs">{product.stock_quantity} un</p>
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {STOCK_LABELS[product.stock_status] || product.stock_status}
                  </Badge>
                </div>
              </div>

              {product.supplier && (
                <div><span className="text-xs text-muted-foreground block">Fornecedor</span><p className="text-sm font-medium">{product.supplier.name}</p></div>
              )}

              {/* Admin-only: custo, markup, preço mínimo */}
              {isAdmin && (
                <div className="grid grid-cols-3 gap-2 text-sm bg-muted/30 rounded-lg p-3 border">
                  <div><span className="text-xs text-muted-foreground block">Custo</span><p className="font-medium text-xs">{formatCurrency(product.cost_price)}</p></div>
                  <div><span className="text-xs text-muted-foreground block">Markup</span><p className="font-medium text-xs">{product.markup_percentage}%</p></div>
                  {product.min_sale_price > 0 && (
                    <div><span className="text-xs text-muted-foreground block">Preço Mín.</span><p className="font-medium text-xs">{formatCurrency(product.min_sale_price)}</p></div>
                  )}
                </div>
              )}

              {/* Add to Simulation */}
              <div className="border-t pt-3 space-y-2">
                {!showAddFlow ? (
                  <Button className="w-full gap-2 text-xs" size="sm" onClick={() => { setShowAddFlow(true); loadClients(); }}>
                    <ShoppingCart className="h-3.5 w-3.5" /> Incluir em Simulação
                  </Button>
                ) : (
                  <div className="space-y-2 bg-muted/30 rounded-lg p-3 border">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <UserPlus className="h-3.5 w-3.5 text-primary" />
                      Incluir Produto na Simulação
                    </p>
                    <div>
                      <span className="text-xs text-muted-foreground">Cliente (opcional)</span>
                      <Select value={selectedClientId} onValueChange={v => { setSelectedClientId(v === "none" ? "" : v); setSelectedSimId(""); if (v && v !== "none") loadSimulations(v); }}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder={loadingClients ? "Carregando..." : "Sem cliente (nova simulação)"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">Sem cliente (nova simulação)</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedClientId && simulations.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">Simulação existente (opcional)</span>
                        <Select value={selectedSimId} onValueChange={setSelectedSimId}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Nova simulação" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new" className="text-xs">Nova simulação</SelectItem>
                            {simulations.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{formatCurrency(s.valor_tela)} — {new Date(s.created_at).toLocaleDateString("pt-BR")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => setShowAddFlow(false)}>Cancelar</Button>
                      <Button size="sm" className="flex-1 text-xs h-8 gap-1" onClick={handleAddToSimulation}>
                        <ShoppingCart className="h-3 w-3" />
                        {selectedClientId ? "Incluir" : "Ir para Simulador"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Viewer */}
      {viewerImage && <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />}

      {/* Fullscreen Video Player */}
      {viewerVideo && <VideoPlayer url={viewerVideo} onClose={() => setViewerVideo(null)} />}
    </>
  );
}
