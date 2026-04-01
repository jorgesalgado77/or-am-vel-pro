import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Product } from "@/hooks/useProductCatalog";
import { X, ZoomIn } from "lucide-react";

interface ProductImage {
  id: string;
  image_url: string;
}

interface Props {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STOCK_LABELS: Record<string, string> = {
  em_estoque: "Em estoque",
  sob_encomenda: "Sob encomenda",
  indisponivel: "Indisponível",
};

export function ProductDetailModal({ product, open, onOpenChange }: Props) {
  const { currentUser } = useCurrentUser();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const cargo = currentUser?.cargo_nome?.toUpperCase() || "";
  const isRestricted = cargo === "VENDEDOR" || cargo === "PROJETISTA";

  useEffect(() => {
    if (product && open) {
      supabase.from("product_images" as any).select("id, image_url").eq("product_id", product.id)
        .then(({ data }) => { setImages((data || []) as any); setExpandedImage(null); });
    }
  }, [product, open]);

  if (!product) return null;

  return (
    <>
      <Dialog open={open && !expandedImage} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">{product.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-2">
              {images.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {images.map(img => (
                    <div key={img.id} className="relative w-24 h-24 rounded-md overflow-hidden border cursor-pointer group"
                      onClick={() => setExpandedImage(img.image_url)}>
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                        <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                  <p className="font-bold text-primary text-lg">{formatBRL(product.sale_price)}</p>
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
                  <div><span className="text-xs text-muted-foreground block">Custo</span><p className="font-medium">{formatBRL(product.cost_price)}</p></div>
                  <div><span className="text-xs text-muted-foreground block">Markup</span><p className="font-medium">{product.markup_percentage}%</p></div>
                  {product.min_sale_price > 0 && (
                    <div><span className="text-xs text-muted-foreground block">Preço Mín.</span><p className="font-medium">{formatBRL(product.min_sale_price)}</p></div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {expandedImage && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center cursor-pointer" onClick={() => setExpandedImage(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-white/80" onClick={() => setExpandedImage(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={expandedImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}