/**
 * MIAStockAlerts — Shows low/zero stock alerts and contracts needing purchases in MIA chat.
 */
import { useEffect, useState, memo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Package, PackageX, ChevronDown, ChevronUp, RefreshCw,
  ShoppingCart, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface LowStockProduct {
  id: string;
  name: string;
  internal_code: string;
  stock_quantity: number;
  stock_min_quantity: number;
}

interface ContractNeedsPurchase {
  contract_id: string;
  client_name: string;
  contract_date: string;
  seller_name: string;
  products: { name: string; internal_code: string; quantity: number }[];
}

interface Props {
  tenantId: string;
}

const CACHE_KEY = "mia_stock_alerts_cache";
const CACHE_TTL = 10 * 60 * 1000;

export const MIAStockAlerts = memo(function MIAStockAlerts({ tenantId }: Props) {
  const [zeroStock, setZeroStock] = useState<LowStockProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [contractAlerts, setContractAlerts] = useState<ContractNeedsPurchase[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchAlerts = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL) {
            setZeroStock(parsed.zeroStock);
            setLowStock(parsed.lowStock);
            setContractAlerts(parsed.contractAlerts);
            setLoaded(true);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setLoading(true);
    try {
      // 1. Fetch products with low/zero stock
      const { data: products } = await supabase
        .from("products" as any)
        .select("id, name, internal_code, stock_quantity, stock_min_quantity")
        .eq("tenant_id", tenantId)
        .order("stock_quantity", { ascending: true })
        .limit(100);

      const allProducts = (products as any[]) || [];
      const zero: LowStockProduct[] = [];
      const low: LowStockProduct[] = [];

      allProducts.forEach((p) => {
        const minQty = p.stock_min_quantity ?? 5;
        if (p.stock_quantity <= 0) {
          zero.push(p);
        } else if (p.stock_quantity <= minQty) {
          low.push(p);
        }
      });

      // 2. Fetch recent contracts (last 90 days) with snapshots to find out-of-stock products
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: contracts } = await supabase
        .from("client_contracts" as any)
        .select("id, created_at, snapshot, client_id")
        .eq("tenant_id", tenantId)
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      const contractsData = (contracts as any[]) || [];
      const zeroStockIds = new Set(zero.map(p => p.internal_code));

      // Get client info for contracts with out-of-stock products
      const clientIds = [...new Set(contractsData.map(c => c.client_id).filter(Boolean))];
      let clientMap: Record<string, any> = {};
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from("clients" as any)
          .select("id, nome, vendedor, responsavel_id")
          .in("id", clientIds);
        (clients as any[] || []).forEach(c => { clientMap[c.id] = c; });
      }

      const contractNeedsPurchase: ContractNeedsPurchase[] = [];
      contractsData.forEach(contract => {
        const snapshot = contract.snapshot;
        if (!snapshot?.catalogProducts?.length) return;

        const outOfStockProducts = snapshot.catalogProducts.filter((cp: any) =>
          zeroStockIds.has(cp.internal_code) ||
          cp.stock_status === "out_of_stock" ||
          cp.stock_status === "encomenda"
        );

        if (outOfStockProducts.length > 0) {
          const client = clientMap[contract.client_id];
          contractNeedsPurchase.push({
            contract_id: contract.id,
            client_name: client?.nome || "Cliente",
            contract_date: contract.created_at,
            seller_name: snapshot.responsavel_venda || snapshot.vendedor || client?.vendedor || "—",
            products: outOfStockProducts.map((p: any) => ({
              name: p.name,
              internal_code: p.internal_code,
              quantity: p.quantity || 1,
            })),
          });
        }
      });

      setZeroStock(zero.slice(0, 10));
      setLowStock(low.slice(0, 10));
      setContractAlerts(contractNeedsPurchase.slice(0, 10));
      setLoaded(true);

      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          zeroStock: zero.slice(0, 10),
          lowStock: low.slice(0, 10),
          contractAlerts: contractNeedsPurchase.slice(0, 10),
          timestamp: Date.now(),
        }));
      } catch { /* ignore */ }
    } catch (err) {
      console.warn("[MIA Stock Alerts] Error:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const totalAlerts = zeroStock.length + lowStock.length + contractAlerts.length;
  if (!loaded || totalAlerts === 0) return null;

  return (
    <div className="border-b border-border shrink-0 animate-fade-in">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors"
      >
        <Package className={cn(
          "h-3.5 w-3.5 shrink-0",
          zeroStock.length > 0 ? "text-destructive" : "text-amber-500"
        )} />
        <span className="text-[11px] font-semibold text-foreground flex-1 text-left">
          Alertas de Estoque
        </span>
        <div className="flex items-center gap-1">
          {zeroStock.length > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/30 text-destructive">
              {zeroStock.length} zerado{zeroStock.length > 1 ? "s" : ""}
            </Badge>
          )}
          {lowStock.length > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/30 text-amber-600">
              {lowStock.length} baixo{lowStock.length > 1 ? "s" : ""}
            </Badge>
          )}
          {contractAlerts.length > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/30 text-primary">
              {contractAlerts.length} compra{contractAlerts.length > 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); fetchAlerts(true); }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3 text-muted-foreground", loading && "animate-spin")} />
          </Button>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-2 animate-fade-in">
          {/* Zero stock */}
          {zeroStock.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-destructive">
                <PackageX className="h-3 w-3" />
                Estoque Zerado ({zeroStock.length})
              </div>
              {zeroStock.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] bg-destructive/5 text-destructive">
                  <PackageX className="h-3 w-3 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{p.name}</span>
                    <span className="opacity-60 ml-1">({p.internal_code})</span>
                  </span>
                  <Badge variant="destructive" className="text-[9px] h-4 px-1">0 un</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Low stock */}
          {lowStock.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Estoque Baixo ({lowStock.length})
              </div>
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] bg-amber-500/5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{p.name}</span>
                    <span className="opacity-60 ml-1">({p.internal_code})</span>
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/30">
                    {p.stock_quantity}/{p.stock_min_quantity ?? 5}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Contracts needing purchase */}
          {contractAlerts.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary">
                <ShoppingCart className="h-3 w-3" />
                Vendas com Produto sem Estoque ({contractAlerts.length})
              </div>
              {contractAlerts.map((ca) => (
                <div key={ca.contract_id} className="rounded-md px-2 py-1.5 text-[11px] bg-primary/5 border border-primary/10 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{ca.client_name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground pl-4 space-y-0.5">
                    <div>📅 {format(new Date(ca.contract_date), "dd/MM/yyyy")} · 👤 {ca.seller_name}</div>
                    <div>
                      {ca.products.map((p, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          <span className="text-destructive font-medium">{p.name}</span>
                          <span className="opacity-60"> ×{p.quantity}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
