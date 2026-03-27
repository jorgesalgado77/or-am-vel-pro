/**
 * ChatProductPicker — Popover to send product cards in chat
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";

interface CatalogProduct {
  id: string;
  internal_code: string;
  name: string;
  description: string;
  category: string;
  sale_price: number;
  image_url?: string;
}

interface Props {
  tenantId: string | null;
  onSendProduct: (text: string, imageUrl?: string) => void;
}

export function ChatProductPicker({ tenantId, onSendProduct }: Props) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from("products" as any)
      .select("id, internal_code, name, description, category, sale_price")
      .eq("tenant_id", tenantId)
      .neq("stock_status", "indisponivel")
      .order("name")
      .limit(30);

    if (search) {
      query = query.or(`name.ilike.%${search}%,internal_code.ilike.%${search}%`);
    }
    const { data } = await query;
    if (data) {
      const ids = (data as any[]).map(p => p.id);
      const { data: images } = ids.length > 0
        ? await supabase.from("product_images" as any).select("product_id, image_url").in("product_id", ids)
        : { data: [] };
      const imageMap = new Map<string, string>();
      ((images || []) as any[]).forEach(img => {
        if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.image_url);
      });
      setProducts((data as any[]).map(p => ({ ...p, image_url: imageMap.get(p.id) })));
    }
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => {
    if (open) loadProducts();
  }, [open, loadProducts]);

  const sendProduct = (p: CatalogProduct) => {
    const lines = [
      `📦 *${p.name}*`,
      p.description ? p.description.slice(0, 100) : "",
      `💰 ${formatCurrency(p.sale_price)}`,
      `🔖 Cód: ${p.internal_code}`,
    ].filter(Boolean);
    onSendProduct(lines.join("\n"), p.image_url);
    setOpen(false);
    toast.success("Produto enviado no chat");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Enviar produto do catálogo">
          <Package className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-primary" />
            Enviar Produto
          </p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[260px]">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Carregando...</p>
          ) : products.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {search ? "Nenhum produto encontrado" : "Catálogo vazio"}
            </p>
          ) : (
            <div className="p-1.5 space-y-1">
              {products.map(p => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
                  onClick={() => sendProduct(p)}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.internal_code}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-primary">{formatCurrency(p.sale_price)}</p>
                    <Send className="h-3 w-3 text-muted-foreground ml-auto mt-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
