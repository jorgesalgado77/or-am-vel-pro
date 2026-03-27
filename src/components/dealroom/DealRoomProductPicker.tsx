/**
 * DealRoomProductPicker — Widget to browse and add catalog products during live negotiation
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Search, Plus, ShoppingCart, Trash2, X } from "lucide-react";
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
  stock_status: string;
  image_url?: string;
}

interface CartItem {
  product: CatalogProduct;
  quantity: number;
}

interface Props {
  tenantId: string;
  onTotalChange?: (total: number, items: CartItem[]) => void;
}

export function DealRoomProductPicker({ tenantId, onTotalChange }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("products" as any)
      .select("id, internal_code, name, description, category, sale_price, stock_status")
      .eq("tenant_id", tenantId)
      .neq("stock_status", "indisponivel")
      .order("name")
      .limit(50);

    if (search) {
      query = query.or(`name.ilike.%${search}%,internal_code.ilike.%${search}%`);
    }

    const { data } = await query;
    if (data) {
      // Load first image for each product
      const ids = (data as any[]).map(p => p.id);
      const { data: images } = await supabase
        .from("product_images" as any)
        .select("product_id, image_url")
        .in("product_id", ids);

      const imageMap = new Map<string, string>();
      (images || []).forEach((img: any) => {
        if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.image_url);
      });

      setProducts((data as any[]).map(p => ({
        ...p,
        image_url: imageMap.get(p.id),
      })));
    }
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addToCart = (product: CatalogProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast.success(`${product.name} adicionado`);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty < 1) return removeFromCart(productId);
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: qty } : i));
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.product.sale_price * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  useEffect(() => {
    onTotalChange?.(cartTotal, cart);
  }, [cartTotal, cart, onTotalChange]);

  const STOCK_LABELS: Record<string, string> = {
    em_estoque: "Em estoque",
    sob_encomenda: "Sob encomenda",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          Produtos do Catálogo
        </h3>
        {cartCount > 0 && (
          <Button size="sm" variant={showCart ? "default" : "outline"} className="gap-1.5 h-7 text-xs" onClick={() => setShowCart(!showCart)}>
            <ShoppingCart className="h-3.5 w-3.5" />
            {cartCount} — {formatCurrency(cartTotal)}
          </Button>
        )}
      </div>

      {/* Cart view */}
      {showCart && cart.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Carrinho</p>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowCart(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {cart.map(item => (
              <div key={item.product.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">{item.product.name}</span>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={e => updateQuantity(item.product.id, Number(e.target.value))}
                  className="w-14 h-6 text-xs text-center p-1"
                />
                <span className="font-medium w-20 text-right">{formatCurrency(item.product.sale_price * item.quantity)}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeFromCart(item.product.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between pt-1 border-t border-primary/20 font-bold text-xs">
              <span>Total Produtos</span>
              <span className="text-primary">{formatCurrency(cartTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Product list */}
      <ScrollArea className="max-h-[300px]">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
        ) : products.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {search ? "Nenhum produto encontrado" : "Nenhum produto no catálogo"}
          </p>
        ) : (
          <div className="space-y-1.5">
            {products.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground font-mono">{p.internal_code}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {STOCK_LABELS[p.stock_status] || p.stock_status}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-primary">{formatCurrency(p.sale_price)}</p>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 mt-0.5" onClick={() => addToCart(p)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
