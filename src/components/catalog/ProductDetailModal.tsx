import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import type { Product } from "@/hooks/useProductCatalog";
import { formatCurrency } from "@/lib/financing";
import { X, ZoomIn, Play, UserPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface ProductImage {
  id: string;
  image_url: string;
  is_default: boolean;
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

interface ClientOption {
  id: string;
  name: string;
}

interface SimulationOption {
  id: string;
  valor_tela: number;
  created_at: string;
}

export function ProductDetailModal({ product, open, onOpenChange }: Props) {
  const { currentUser } = useCurrentUser();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  // Add to simulation state
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [simulations, setSimulations] = useState<SimulationOption[]>([]);
  const [selectedSimId, setSelectedSimId] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);

  const cargo = currentUser?.cargo_nome?.toUpperCase() || "";
  const isRestricted = cargo === "VENDEDOR" || cargo === "PROJETISTA";

  useEffect(() => {
    if (product && open) {
      supabase.from("product_images" as any).select("id, image_url, is_default").eq("product_id", product.id)
        .then(({ data }) => {
          setImages((data || []) as any);
          setExpandedImage(null);
          setShowVideo(false);
          setShowAddFlow(false);
        });
    }
  }, [product, open]);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoadingClients(false); return; }

    let query = supabase.from("clients" as any).select("id, name").eq("tenant_id", tenantId).order("name").limit(100);

    // If restricted role, only show own clients
    if (isRestricted && currentUser?.id) {
      query = query.eq("responsavel_id", currentUser.id);
    }

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
      // No client selected — go to simulator with product prefill
      sessionStorage.setItem("simulator_prefill", JSON.stringify({
        ambiente: product.name,
        valor: product.sale_price,
        pecas: 1,
      }));
      window.dispatchEvent(new CustomEvent("navigate-to-simulator"));
      onOpenChange(false);
      toast.success("Produto incluído na simulação!");
      return;
    }

    if (selectedSimId) {
      // Add product value to existing simulation
      const sim = simulations.find(s => s.id === selectedSimId);
      if (sim) {
        const newTotal = (sim.valor_tela || 0) + product.sale_price;
        await supabase.from("simulations" as any).update({ valor_tela: newTotal } as any).eq("id", selectedSimId);
        toast.success("Produto adicionado à simulação!");
        onOpenChange(false);
      }
    } else {
      // Navigate to simulator with this client and product
      sessionStorage.setItem("simulator_prefill", JSON.stringify({
        ambiente: product.name,
        valor: product.sale_price,
        pecas: 1,
      }));
      // Dispatch event to navigate to simulator with the selected client
      window.dispatchEvent(new CustomEvent("navigate-to-simulator"));
      // Also dispatch to set client
      window.dispatchEvent(new CustomEvent("simulate-client", { detail: { clientId: selectedClientId } }));
      onOpenChange(false);
      toast.success("Produto incluído na simulação!");
    }
  };

  const getVideoEmbedUrl = (url: string): string | null => {
    if (!url) return null;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    // Direct video URL
    return url;
  };

  if (!product) return null;

  const videoUrl = (product as any).video_url || "";
  const embedUrl = getVideoEmbedUrl(videoUrl);
  const isDirectVideo = videoUrl && !videoUrl.includes("youtube") && !videoUrl.includes("youtu.be") && !videoUrl.includes("vimeo");

  return (
    <>
      <Dialog open={open && !expandedImage && !showVideo} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">{product.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-2">
              {/* Images gallery */}
              {images.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {images.map(img => (
                    <div key={img.id} className={`relative w-24 h-24 rounded-md overflow-hidden border cursor-pointer group ${img.is_default ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setExpandedImage(img.image_url)}>
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                        <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {img.is_default && (
                        <span className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[8px] px-1 rounded font-medium">Padrão</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Video button */}
              {videoUrl && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowVideo(true)}>
                  <Play className="h-3.5 w-3.5" /> Ver Vídeo do Produto
                </Button>
              )}

              {/* Product details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs block">Código Interno</span><p className="font-mono">{product.internal_code}</p></div>
                {product.manufacturer_code && <div><span className="text-muted-foreground text-xs block">Cód. Fabricante</span><p className="font-mono">{product.manufacturer_code}</p></div>}
                <div><span className="text-muted-foreground text-xs block">Categoria</span><p className="capitalize">{product.category}</p></div>
                {product.environment && <div><span className="text-muted-foreground text-xs block">Ambiente</span><p className="capitalize">{product.environment}</p></div>}
              </div>

              {product.description && (
                <div><span className="text-xs text-muted-foreground block">Descrição</span><p className="text-sm mt-1">{product.description}</p></div>
              )}

              {(product.width > 0 || product.height > 0 || product.depth > 0) && (
                <div><span className="text-xs text-muted-foreground block">Dimensões (L × A × P)</span>
                  <p className="text-sm font-medium">{product.width} × {product.height} × {product.depth} cm</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Preço de Venda</span>
                  <p className="font-bold text-primary text-lg">{formatCurrency(product.sale_price)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Estoque</span>
                  <p className="font-medium">{product.stock_quantity} un</p>
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {STOCK_LABELS[product.stock_status] || product.stock_status}
                  </Badge>
                </div>
              </div>

              {product.supplier && (
                <div><span className="text-xs text-muted-foreground block">Fornecedor</span><p className="text-sm font-medium">{product.supplier.name}</p></div>
              )}

              {!isRestricted && (
                <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg p-3 border">
                  <div><span className="text-xs text-muted-foreground block">Custo</span><p className="font-medium">{formatCurrency(product.cost_price)}</p></div>
                  <div><span className="text-xs text-muted-foreground block">Markup</span><p className="font-medium">{product.markup_percentage}%</p></div>
                  {product.min_sale_price > 0 && (
                    <div><span className="text-xs text-muted-foreground block">Preço Mín.</span><p className="font-medium">{formatCurrency(product.min_sale_price)}</p></div>
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
                      <Select
                        value={selectedClientId}
                        onValueChange={v => {
                          setSelectedClientId(v === "none" ? "" : v);
                          setSelectedSimId("");
                          if (v && v !== "none") loadSimulations(v);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder={loadingClients ? "Carregando..." : "Sem cliente (nova simulação)"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">Sem cliente (nova simulação)</SelectItem>
                          {clients.map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                          ))}
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
                            {simulations.map(s => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {formatCurrency(s.valor_tela)} — {new Date(s.created_at).toLocaleDateString("pt-BR")}
                              </SelectItem>
                            ))}
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
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Expanded Image */}
      {expandedImage && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center cursor-pointer" onClick={() => setExpandedImage(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-white/80" onClick={() => setExpandedImage(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={expandedImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}

      {/* Video Modal */}
      {showVideo && videoUrl && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center" onClick={() => setShowVideo(false)}>
          <button className="absolute top-4 right-4 text-white hover:text-white/80 z-10" onClick={() => setShowVideo(false)}>
            <X className="h-6 w-6" />
          </button>
          <div className="w-[90vw] max-w-3xl aspect-video" onClick={e => e.stopPropagation()}>
            {isDirectVideo ? (
              <video src={videoUrl} controls autoPlay className="w-full h-full rounded-lg" />
            ) : embedUrl ? (
              <iframe src={embedUrl} className="w-full h-full rounded-lg" allowFullScreen allow="autoplay; encrypted-media" />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
