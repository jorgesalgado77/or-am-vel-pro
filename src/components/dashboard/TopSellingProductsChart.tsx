/**
 * Top Selling Products Chart — ranking by category for Dashboard
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, TrendingUp, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";

const COLORS = [
  "hsl(200, 70%, 50%)", "hsl(160, 60%, 45%)", "hsl(30, 80%, 55%)",
  "hsl(340, 65%, 50%)", "hsl(260, 60%, 55%)", "hsl(80, 55%, 45%)",
  "hsl(10, 70%, 50%)", "hsl(190, 65%, 48%)",
];

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

interface SaleRow {
  product_id: string;
  quantity: number;
  total_price: number;
  product_name?: string;
  category?: string;
}

export function TopSellingProductsChart() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"product" | "category">("category");
  const [salesData, setSalesData] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; qty: number; revenue: number }[]>([]);

  const loadData = useCallback(async () => {
    const tenantId = getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    setLoading(true);
    // Load product_sales joined with products
    const { data: sales } = await supabase
      .from("product_sales" as any)
      .select("product_id, quantity, total_price")
      .eq("tenant_id", tenantId);

    if (!sales || sales.length === 0) {
      setSalesData([]);
      setCategoryData([]);
      setLoading(false);
      return;
    }

    // Load products for names/categories
    const productIds = [...new Set((sales as SaleRow[]).map(s => s.product_id))];
    const { data: products } = await supabase
      .from("products" as any)
      .select("id, name, category")
      .in("id", productIds);

    const productMap = new Map((products || []).map((p: any) => [p.id, p]));

    // Aggregate by product
    const byProduct = new Map<string, { name: string; qty: number; revenue: number; category: string }>();
    for (const s of sales as SaleRow[]) {
      const prod = productMap.get(s.product_id);
      const key = s.product_id;
      const existing = byProduct.get(key) || { name: prod?.name || "Desconhecido", qty: 0, revenue: 0, category: prod?.category || "geral" };
      existing.qty += s.quantity;
      existing.revenue += Number(s.total_price);
      byProduct.set(key, existing);
    }

    const sorted = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    setSalesData(sorted);

    // Aggregate by category
    const byCat = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const item of byProduct.values()) {
      const cat = item.category || "geral";
      const existing = byCat.get(cat) || { name: cat, qty: 0, revenue: 0 };
      existing.qty += item.qty;
      existing.revenue += item.revenue;
      byCat.set(cat, existing);
    }
    setCategoryData([...byCat.values()].sort((a, b) => b.revenue - a.revenue));

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const chartData = view === "category" ? categoryData : salesData;
  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Produtos Mais Vendidos
          </CardTitle>
          <Select value={view} onValueChange={(v) => setView(v as any)}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">Por Categoria</SelectItem>
              <SelectItem value="product">Por Produto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhuma venda registrada ainda. Registre vendas pelo catálogo para ver o ranking.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Faturamento
              </p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tickFormatter={(v) => currencyFmt(v)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip formatter={(v: number) => currencyFmt(v)} labelStyle={{ fontWeight: 600 }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Faturamento" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Pie chart */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Distribuição por quantidade</p>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="qty"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} un.`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Top list */}
            <div className="lg:col-span-2">
              <div className="flex flex-wrap gap-2">
                {chartData.slice(0, 5).map((item, i) => (
                  <Badge key={i} variant="outline" className="text-xs gap-1 px-3 py-1">
                    #{i + 1} {item.name} — {item.qty} un. — {currencyFmt(item.revenue)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
