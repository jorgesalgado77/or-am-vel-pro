/**
 * Low Stock Alerts — widget for Dashboard showing products below minimum quantity
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package, RefreshCw, Bell, Plus, BellOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LowStockProduct {
  id: string;
  name: string;
  internal_code: string;
  category: string;
  stock_quantity: number;
  stock_min_quantity: number;
  supplier_name?: string;
}

const SNOOZE_KEY = "low_stock_snoozed";
const SNOOZE_DAYS = 15;

function getSnoozedProducts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}");
  } catch { return {}; }
}

function snoozeProduct(productId: string) {
  const snoozed = getSnoozedProducts();
  snoozed[productId] = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozed));
}

function isSnoozed(productId: string): boolean {
  const snoozed = getSnoozedProducts();
  const until = snoozed[productId];
  if (!until) return false;
  if (Date.now() > until) {
    // Expired — clean up
    delete snoozed[productId];
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozed));
    return false;
  }
  return true;
}

export function LowStockAlerts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addStockDialog, setAddStockDialog] = useState<LowStockProduct | null>(null);
  const [addQty, setAddQty] = useState("");

  const cargoNome = (user?.cargo_nome || "").toLowerCase();
  const isAdmin = cargoNome.includes("administrador") || cargoNome.includes("gerente") || cargoNome.includes("admin");

  const loadAlerts = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
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
        .filter(p => !isSnoozed(p.id))
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

  const handleAddStock = async () => {
    if (!addStockDialog || !addQty || Number(addQty) <= 0) return;
    const qty = Number(addQty);
    const newQty = addStockDialog.stock_quantity + qty;

    const { error } = await supabase
      .from("products" as any)
      .update({ stock_quantity: newQty } as any)
      .eq("id", addStockDialog.id);

    if (error) {
      toast.error("Erro ao atualizar estoque");
    } else {
      toast.success(`Estoque de "${addStockDialog.name}" atualizado para ${newQty} unidades`);
      setAddStockDialog(null);
      setAddQty("");
      loadAlerts();
    }
  };

  const handleSnooze = (product: LowStockProduct) => {
    snoozeProduct(product.id);
    setProducts(prev => prev.filter(p => p.id !== product.id));
    toast.info(
      `Alerta de "${product.name}" silenciado por ${SNOOZE_DAYS} dias. Você será notificado novamente após esse período.`,
      { duration: 5000 }
    );
  };

  const criticalCount = products.filter(p => p.stock_quantity === 0).length;

  if (!loading && products.length === 0) return null;

  return (
    <>
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
                  className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/30 transition-colors gap-2"
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => { setAddStockDialog(p); setAddQty(""); }}
                          title="Adicionar ao estoque"
                        >
                          <Plus className="h-3 w-3" />
                          Estoque
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => handleSnooze(p)}
                          title="Silenciar alerta por 15 dias"
                        >
                          <BellOff className="h-3 w-3" />
                        </Button>
                      </>
                    )}
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

      {/* Add Stock Dialog */}
      <Dialog open={!!addStockDialog} onOpenChange={(open) => { if (!open) setAddStockDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adicionar ao Estoque
            </DialogTitle>
            <DialogDescription>
              Informe a quantidade a adicionar ao estoque de <strong>{addStockDialog?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estoque atual:</span>
              <Badge variant="outline">{addStockDialog?.stock_quantity} un.</Badge>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-qty">Quantidade a adicionar</Label>
              <Input
                id="add-qty"
                type="number"
                min="1"
                placeholder="Ex: 10"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                autoFocus
              />
            </div>
            {addQty && Number(addQty) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Novo estoque:</span>
                <Badge className="bg-green-600 text-white">
                  {(addStockDialog?.stock_quantity || 0) + Number(addQty)} un.
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStockDialog(null)}>Cancelar</Button>
            <Button onClick={handleAddStock} disabled={!addQty || Number(addQty) <= 0}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
