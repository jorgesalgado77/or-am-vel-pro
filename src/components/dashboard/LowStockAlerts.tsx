/**
 * Low Stock Alerts — widget for Dashboard showing products below minimum quantity
 */
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package, RefreshCw, Bell, Plus, BellOff, Eye, EyeOff, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import { recordStockMovement } from "@/lib/stockMovement";
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

interface SnoozedProduct extends LowStockProduct {
  snoozedUntil: number;
}

const SNOOZE_KEY = "low_stock_snoozed";
const SNOOZE_DAYS = 15;

function getSnoozedProducts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setSnoozedProducts(next: Record<string, number>) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
}

function snoozeProduct(productId: string) {
  const snoozed = getSnoozedProducts();
  snoozed[productId] = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  setSnoozedProducts(snoozed);
}

function getSnoozedUntil(productId: string): number | null {
  const snoozed = getSnoozedProducts();
  const until = snoozed[productId];
  if (!until) return null;
  if (Date.now() > until) {
    delete snoozed[productId];
    setSnoozedProducts(snoozed);
    return null;
  }
  return until;
}

function removeSnooze(productId: string) {
  const snoozed = getSnoozedProducts();
  delete snoozed[productId];
  setSnoozedProducts(snoozed);
}

function formatSnoozeDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("pt-BR");
}

