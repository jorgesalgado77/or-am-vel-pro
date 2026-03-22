/**
 * Credit card rates tab - extracted from SettingsPanel.tsx
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, FileSpreadsheet, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { useTenant } from "@/contexts/TenantContext";
import * as XLSX from "xlsx";

export function CreditoRatesTab() {
  const { rates, providers, isProviderActive, toggleProviderActive, refresh } = useFinancingRates("credito");
  const { tenantId } = useTenant();
  const [newProviderName, setNewProviderName] = useState("");
  const [editingRates, setEditingRates] = useState<Record<string, number>>({});

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) return;
    const inserts = Array.from({ length: 12 }, (_, i) => ({
      provider_name: newProviderName.trim(), provider_type: "credito" as const,
      installments: i + 1, coefficient: 0, tenant_id: tenantId,
    }));
    const { error } = await supabase.from("financing_rates").insert(inserts);
    if (error) toast.error("Erro ao adicionar");
    else { toast.success("Adicionado!"); setNewProviderName(""); refresh(); }
  };

  const handleDeleteProvider = async (providerName: string) => {
    if (!confirm(`Excluir ${providerName}?`)) return;
    const { error } = await supabase.from("financing_rates").delete().eq("provider_name", providerName).eq("provider_type", "credito");
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const handleSaveRates = async (providerName: string) => {
    const providerRates = rates.filter((r) => r.provider_name === providerName);
    const updates = providerRates.filter((r) => editingRates[r.id] !== undefined).map((r) => supabase.from("financing_rates").update({ coefficient: editingRates[r.id] }).eq("id", r.id));
    if (updates.length === 0) return;
    await Promise.all(updates);
    toast.success(`Taxas de ${providerName} salvas!`);
    setEditingRates({});
    refresh();
  };

  const handleExportExcel = (providerName: string) => {
    const providerRates = rates.filter((r) => r.provider_name === providerName).sort((a, b) => a.installments - b.installments);
    const data = [[providerName, ""], ["Parcelas", "Coeficiente / Taxa"]];
    providerRates.forEach((r) => data.push([String(r.installments), String(r.coefficient)]));
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Taxas");
    XLSX.writeFile(wb, `${providerName}_credito.xlsx`);
    toast.success(`Planilha exportada: ${providerName}`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length < 2) { toast.error("Planilha vazia"); return; }
        const headerRow = rows[0] as any[];
        let providerName = "";
        if (headerRow[0] && typeof headerRow[0] === "string" && isNaN(Number(headerRow[0]))) {
          providerName = headerRow[0].trim();
        } else {
          providerName = file.name.replace(/\.(xlsx?|csv)$/i, "").trim();
        }
        const parsedRates: { installments: number; coefficient: number }[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.length < 2) continue;
          const col0 = Number(row[0]);
          const col1 = Number(row[1]);
          if (!isNaN(col0) && col0 >= 1 && col0 <= 120 && !isNaN(col1)) {
            parsedRates.push({ installments: Math.round(col0), coefficient: col1 });
          }
        }
        if (parsedRates.length === 0) { toast.error("Nenhum dado válido"); return; }
        await supabase.from("financing_rates").delete().eq("provider_name", providerName).eq("provider_type", "credito");
        const inserts = parsedRates.map((r) => ({ ...r, provider_name: providerName, provider_type: "credito" as const, tenant_id: tenantId }));
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
        <CardHeader><CardTitle className="text-base">Operadoras de Crédito</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1"><Label>Nome da Operadora</Label><Input value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Ex: Stone" className="mt-1" /></div>
            <Button onClick={handleAddProvider} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
          <Separator />
          <div>
            <Label>Importar Planilha Excel</Label>
            <p className="text-xs text-muted-foreground mb-2">Primeira célula: nome da operadora. Colunas: Parcelas | Coeficiente/Taxa</p>
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
              <Button variant="outline" size="sm" className="gap-2" asChild><span><FileSpreadsheet className="h-4 w-4" />Importar Excel</span></Button>
            </label>
          </div>
        </CardContent>
      </Card>

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
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead className="w-24">Parcelas</TableHead>
                      <TableHead>Coeficiente / Taxa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerRates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.installments}x</TableCell>
                        <TableCell>
                          <Input type="number" step="0.0001" min={0} className="max-w-[200px] h-8" defaultValue={Number(rate.coefficient)}
                            onChange={(e) => setEditingRates((prev) => ({ ...prev, [rate.id]: Number(e.target.value) }))} />
                        </TableCell>
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
