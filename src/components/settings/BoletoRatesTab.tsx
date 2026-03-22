/**
 * Boleto financing rates tab - extracted from SettingsPanel.tsx
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, FileSpreadsheet, Download, Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useFinancingRates, type FinancingRate } from "@/hooks/useFinancingRates";
import { useTenant } from "@/contexts/TenantContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";

export function BoletoRatesTab() {
  const { rates, providers, isProviderActive, toggleProviderActive, refresh } = useFinancingRates("boleto");
  const { tenantId } = useTenant();
  const { settings, refresh: refreshSettings } = useCompanySettings();
  const [newProviderName, setNewProviderName] = useState("");
  const [editingRates, setEditingRates] = useState<Record<string, Partial<FinancingRate>>>({});

  // Default settings for simulator
  const defaults = (settings as any)?.boleto_defaults as { provider?: string; parcelas?: number; carencia?: number } | null;
  const [defaultProvider, setDefaultProvider] = useState(defaults?.provider || "");
  const [defaultParcelas, setDefaultParcelas] = useState(defaults?.parcelas || 0);
  const [defaultCarencia, setDefaultCarencia] = useState(defaults?.carencia || 30);

  useEffect(() => {
    const d = (settings as any)?.boleto_defaults as any;
    if (d) {
      setDefaultProvider(d.provider || "");
      setDefaultParcelas(d.parcelas || 0);
      setDefaultCarencia(d.carencia || 30);
    }
  }, [settings]);

  const handleSaveDefaults = async () => {
    if (!settings?.id) return;
    const { error } = await supabase.from("company_settings").update({
      boleto_defaults: { provider: defaultProvider, parcelas: defaultParcelas, carencia: defaultCarencia },
    } as any).eq("id", settings.id);
    if (error) toast.error("Erro ao salvar padrão");
    else { toast.success("Padrão do simulador salvo!"); refreshSettings(); }
  };

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) return;
    const inserts = Array.from({ length: 24 }, (_, i) => ({
      provider_name: newProviderName.trim(), provider_type: "boleto" as const,
      installments: i + 1, coefficient: 0, taxa_fixa: 0, coeficiente_60: 0, coeficiente_90: 0, tenant_id: tenantId,
    }));
    const { error } = await supabase.from("financing_rates").insert(inserts);
    if (error) toast.error("Erro ao adicionar");
    else { toast.success("Adicionado!"); setNewProviderName(""); refresh(); }
  };

  const handleDeleteProvider = async (providerName: string) => {
    if (!confirm(`Excluir ${providerName}?`)) return;
    const { error } = await supabase.from("financing_rates").delete().eq("provider_name", providerName).eq("provider_type", "boleto");
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const handleFieldChange = (rateId: string, field: string, value: number) => {
    setEditingRates((prev) => ({ ...prev, [rateId]: { ...prev[rateId], [field]: value } }));
  };

  const handleSaveRates = async (providerName: string) => {
    const providerRates = rates.filter((r) => r.provider_name === providerName);
    const updates = providerRates.filter((r) => editingRates[r.id]).map((r) => supabase.from("financing_rates").update(editingRates[r.id] as any).eq("id", r.id));
    if (updates.length === 0) return;
    await Promise.all(updates);
    toast.success(`Taxas de ${providerName} salvas!`);
    setEditingRates({});
    refresh();
  };

  const handleExportExcel = async (providerName: string) => {
    const XLSX = await import("xlsx");
    const providerRates = rates.filter((r) => r.provider_name === providerName).sort((a, b) => a.installments - b.installments);
    const data = [[providerName, "", "", "", ""], ["Parcelas", "Taxa Fixa", "Coef. 30 dias", "Coef. 60 dias", "Coef. 90 dias"]];
    providerRates.forEach((r) => data.push([String(r.installments), String(r.taxa_fixa), String(r.coefficient), String(r.coeficiente_60), String(r.coeficiente_90)]));
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Taxas");
    XLSX.writeFile(wb, `${providerName}_boleto.xlsx`);
    toast.success(`Planilha exportada: ${providerName}`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length < 2) { toast.error("Planilha vazia ou sem dados"); return; }
        const headerRow = rows[0] as any[];
        let providerName = "";
        if (headerRow[0] && typeof headerRow[0] === "string" && isNaN(Number(headerRow[0]))) {
          providerName = headerRow[0].trim();
        } else {
          providerName = file.name.replace(/\.(xlsx?|csv)$/i, "").trim();
        }
        const parsedRates: { installments: number; taxa_fixa: number; coefficient: number; coeficiente_60: number; coeficiente_90: number }[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.length < 2) continue;
          const col0 = Number(row[0]);
          if (isNaN(col0) || col0 < 1 || col0 > 120) continue;
          parsedRates.push({ installments: Math.round(col0), taxa_fixa: Number(row[1]) || 0, coefficient: Number(row[2]) || 0, coeficiente_60: Number(row[3]) || 0, coeficiente_90: Number(row[4]) || 0 });
        }
        if (parsedRates.length === 0) { toast.error("Nenhum dado válido encontrado"); return; }
        await supabase.from("financing_rates").delete().eq("provider_name", providerName).eq("provider_type", "boleto");
        const inserts = parsedRates.map((r) => ({ ...r, provider_name: providerName, provider_type: "boleto" as const, tenant_id: tenantId }));
        const { error } = await supabase.from("financing_rates").insert(inserts);
        if (error) { toast.error("Erro ao importar: " + (error.message || "verifique permissões RLS")); }
        else { toast.success(`Importado "${providerName}" com ${parsedRates.length} parcelas!`); refresh(); }
      } catch (err: any) { toast.error("Erro ao ler planilha: " + (err?.message || "")); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Financeiras de Boleto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1"><Label>Nome da Financeira</Label><Input value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Ex: BV Financeira" className="mt-1" /></div>
            <Button onClick={handleAddProvider} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
          <Separator />
          <div>
            <Label>Importar Planilha Excel</Label>
            <p className="text-xs text-muted-foreground mb-2">Primeira célula: nome da financeira. Colunas: Parcelas | Taxa Fixa | Coef. 30 dias | Coef. 60 dias | Coef. 90 dias</p>
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
              <Button variant="outline" size="sm" className="gap-2" asChild><span><FileSpreadsheet className="h-4 w-4" />Importar Excel</span></Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Padrão para o Simulador */}
      {providers.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Padrão do Simulador</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Configure os valores padrão que aparecerão pré-preenchidos na tela de simulação. O usuário poderá alterar livremente.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Financeira Padrão</Label>
                <Select value={defaultProvider} onValueChange={setDefaultProvider}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Parcelas Padrão</Label>
                <Select value={String(defaultParcelas)} onValueChange={(v) => setDefaultParcelas(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Carência Padrão</Label>
                <Select value={String(defaultCarencia)} onValueChange={(v) => setDefaultCarencia(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSaveDefaults} className="mt-4 gap-2"><Save className="h-4 w-4" />Salvar Padrão</Button>
          </CardContent>
        </Card>
      )}

      {providers.map((provider) => {
        const providerRates = rates.filter((r) => r.provider_name === provider).sort((a, b) => a.installments - b.installments);
        return (
          <Card key={provider}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{provider}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={isProviderActive(provider)} onCheckedChange={() => { toggleProviderActive(provider).then((err) => { if (err) toast.error("Erro ao alterar status"); else toast.success(isProviderActive(provider) ? "Desativada" : "Ativada"); }); }} />
                    <span className={`text-xs font-medium ${isProviderActive(provider) ? "text-primary" : "text-muted-foreground"}`}>{isProviderActive(provider) ? "Ativa" : "Inativa"}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleExportExcel(provider)} className="gap-1"><Download className="h-3 w-3" />Exportar</Button>
                  <Button size="sm" onClick={() => handleSaveRates(provider)} className="gap-1"><Save className="h-3 w-3" />Salvar</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteProvider(provider)} className="gap-1"><Trash2 className="h-3 w-3" />Excluir</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead className="w-20">Parcelas</TableHead>
                      <TableHead>Taxa Fixa</TableHead>
                      <TableHead>Coef. 30 dias</TableHead>
                      <TableHead>Coef. 60 dias</TableHead>
                      <TableHead>Coef. 90 dias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerRates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.installments}x</TableCell>
                        <TableCell><Input type="number" step="0.01" min={0} className="max-w-[140px] h-8" defaultValue={Number(rate.taxa_fixa)} onChange={(e) => handleFieldChange(rate.id, "taxa_fixa", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" step="0.000001" min={0} className="max-w-[140px] h-8" defaultValue={Number(rate.coefficient)} onChange={(e) => handleFieldChange(rate.id, "coefficient", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" step="0.000001" min={0} className="max-w-[140px] h-8" defaultValue={Number(rate.coeficiente_60)} onChange={(e) => handleFieldChange(rate.id, "coeficiente_60", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" step="0.000001" min={0} className="max-w-[140px] h-8" defaultValue={Number(rate.coeficiente_90)} onChange={(e) => handleFieldChange(rate.id, "coeficiente_90", Number(e.target.value))} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
