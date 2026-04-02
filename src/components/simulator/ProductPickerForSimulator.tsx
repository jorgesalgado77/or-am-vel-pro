/**
 * ProductPickerForSimulator — Modal to add catalog products to negotiation budget
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, Check, ShoppingCart, Ruler, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";
import { ProductDetailModal } from "@/components/catalog/ProductDetailModal";
import type { Product } from "@/hooks/useProductCatalog";

export interface CatalogProduct {
  id: string;
  internal_code: string;
  name: string;
  category: string;
  sale_price: number;
  stock_status: string;
  stock_quantity: number;
  description: string;
  width: number;
  height: number;
  depth: number;
  environment: string;
  manufacturer_code: string;
  main_image?: string;
}

export interface SelectedProduct {
  product: CatalogProduct;
  quantity: number;
}

interface Props {
  tenantId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: SelectedProduct[], total: number) => void;
}

const ENV_OPTIONS = [
  "cozinha", "lavanderia", "sala", "hall", "area gourmet",
  "banheiro social", "lavabo", "banheiro suite",
  "dormitorio solteiro", "dormitorio infantil", "dormitorio hospede", "dormitorio casal", "outros",
];

export function ProductPickerForSimulator({ tenantId, open, onOpenChange, onConfirm }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [filterEnvironment, setFilterEnvironment] = useState("_all");
  const [filterStock, setFilterStock] = useState("_all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, SelectedProduct>>(new Map());

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from("products" as any)
      .select("id, internal_code, name, category, sale_price, stock_status, stock_quantity, description, width, height, depth, environment, manufacturer_code")
      .eq("tenant_id", tenantId)
      .neq("stock_status", "indisponivel")
      .order("name")
      .limit(200);

    if (search) {
      query = query.or(`name.ilike.%${search}%,internal_code.ilike.%${search}%,manufacturer_code.ilike.%${search}%,environment.ilike.%${search}%`);
    }
    if (filterEnvironment !== "_all") query = query.eq("environment", filterEnvironment);
    if (filterStock === "em_estoque") query = query.eq("stock_status", "em_estoque");

    const { data } = await query;

    if (data && (data as any[]).length > 0) {
      const ids = (data as any[]).map((p: any) => p.id);
      const { data: imgs } = await supabase.from("product_images" as any).select("product_id, image_url").in("product_id", ids);
      const imgMap = new Map<string, string>();
      if (imgs) for (const img of imgs as any[]) { if (!imgMap.has(img.product_id)) imgMap.set(img.product_id, img.image_url); }
      setProducts((data as any[]).map((p: any) => ({ ...p, main_image: imgMap.get(p.id) })));
    } else {
      setProducts([]);
    }
    setLoading(false);
  }, [tenantId, search, filterEnvironment, filterStock]);

  useEffect(() => {
    if (open) { loadProducts(); setSelected(new Map()); }
  }, [open, loadProducts]);

  const toggleProduct = (p: CatalogProduct) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, { product: p, quantity: 1 });
      return next;
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setSelected(prev => {
      const next = new Map(prev);
      const item = next.get(id);
      if (item) next.set(id, { ...item, quantity: qty });
      return next;
    });
  };

  const items = Array.from(selected.values());
  const total = items.reduce((sum, i) => sum + i.product.sale_price * i.quantity, 0);

  const handleConfirm = () => {
    if (items.length === 0) { toast.error("Selecione ao menos um produto"); return; }
    onConfirm(items, total);
    onOpenChange(false);
    toast.success(`${items.length} produto(s) adicionado(s) ao orçamento`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Adicionar Produtos ao Orçamento
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, código interno, cód. fabricante, ambiente..." className="pl-8 h-9 text-sm" />
          </div>
          <Select value={filterEnvironment} onValueChange={setFilterEnvironment}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Ambiente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos ambientes</SelectItem>
              {ENV_OPTIONS.map(e => <SelectItem key={e} value={e} className="text-xs capitalize">{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStock} onValueChange={setFilterStock}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Estoque" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos</SelectItem>
              <SelectItem value="em_estoque">Em estoque</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1 max-h-[500px]">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum produto encontrado</p>
          ) : (
            <div className="space-y-1.5">
              {products.map(p => {
                const isSelected = selected.has(p.id);
                const qty = selected.get(p.id)?.quantity || 1;
                const hasDims = p.width > 0 || p.height > 0 || p.depth > 0;
                return (
                  <div key={p.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"}`}
                    onClick={() => toggleProduct(p)}
                  >
                    <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>

                    {p.main_image && (
                      <div className="w-14 h-14 rounded-md overflow-hidden border shrink-0">
                        <img src={p.main_image} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono">{p.internal_code}</span>
                        {p.manufacturer_code && <span className="text-[10px] text-muted-foreground">Fab: {p.manufacturer_code}</span>}
                        <span className="text-[10px] text-muted-foreground capitalize">{p.category}</span>
                        {p.environment && <span className="text-[10px] text-muted-foreground capitalize">📍 {p.environment}</span>}
                      </div>
                      {hasDims && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                          <Ruler className="h-2.5 w-2.5" />{p.width} × {p.height} × {p.depth} cm
                        </div>
                      )}
                      {p.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                      <Badge variant="outline" className={`text-[9px] mt-1 ${p.stock_status === "em_estoque" ? "text-green-700" : "text-yellow-700"}`}>
                        {p.stock_quantity} un — {p.stock_status === "em_estoque" ? "Em estoque" : "Sob encomenda"}
                      </Badge>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price)}</p>
                      {isSelected && (
                        <Input type="number" min={1} value={qty}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); updateQty(p.id, Number(e.target.value)); }}
                          className="w-16 h-7 text-xs text-center p-0.5 mt-1" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {items.length > 0 && (
          <div className="flex items-center justify-between py-2 px-1 border-t">
            <span className="text-xs text-muted-foreground">{items.length} produto(s) • {items.reduce((s, i) => s + i.quantity, 0)} un</span>
            <span className="text-sm font-bold text-primary">{formatCurrency(total)}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={items.length === 0} className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />
            Adicionar ({formatCurrency(total)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}