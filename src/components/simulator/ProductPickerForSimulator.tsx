/**
 * ProductPickerForSimulator — Popover to add catalog products to negotiation budget
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Search, Plus, Check, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";

interface CatalogProduct {
  id: string;
  internal_code: string;
  name: string;
  category: string;
  sale_price: number;
  stock_status: string;
}

interface SelectedProduct {
  product: CatalogProduct;
  quantity: number;
}

interface Props {
  tenantId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: SelectedProduct[], total: number) => void;
}

export function ProductPickerForSimulator({ tenantId, open, onOpenChange, onConfirm }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, SelectedProduct>>(new Map());

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from("products" as any)
      .select("id, internal_code, name, category, sale_price, stock_status")
      .eq("tenant_id", tenantId)
      .neq("stock_status", "indisponivel")
      .order("name")
      .limit(100);

    if (search) {
      query = query.or(`name.ilike.%${search}%,internal_code.ilike.%${search}%`);
    }
    const { data } = await query;
    if (data) setProducts(data as any);
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => {
    if (open) {
      loadProducts();
      setSelected(new Map());
    }
  }, [open, loadProducts]);

  const toggleProduct = (p: CatalogProduct) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
      } else {
        next.set(p.id, { product: p, quantity: 1 });
      }
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
      <DialogContent className="sm:max-w-lg max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Adicionar Produtos ao Orçamento
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..." className="pl-8 h-9 text-sm" />
        </div>

        <ScrollArea className="flex-1 max-h-[400px]">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum produto encontrado</p>
          ) : (
            <div className="space-y-1">
              {products.map(p => {
                const isSelected = selected.has(p.id);
                const qty = selected.get(p.id)?.quantity || 1;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"}`}
                    onClick={() => toggleProduct(p)}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{p.internal_code} • {p.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-primary">{formatCurrency(p.sale_price)}</p>
                      {isSelected && (
                        <Input
                          type="number"
                          min={1}
                          value={qty}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); updateQty(p.id, Number(e.target.value)); }}
                          className="w-14 h-6 text-xs text-center p-0.5 mt-0.5"
                        />
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
            <span className="text-xs text-muted-foreground">{items.length} produto(s)</span>
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