export function LowStockAlerts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [snoozedProducts, setSnoozedList] = useState<SnoozedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [addStockDialog, setAddStockDialog] = useState<LowStockProduct | null>(null);
  const [addQty, setAddQty] = useState("");

  const COLLAPSE_KEY = "low_stock_alerts_collapsed";
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      return stored === "true";
    } catch { return true; }
  });

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const cargoNome = (user?.cargo_nome || "").toLowerCase();
  const isAdmin = cargoNome.includes("administrador") || cargoNome.includes("gerente") || cargoNome.includes("admin");

  const loadAlerts = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("products" as any)
      .select("id, name, internal_code, category, stock_quantity, stock_min_quantity, suppliers!products_supplier_id_fkey(name)")
      .eq("tenant_id", tenantId)
      .order("stock_quantity", { ascending: true });

    if (data) {
      const activeLow: LowStockProduct[] = [];
      const snoozedLow: SnoozedProduct[] = [];

      (data as any[])
        .filter((p) => {
          const minQty = p.stock_min_quantity ?? 5;
          return p.stock_quantity <= minQty && p.stock_quantity >= 0;
        })
        .forEach((p) => {
          const product = {
            id: p.id,
            name: p.name,
            internal_code: p.internal_code,
            category: p.category,
            stock_quantity: p.stock_quantity,
            stock_min_quantity: p.stock_min_quantity ?? 5,
            supplier_name: p.suppliers?.name,
          };

          const snoozedUntil = getSnoozedUntil(p.id);
          if (snoozedUntil) {
            snoozedLow.push({ ...product, snoozedUntil });
          } else {
            activeLow.push(product);
          }
        });

      setProducts(activeLow);
      setSnoozedList(snoozedLow.sort((a, b) => a.snoozedUntil - b.snoozedUntil));

      if (activeLow.some((p) => p.stock_quantity === 0)) {
        const zeroCount = activeLow.filter((p) => p.stock_quantity === 0).length;
        const zeroNames = activeLow.filter((p) => p.stock_quantity === 0).slice(0, 3).map(p => p.name).join(", ");
        const suffix = zeroCount > 3 ? ` e mais ${zeroCount - 3}` : "";

        // Send push to current user
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session?.session?.user?.id) {
            sendPushIfEnabled(
              "estoque",
              session.session.user.id,
              "🚨 Estoque Zerado",
              `${zeroCount} produto(s) com estoque zero: ${zeroNames}${suffix}. Reposição necessária!`,
              "zero-stock",
            );
          }
        } catch {}

        // Send push to all admin users
        try {
          const { data: adminUsers } = await supabase
            .from("usuarios" as any)
            .select("id, cargo_nome")
            .eq("tenant_id", tenantId)
            .in("cargo_nome", ["administrador", "admin", "gerente"]);

          const { data: session } = await supabase.auth.getSession();
          const currentUserId = session?.session?.user?.id;

          if (adminUsers) {
            for (const admin of adminUsers as any[]) {
              if (admin.id === currentUserId) continue; // already notified above
              sendPushIfEnabled(
                "estoque",
                admin.id,
                "🚨 Estoque Zerado",
                `${zeroCount} produto(s) com estoque zero: ${zeroNames}${suffix}. Reposição necessária!`,
                "zero-stock",
              );
            }
          }
        } catch {}
      }

      // Push for low stock (at or below minimum, but not zero)
      const lowOnly = activeLow.filter((p) => p.stock_quantity > 0);
      if (lowOnly.length > 0) {
        const lowNames = lowOnly.slice(0, 3).map(p => `${p.name} (${p.stock_quantity}/${p.stock_min_quantity})`).join(", ");
        const lowSuffix = lowOnly.length > 3 ? ` e mais ${lowOnly.length - 3}` : "";

        try {
          const { data: session } = await supabase.auth.getSession();
          const currentUserId = session?.session?.user?.id;

          if (currentUserId) {
            sendPushIfEnabled(
              "estoque",
              currentUserId,
              "⚠️ Estoque Baixo",
              `${lowOnly.length} produto(s) atingiram o mínimo: ${lowNames}${lowSuffix}`,
              "low-stock",
            );
          }

          const { data: adminUsers } = await supabase
            .from("usuarios" as any)
            .select("id, cargo_nome")
            .eq("tenant_id", tenantId)
            .in("cargo_nome", ["administrador", "admin", "gerente"]);

          if (adminUsers) {
            for (const admin of adminUsers as any[]) {
              if (admin.id === currentUserId) continue;
              sendPushIfEnabled(
                "estoque",
                admin.id,
                "⚠️ Estoque Baixo",
                `${lowOnly.length} produto(s) atingiram o mínimo: ${lowNames}${lowSuffix}`,
                "low-stock",
              );
            }
          }
        } catch {}
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

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
      return;
    }

    // Record stock movement
    const tenantId = await getResolvedTenantId();
    if (tenantId) {
      const { data: session } = await supabase.auth.getSession();
      recordStockMovement({
        tenant_id: tenantId,
        product_id: addStockDialog.id,
        user_id: session?.session?.user?.id,
        type: "entrada",
        quantity: qty,
        previous_quantity: addStockDialog.stock_quantity,
        new_quantity: newQty,
        reason: "Reposição manual via painel de alertas",
      });
    }

    toast.success(`Estoque de "${addStockDialog.name}" atualizado para ${newQty} unidades`);
    setAddStockDialog(null);
    setAddQty("");
    loadAlerts();
  };

  const handleSnooze = (product: LowStockProduct) => {
    snoozeProduct(product.id);
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    const snoozedUntil = getSnoozedUntil(product.id);
    if (snoozedUntil) {
      setSnoozedList((prev) => [...prev, { ...product, snoozedUntil }].sort((a, b) => a.snoozedUntil - b.snoozedUntil));
    }
    toast.info(`Alerta de "${product.name}" silenciado por ${SNOOZE_DAYS} dias. Você será novamente notificado após esse período.`, {
      duration: 5000,
    });
  };

  const handleReactivate = (product: SnoozedProduct) => {
    removeSnooze(product.id);
    setSnoozedList((prev) => prev.filter((p) => p.id !== product.id));
    setProducts((prev) => [...prev, product].sort((a, b) => a.stock_quantity - b.stock_quantity));
    toast.success(`Alerta de "${product.name}" reativado antes dos ${SNOOZE_DAYS} dias.`);
  };

  const criticalCount = products.filter((p) => p.stock_quantity === 0).length;
  const hasVisibleContent = products.length > 0 || (isAdmin && snoozedProducts.length > 0);

  // Auto-expand/collapse based on data (respecting user override)
  useEffect(() => {
    if (loading) return;
    const userExplicitlySet = localStorage.getItem(COLLAPSE_KEY) !== null;
    if (!userExplicitlySet) {
      setCollapsed(!hasVisibleContent);
    }
  }, [loading, hasVisibleContent]);

  if (!loading && !hasVisibleContent) return null;

  return (
    <>
      <Card className={criticalCount > 0 ? "border-destructive/50" : "border-yellow-500/30"}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle
              className="text-base flex items-center gap-2 cursor-pointer select-none"
              onClick={toggleCollapse}
            >
              <AlertTriangle className={`h-4 w-4 ${criticalCount > 0 ? "text-destructive" : "text-yellow-500"}`} />
              Alertas de Estoque Baixo
              {products.length > 0 && <Badge variant="destructive" className="text-xs">{products.length}</Badge>}
              {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
            <div className="flex items-center gap-2">
              {collapsed && products.length > 0 && (
                <span className="text-xs text-muted-foreground">{products.length} alerta(s) • {criticalCount} crítico(s)</span>
              )}
              {!collapsed && isAdmin && snoozedProducts.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowSnoozed((prev) => !prev)}>
                  {showSnoozed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  Silenciados ({snoozedProducts.length})
                </Button>
              )}
              {!collapsed && (
                <Button variant="ghost" size="sm" onClick={loadAlerts} className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="low-stock-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <CardContent>
                {loading ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">Verificando estoque...</div>
                ) : (
                  <div className="space-y-3 max-h-[360px] overflow-y-auto">
                    {criticalCount > 0 && (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
                        <Bell className="h-3 w-3" />
                        {criticalCount} produto(s) com estoque ZERADO — reposição urgente!
                      </div>
                    )}

                    {products.length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        Nenhum alerta ativo no momento.
                      </div>
                    ) : (
                      products.map((p, idx) => (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: idx * 0.05 }}
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
                                  onClick={() => {
                                    setAddStockDialog(p);
                                    setAddQty("");
                                  }}
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
                            <Badge variant={p.stock_quantity === 0 ? "destructive" : "outline"} className="text-xs">
                              {p.stock_quantity} / {p.stock_min_quantity}
                            </Badge>
                          </div>
                        </motion.div>
                      ))
                    )}

                    {isAdmin && showSnoozed && snoozedProducts.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Alertas silenciados</p>
                          <span className="text-xs text-muted-foreground">Reative antes dos 15 dias se desejar</span>
                        </div>
                        {snoozedProducts.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 bg-muted/30">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.internal_code} • volta em {formatSnoozeDate(p.snoozedUntil)}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => handleReactivate(p)}>
                              <RotateCcw className="h-3 w-3" />
                              Reativar
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

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
                <Badge variant="default">
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
