import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Upload, Building2, CreditCard, FileText, Users, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import type { FinancingRate } from "@/hooks/useFinancingRates";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { CargosTab } from "@/components/settings/CargosTab";
import { UsuariosTab } from "@/components/settings/UsuariosTab";

export function SettingsPanel() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company" className="gap-2"><Building2 className="h-4 w-4" />Empresa</TabsTrigger>
          <TabsTrigger value="cargos" className="gap-2"><Shield className="h-4 w-4" />Cargos</TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" />Usuários</TabsTrigger>
          <TabsTrigger value="boleto" className="gap-2"><FileText className="h-4 w-4" />Financeiras (Boleto)</TabsTrigger>
          <TabsTrigger value="credito" className="gap-2"><CreditCard className="h-4 w-4" />Operadoras (Crédito)</TabsTrigger>
        </TabsList>
        <TabsContent value="company"><CompanySettingsTab /></TabsContent>
        <TabsContent value="cargos"><CargosTab /></TabsContent>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="boleto"><RatesTab type="boleto" title="Financeiras de Boleto" maxInstallments={24} /></TabsContent>
        <TabsContent value="credito"><RatesTab type="credito" title="Operadoras de Crédito" maxInstallments={12} /></TabsContent>
      </Tabs>
    </div>
  );
}

function CompanySettingsTab() {
  const { settings, refresh } = useCompanySettings();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [managerPassword, setManagerPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(settings.company_name);
    setSubtitle(settings.company_subtitle || "");
    setValidityDays(settings.budget_validity_days);
    setManagerPassword(settings.manager_password || "");
    setConfirmPassword(settings.manager_password || "");
  }, [settings]);

  const handleSave = async () => {
    if (managerPassword && managerPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("company_settings").update({
      company_name: name,
      company_subtitle: subtitle,
      budget_validity_days: validityDays,
      manager_password: managerPassword,
    }).eq("id", settings.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Configurações salvas!"); refresh(); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logo.${ext}`;
    const { error: upErr } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    if (upErr) { toast.error("Erro ao enviar logo"); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("company-assets").getPublicUrl(path);
    await supabase.from("company_settings").update({ logo_url: publicUrl }).eq("id", settings.id);
    toast.success("Logo atualizado!");
    setUploading(false);
    refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Dados da Empresa</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome da Empresa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Subtítulo</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label>Validade do Orçamento (dias)</Label>
          <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} min={1} className="mt-1 max-w-[200px]" />
        </div>
        <div>
          <Label>Senha do Gerente</Label>
          <p className="text-xs text-muted-foreground mb-1">Necessária para liberar Desconto 3 e Plus na simulação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 max-w-[600px]">
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} placeholder="Definir senha" className="pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmar senha" className="pr-10" />
              {managerPassword && confirmPassword && managerPassword !== confirmPassword && (
                <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
              )}
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <Label>Logo da Empresa</Label>
          <div className="flex items-center gap-4 mt-2">
            {settings.logo_url && (
              <img src={settings.logo_url} alt="Logo" className="h-12 w-auto object-contain rounded border border-border p-1" />
            )}
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <span><Upload className="h-4 w-4" />{uploading ? "Enviando..." : "Enviar Logo"}</span>
              </Button>
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RatesTab({ type, title, maxInstallments }: { type: "boleto" | "credito"; title: string; maxInstallments: number }) {
  const { rates, providers, refresh } = useFinancingRates(type);
  const [newProviderName, setNewProviderName] = useState("");
  const [editingRates, setEditingRates] = useState<Record<string, number>>({});

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) return;
    const inserts = Array.from({ length: maxInstallments }, (_, i) => ({
      provider_name: newProviderName.trim(),
      provider_type: type,
      installments: i + 1,
      coefficient: 0,
    }));
    const { error } = await supabase.from("financing_rates").insert(inserts);
    if (error) toast.error("Erro ao adicionar");
    else { toast.success("Adicionado!"); setNewProviderName(""); refresh(); }
  };

  const handleDeleteProvider = async (providerName: string) => {
    if (!confirm(`Excluir ${providerName}?`)) return;
    const { error } = await supabase.from("financing_rates").delete().eq("provider_name", providerName).eq("provider_type", type);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const handleCoefficientChange = (rateId: string, value: number) => {
    setEditingRates((prev) => ({ ...prev, [rateId]: value }));
  };

  const handleSaveRates = async (providerName: string) => {
    const providerRates = rates.filter((r) => r.provider_name === providerName);
    const updates = providerRates
      .filter((r) => editingRates[r.id] !== undefined)
      .map((r) => supabase.from("financing_rates").update({ coefficient: editingRates[r.id] }).eq("id", r.id));
    if (updates.length === 0) return;
    await Promise.all(updates);
    toast.success(`Taxas de ${providerName} salvas!`);
    setEditingRates({});
    refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <Label>Nome da {type === "boleto" ? "Financeira" : "Operadora"}</Label>
              <Input value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Ex: BV Financeira" className="mt-1" />
            </div>
            <Button onClick={handleAddProvider} className="gap-2">
              <Plus className="h-4 w-4" />Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {providers.map((provider) => {
        const providerRates = rates.filter((r) => r.provider_name === provider).sort((a, b) => a.installments - b.installments);
        return (
          <Card key={provider}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{provider}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSaveRates(provider)} className="gap-1">
                    <Save className="h-3 w-3" />Salvar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteProvider(provider)} className="gap-1">
                    <Trash2 className="h-3 w-3" />Excluir
                  </Button>
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
                          <Input
                            type="number"
                            step="0.0001"
                            min={0}
                            className="max-w-[200px] h-8"
                            defaultValue={Number(rate.coefficient)}
                            onChange={(e) => handleCoefficientChange(rate.id, Number(e.target.value))}
                          />
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
