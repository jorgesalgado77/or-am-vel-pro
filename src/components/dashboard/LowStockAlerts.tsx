/**
 * Low Stock Alerts — widget for Dashboard showing products below minimum quantity
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package, RefreshCw, Bell } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { sendPushIfEnabled } from "@/lib/pushHelper";

interface LowStockProduct {
  id: string;
  name: string;
  internal_code: string;
  category: string;
  stock_quantity: number;
  stock_min_quantity: number;
  supplier_name?: string;
}

export function LowStockAlerts() {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    const tenantId = getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    setLoading(true);
    const { data } = await supabase
      .from("products" as any)
      .select("id, name, internal_code, category, stock_quantity, stock_min_quantity, suppliers!products_supplier_id_fkey(name)")
      .eq("tenant_id", tenantId)
      .order("stock_quantity", { ascending: true });

    if (data) {
      const low = (data as any[])
        .filter(p => {
          const minQty = p.stock_min_quantity ?? 5;
          return p.stock_quantity <= minQty && p.stock_quantity >= 0;
        })
        .map(p => ({
          id: p.id,
          name: p.name,
          internal_code: p.internal_code,
          category: p.category,
          stock_quantity: p.stock_quantity,
          stock_min_quantity: p.stock_min_quantity ?? 5,
          supplier_name: p.suppliers?.name,
        }));
      setProducts(low);

      // Send push notification if critical items found
      if (low.some(p => p.stock_quantity === 0)) {
        const zeroCount = low.filter(p => p.stock_quantity === 0).length;
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session?.session?.user?.id) {
            sendPushIfEnabled(
              "leads",
              session.session.user.id,
              "⚠️ Estoque Zerado",
              `${zeroCount} produto(s) com estoque zerado precisam de reposição!`,
              "low-stock",
            );
          }
        } catch { /* silent */ }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const criticalCount = products.filter(p => p.stock_quantity === 0).length;
  const warningCount = products.filter(p => p.stock_quantity > 0).length;

  if (!loading && products.length === 0) return null;

  return (
    <Card className={criticalCount > 0 ? "border-destructive/50" : "border-yellow-500/30"}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${criticalCount > 0 ? "text-destructive" : "text-yellow-500"}`} />
            Alertas de Estoque Baixo
            {products.length > 0 && (
              <Badge variant="destructive" className="text-xs">{products.length}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadAlerts} className="gap-1">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">Verificando estoque...</div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {criticalCount > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs font-medium mb-2">
                <Bell className="h-3 w-3" />
                {criticalCount} produto(s) com estoque ZERADO — reposição urgente!
              </div>
            )}
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.internal_code} • {p.category}
                      {p.supplier_name && ` • ${p.supplier_name}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={p.stock_quantity === 0 ? "destructive" : "outline"}
                    className="text-xs"
                  >
                    {p.stock_quantity} / {p.stock_min_quantity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
