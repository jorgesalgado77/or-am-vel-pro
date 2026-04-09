/**
 * ChatProductPicker — Popover to send product cards in chat
 * Includes promotion info with payment conditions and installments
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Search, Send, Tag } from "lucide-react";
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

interface PromoInfo {
  desconto_percentual: number;
  valor_promocional: number;
  validade: string;
  condicoes_pagamento: string[];
  credito_config: { providerName: string; selectedInstallments: number[] }[];
  boleto_config: { providerName: string; selectedInstallments: number[] }[];
}

interface FinRate {
  provider_name: string;
  provider_type: string;
  installments: number;
  coefficient: number;
}

interface Props {
  tenantId: string | null;
  onSendProduct: (text: string, imageUrl?: string) => void;
}

const COND_LABELS: Record<string, string> = {
  pix_avista: "💳 Pix à Vista",
  credito_avista: "💳 Crédito à Vista",
  boleto_avista: "📄 Boleto à Vista",
  boleto_prazo: "📄 Boleto à Prazo",
  credito_prazo_juros: "💳 Crédito à Prazo c/ Juros",
  credito_prazo_sem_juros: "💳 Crédito à Prazo s/ Juros",
};

export function ChatProductPicker({ tenantId, onSendProduct }: Props) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [promoMap, setPromoMap] = useState<Record<string, PromoInfo>>({});
  const [ratesCache, setRatesCache] = useState<FinRate[]>([]);

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

      // Load images, promotions, and rates in parallel
      const [imagesRes, promosRes, ratesRes] = await Promise.all([
        ids.length > 0
          ? supabase.from("product_images" as any).select("product_id, image_url").in("product_id", ids)
          : Promise.resolve({ data: [] }),
        ids.length > 0
          ? supabase.from("product_promotions" as any)
              .select("product_id, desconto_percentual, valor_promocional, validade, condicoes_pagamento, credito_config, boleto_config")
              .eq("tenant_id", tenantId)
              .eq("ativo", true)
              .gt("validade", new Date().toISOString())
              .in("product_id", ids)
          : Promise.resolve({ data: [] }),
        ratesCache.length === 0
          ? supabase.from("financing_rates" as any).select("provider_name, provider_type, installments, coefficient").eq("tenant_id", tenantId)
          : Promise.resolve({ data: ratesCache }),
      ]);

      const imageMap = new Map<string, string>();
      ((imagesRes.data || []) as any[]).forEach(img => {
        if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.image_url);
      });

      const pMap: Record<string, PromoInfo> = {};
      ((promosRes.data || []) as any[]).forEach(p => {
        if (!pMap[p.product_id]) pMap[p.product_id] = p;
      });
      setPromoMap(pMap);

      if (ratesCache.length === 0 && ratesRes.data) {
        setRatesCache(ratesRes.data as FinRate[]);
      }

      setProducts((data as any[]).map(p => ({ ...p, image_url: imageMap.get(p.id) })));
    }
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => {
    if (open) loadProducts();
  }, [open, loadProducts]);

  const buildPromoText = (p: CatalogProduct, promo: PromoInfo): string => {
    const valorPromo = Number(promo.valor_promocional);
    const validadeDate = new Date(promo.validade).toLocaleDateString("pt-BR");
    const rates = ratesCache;

    const lines: string[] = [
      `🔥 *PROMOÇÃO — ${p.name}* 🔥`,
      "",
      p.description ? p.description.slice(0, 80) : "",
      "",
      `~~${formatCurrency(p.sale_price)}~~ ➜ *${formatCurrency(valorPromo)}*`,
      `📉 Desconto de *${promo.desconto_percentual}%* — Economia de ${formatCurrency(p.sale_price - valorPromo)}`,
      `⏰ Válido até *${validadeDate}*`,
    ].filter(l => l !== undefined);

    // Payment conditions
    if (promo.condicoes_pagamento.length > 0) {
      lines.push("");
      lines.push("*Condições de Pagamento:*");
      promo.condicoes_pagamento.forEach(c => {
        lines.push(`  ✅ ${COND_LABELS[c] || c}`);
      });
    }

    // Credit installments
    if (promo.credito_config?.length > 0) {
      const withInterest = promo.condicoes_pagamento.includes("credito_prazo_juros");
      promo.credito_config.forEach(cfg => {
        lines.push("");
        lines.push(`💳 *${cfg.providerName}:*`);
        const installmentTexts = cfg.selectedInstallments.sort((a, b) => a - b).map(inst => {
          const rate = rates.find(r => r.provider_name === cfg.providerName && r.provider_type === "credito" && r.installments === inst);
          const parcela = withInterest && rate?.coefficient
            ? valorPromo * rate.coefficient
            : valorPromo / inst;
          return `  ${inst}x de ${formatCurrency(parcela)}`;
        });
        lines.push(...installmentTexts);
      });
    }

    // Boleto installments
    if (promo.boleto_config?.length > 0) {
      promo.boleto_config.forEach(cfg => {
        lines.push("");
        lines.push(`📄 *${cfg.providerName}:*`);
        const installmentTexts = cfg.selectedInstallments.sort((a, b) => a - b).map(inst => {
          const rate = rates.find(r => r.provider_name === cfg.providerName && r.provider_type === "boleto" && r.installments === inst);
          const parcela = rate?.coefficient
            ? valorPromo * rate.coefficient
            : valorPromo / inst;
          return `  ${inst}x de ${formatCurrency(parcela)}`;
        });
        lines.push(...installmentTexts);
      });
    }

    lines.push("");
    lines.push(`🔖 Cód: ${p.internal_code}`);

    return lines.join("\n");
  };

  const sendProduct = (p: CatalogProduct) => {
    const promo = promoMap[p.id];

    if (promo) {
      const text = buildPromoText(p, promo);
      onSendProduct(text, p.image_url);
      setOpen(false);
      toast.success("Produto promocional enviado no chat");
      return;
    }

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
              {products.map(p => {
                const promo = promoMap[p.id];
                return (
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
                      {promo && (
                        <Badge className="bg-red-600 text-white text-[8px] px-1 py-0 h-3.5 mt-0.5 gap-0.5">
                          <Tag className="h-2 w-2" />
                          -{promo.desconto_percentual}%
                        </Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {promo ? (
                        <>
                          <p className="text-[10px] line-through text-muted-foreground">{formatCurrency(p.sale_price)}</p>
                          <p className="text-xs font-bold text-red-600 dark:text-red-400">{formatCurrency(Number(promo.valor_promocional))}</p>
                        </>
                      ) : (
                        <p className="text-xs font-bold text-primary">{formatCurrency(p.sale_price)}</p>
                      )}
                      <Send className="h-3 w-3 text-muted-foreground ml-auto mt-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
