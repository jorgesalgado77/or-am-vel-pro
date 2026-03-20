import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Upload, Building2, CreditCard, FileText, Users, Shield, FileSpreadsheet, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import type { FinancingRate } from "@/hooks/useFinancingRates";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { CargosTab } from "@/components/settings/CargosTab";
import { UsuariosTab } from "@/components/settings/UsuariosTab";
import { DescontosTab } from "@/components/settings/DescontosTab";
import { IndicadoresTab } from "@/components/settings/IndicadoresTab";
import { ContratosTab } from "@/components/settings/ContratosTab";
import { WhatsAppTab } from "@/components/settings/WhatsAppTab";
import { ResendTab } from "@/components/settings/ResendTab";
import { AcompanhamentoTab } from "@/components/settings/AcompanhamentoTab";
import { AuditLogsTab } from "@/components/settings/AuditLogsTab";
import { UserCheck, FileSignature, MessageSquare, ClipboardList, ScrollText, Mail } from "lucide-react";
import { isNotificationSoundEnabled, setNotificationSoundEnabled, getNotificationVolume, setNotificationVolume, playNotificationSound } from "@/lib/notificationSound";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import * as XLSX from "xlsx";

export function SettingsPanel() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company" className="gap-2"><Building2 className="h-4 w-4" />Empresa</TabsTrigger>
          <TabsTrigger value="cargos" className="gap-2"><Shield className="h-4 w-4" />Cargos</TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" />Usuários</TabsTrigger>
          <TabsTrigger value="descontos" className="gap-2"><FileText className="h-4 w-4" />Descontos</TabsTrigger>
          <TabsTrigger value="indicadores" className="gap-2"><UserCheck className="h-4 w-4" />Indicadores</TabsTrigger>
          <TabsTrigger value="boleto" className="gap-2"><FileText className="h-4 w-4" />Financeiras (Boleto)</TabsTrigger>
          <TabsTrigger value="credito" className="gap-2"><CreditCard className="h-4 w-4" />Operadoras (Crédito)</TabsTrigger>
          <TabsTrigger value="contratos" className="gap-2"><FileSignature className="h-4 w-4" />Contratos</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2"><MessageSquare className="h-4 w-4" />WhatsApp</TabsTrigger>
          <TabsTrigger value="resend" className="gap-2"><Mail className="h-4 w-4" />Resend</TabsTrigger>
          <TabsTrigger value="acompanhamento" className="gap-2"><ClipboardList className="h-4 w-4" />Acompanhamento</TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2"><ScrollText className="h-4 w-4" />Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="company"><CompanySettingsTab /></TabsContent>
        <TabsContent value="cargos"><CargosTab /></TabsContent>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="descontos"><DescontosTab /></TabsContent>
        <TabsContent value="indicadores"><IndicadoresTab /></TabsContent>
        <TabsContent value="boleto"><BoletoRatesTab /></TabsContent>
        <TabsContent value="credito"><CreditoRatesTab /></TabsContent>
        <TabsContent value="contratos"><ContratosTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="resend"><ResendTab /></TabsContent>
        <TabsContent value="acompanhamento"><AcompanhamentoTab /></TabsContent>
        <TabsContent value="auditoria"><AuditLogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CompanySettingsTab() {
  const { settings, refresh } = useCompanySettings();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [codigoLoja, setCodigoLoja] = useState("");
  const [cnpjLoja, setCnpjLoja] = useState("");
  const [enderecoLoja, setEnderecoLoja] = useState("");
  const [bairroLoja, setBairroLoja] = useState("");
  const [cidadeLoja, setCidadeLoja] = useState("");
  const [ufLoja, setUfLoja] = useState("");
  const [cepLoja, setCepLoja] = useState("");
  const [telefoneLoja, setTelefoneLoja] = useState("");
  const [emailLoja, setEmailLoja] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [managerPassword, setManagerPassword] = useState("");
  const [confirmManagerPassword, setConfirmManagerPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [showManagerPw, setShowManagerPw] = useState(false);
  const [showAdminPw, setShowAdminPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [orcamentoInicial, setOrcamentoInicial] = useState(1);

  // Mask: 999.999.999.99
  const formatOrcamento = (value: number): string => {
    const str = String(value).replace(/\D/g, "").slice(0, 11);
    if (str.length <= 2) return str;
    if (str.length <= 5) return str.replace(/(\d+)(\d{2})$/, "$1.$2");
    if (str.length <= 8) return str.replace(/(\d+)(\d{3})(\d{2})$/, "$1.$2.$3");
    return str.replace(/(\d+)(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3.$4");
  };

  const handleOrcamentoChange = (masked: string) => {
    const raw = masked.replace(/\D/g, "").slice(0, 11);
    setOrcamentoInicial(Number(raw) || 0);
  };
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => {
    setName(settings.company_name);
    setSubtitle(settings.company_subtitle || "");
    setCodigoLoja(settings.codigo_loja || "");
    setCnpjLoja(settings.cnpj_loja || "");
    setEnderecoLoja(settings.endereco_loja || "");
    setBairroLoja(settings.bairro_loja || "");
    setCidadeLoja(settings.cidade_loja || "");
    setUfLoja(settings.uf_loja || "");
    setCepLoja(settings.cep_loja || "");
    setTelefoneLoja(settings.telefone_loja || "");
    setEmailLoja(settings.email_loja || "");
    setValidityDays(settings.budget_validity_days);
    setManagerPassword(settings.manager_password || "");
    setConfirmManagerPassword(settings.manager_password || "");
    setAdminPassword(settings.admin_password || "");
    setConfirmAdminPassword(settings.admin_password || "");
    setOrcamentoInicial(settings.orcamento_numero_inicial || 1);
  }, [settings]);

  const buscarCepLoja = async () => {
    const cepClean = cepLoja.replace(/\D/g, "");
    if (cepClean.length !== 8) { toast.error("CEP inválido"); return; }
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setEnderecoLoja(data.logradouro || "");
      setBairroLoja(data.bairro || "");
      setCidadeLoja(data.localidade || "");
      setUfLoja(data.uf || "");
      toast.success("Endereço preenchido!");
    } catch { toast.error("Erro ao buscar CEP"); }
    finally { setBuscandoCep(false); }
  };

  const handleSave = async () => {
    if (managerPassword && managerPassword !== confirmManagerPassword) {
      toast.error("Senhas do gerente não coincidem"); return;
    }
    if (adminPassword && adminPassword !== confirmAdminPassword) {
      toast.error("Senhas do administrador não coincidem"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("company_settings").update({
      company_name: name,
      company_subtitle: subtitle,
      codigo_loja: codigoLoja.trim() || null,
      cnpj_loja: cnpjLoja.trim() || null,
      endereco_loja: enderecoLoja.trim() || null,
      bairro_loja: bairroLoja.trim() || null,
      cidade_loja: cidadeLoja.trim() || null,
      uf_loja: ufLoja.trim() || null,
      cep_loja: cepLoja.trim() || null,
      telefone_loja: telefoneLoja.trim() || null,
      email_loja: emailLoja.trim() || null,
      budget_validity_days: validityDays,
      manager_password: managerPassword,
      admin_password: adminPassword,
      orcamento_numero_inicial: orcamentoInicial,
    } as any).eq("id", settings.id);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Nome da Empresa</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
          <div><Label>Subtítulo</Label><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1" /></div>
          <div><Label>Código da Loja</Label><Input value={codigoLoja} onChange={(e) => setCodigoLoja(e.target.value)} placeholder="Ex: 001" className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>CNPJ da Loja</Label><Input value={cnpjLoja} onChange={(e) => setCnpjLoja(e.target.value)} placeholder="00.000.000/0000-00" className="mt-1" /></div>
          <div className="md:col-span-2"><Label>Endereço da Loja</Label><Input value={enderecoLoja} onChange={(e) => setEnderecoLoja(e.target.value)} placeholder="Rua, número" className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Bairro</Label><Input value={bairroLoja} onChange={(e) => setBairroLoja(e.target.value)} className="mt-1" /></div>
          <div><Label>Cidade</Label><Input value={cidadeLoja} onChange={(e) => setCidadeLoja(e.target.value)} className="mt-1" /></div>
          <div><Label>UF</Label><Input value={ufLoja} onChange={(e) => setUfLoja(e.target.value)} placeholder="SP" maxLength={2} className="mt-1" /></div>
          <div>
            <Label>CEP</Label>
            <div className="flex gap-1 mt-1">
              <Input value={cepLoja} onChange={(e) => setCepLoja(e.target.value)} placeholder="00000-000" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={buscarCepLoja} disabled={buscandoCep} title="Buscar CEP">
                {buscandoCep ? <span className="animate-spin text-xs">⏳</span> : <span className="text-xs">🔍</span>}
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Telefone da Loja</Label><Input value={telefoneLoja} onChange={(e) => setTelefoneLoja(e.target.value)} placeholder="(00) 00000-0000" className="mt-1" /></div>
          <div><Label>Email da Loja</Label><Input type="email" value={emailLoja} onChange={(e) => setEmailLoja(e.target.value)} placeholder="contato@loja.com" className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Validade do Orçamento (dias)</Label>
            <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} min={1} className="mt-1" />
          </div>
          <div>
            <Label>Número Inicial do Orçamento</Label>
            <p className="text-xs text-muted-foreground mb-1">Sequência começa a partir deste número (formato: 999.999.999.99)</p>
            <Input
              type="text"
              inputMode="numeric"
              value={formatOrcamento(orcamentoInicial)}
              onChange={(e) => handleOrcamentoChange(e.target.value)}
              placeholder="000.000.000.00"
              className="mt-1"
            />
          </div>
        </div>
        <Separator />
        <div>
          <Label>Senha do Gerente</Label>
          <p className="text-xs text-muted-foreground mb-1">Libera o campo Desconto 3 na simulação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 max-w-[600px]">
            <div className="relative">
              <Input type={showManagerPw ? "text" : "password"} value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} placeholder="Definir senha" className="pr-10" />
              <button type="button" onClick={() => setShowManagerPw(!showManagerPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showManagerPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div>
              <Input type={showManagerPw ? "text" : "password"} value={confirmManagerPassword} onChange={(e) => setConfirmManagerPassword(e.target.value)} placeholder="Confirmar senha" />
              {managerPassword && confirmManagerPassword && managerPassword !== confirmManagerPassword && (
                <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
              )}
            </div>
          </div>
        </div>
        <div>
          <Label>Senha do Administrador</Label>
          <p className="text-xs text-muted-foreground mb-1">Libera o campo Plus na simulação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 max-w-[600px]">
            <div className="relative">
              <Input type={showAdminPw ? "text" : "password"} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Definir senha" className="pr-10" />
              <button type="button" onClick={() => setShowAdminPw(!showAdminPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAdminPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div>
              <Input type={showAdminPw ? "text" : "password"} value={confirmAdminPassword} onChange={(e) => setConfirmAdminPassword(e.target.value)} placeholder="Confirmar senha" />
              {adminPassword && confirmAdminPassword && adminPassword !== confirmAdminPassword && (
                <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
              )}
            </div>
          </div>
        </div>
        <Separator />
        <NotificationSoundToggle />
        <Separator />
        <div>
          <Label>Logo da Empresa</Label>
          <div className="flex items-center gap-4 mt-2">
            {settings.logo_url && <img src={settings.logo_url} alt="Logo" className="h-12 w-auto object-contain rounded border border-border p-1" />}
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" className="gap-2" asChild><span><Upload className="h-4 w-4" />{uploading ? "Enviando..." : "Enviar Logo"}</span></Button>
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationSoundToggle() {
  const [enabled, setEnabled] = useState(isNotificationSoundEnabled());
  const [volume, setVolume] = useState(getNotificationVolume());

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    setNotificationSoundEnabled(val);
    toast.success(val ? "Som de notificação ativado" : "Som de notificação desativado");
  };

  const handleVolumeChange = (val: number[]) => {
    const v = val[0];
    setVolume(v);
    setNotificationVolume(v);
  };

  const handleTestSound = () => {
    playNotificationSound();
  };

  return (
    <div className="space-y-3 max-w-[600px]">
      <div className="flex items-center justify-between">
        <div>
          <Label>Som de Notificação</Label>
          <p className="text-xs text-muted-foreground">Toca um som ao receber novas mensagens em tempo real</p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
      {enabled && (
        <div className="flex items-center gap-3 pl-1">
          <span className="text-xs text-muted-foreground w-12">Volume</span>
          <Slider
            value={[volume]}
            onValueChange={handleVolumeChange}
            min={0.05}
            max={1}
            step={0.05}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(volume * 100)}%</span>
          <Button variant="outline" size="sm" onClick={handleTestSound} className="text-xs h-7 px-2">
            Testar
          </Button>
        </div>
      )}
    </div>
  );
}

/* ===== BOLETO RATES TAB (5 columns) ===== */
function BoletoRatesTab() {
  const { rates, providers, refresh } = useFinancingRates("boleto");
  const [newProviderName, setNewProviderName] = useState("");
  const [editingRates, setEditingRates] = useState<Record<string, Partial<FinancingRate>>>({});

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) return;
    const inserts = Array.from({ length: 24 }, (_, i) => ({
      provider_name: newProviderName.trim(),
      provider_type: "boleto" as const,
      installments: i + 1,
      coefficient: 0,
      taxa_fixa: 0,
      coeficiente_60: 0,
      coeficiente_90: 0,
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
    const updates = providerRates
      .filter((r) => editingRates[r.id])
      .map((r) => supabase.from("financing_rates").update(editingRates[r.id] as any).eq("id", r.id));
    if (updates.length === 0) return;
    await Promise.all(updates);
    toast.success(`Taxas de ${providerName} salvas!`);
    setEditingRates({});
    refresh();
  };

  const handleExportExcel = (providerName: string) => {
    const providerRates = rates.filter((r) => r.provider_name === providerName).sort((a, b) => a.installments - b.installments);
    const data = [[providerName, "", "", "", ""], ["Parcelas", "Taxa Fixa", "Coef. 30 dias", "Coef. 60 dias", "Coef. 90 dias"]];
    providerRates.forEach((r) => {
      data.push([String(r.installments), String(r.taxa_fixa), String(r.coefficient), String(r.coeficiente_60), String(r.coeficiente_90)]);
    });
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
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) { toast.error("Planilha vazia ou sem dados"); return; }

        // First cell = provider name
        const headerRow = rows[0] as any[];
        let providerName = "";
        if (headerRow[0] && typeof headerRow[0] === "string" && isNaN(Number(headerRow[0]))) {
          providerName = headerRow[0].trim();
        } else {
          providerName = file.name.replace(/\.(xlsx?|csv)$/i, "").trim();
        }

        // Parse data rows (skip header rows)
        const parsedRates: { installments: number; taxa_fixa: number; coefficient: number; coeficiente_60: number; coeficiente_90: number }[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.length < 2) continue;
          const col0 = Number(row[0]);
          if (isNaN(col0) || col0 < 1 || col0 > 120) continue;
          parsedRates.push({
            installments: Math.round(col0),
            taxa_fixa: Number(row[1]) || 0,
            coefficient: Number(row[2]) || 0,
            coeficiente_60: Number(row[3]) || 0,
            coeficiente_90: Number(row[4]) || 0,
          });
        }

        if (parsedRates.length === 0) { toast.error("Nenhum dado válido encontrado"); return; }

        await supabase.from("financing_rates").delete().eq("provider_name", providerName).eq("provider_type", "boleto");
        const inserts = parsedRates.map((r) => ({ ...r, provider_name: providerName, provider_type: "boleto" as const }));
        const { error } = await supabase.from("financing_rates").insert(inserts);
        if (error) toast.error("Erro ao importar");
        else { toast.success(`Importado "${providerName}" com ${parsedRates.length} parcelas!`); refresh(); }
      } catch { toast.error("Erro ao ler planilha"); }
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
            <div className="flex-1">
              <Label>Nome da Financeira</Label>
              <Input value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Ex: BV Financeira" className="mt-1" />
            </div>
            <Button onClick={handleAddProvider} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
          <Separator />
          <div>
            <Label>Importar Planilha Excel</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Primeira célula: nome da financeira. Colunas: Parcelas | Taxa Fixa | Coef. 30 dias | Coef. 60 dias | Coef. 90 dias
            </p>
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
                <CardTitle className="text-base">{provider}</CardTitle>
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
                        <TableCell>
                          <Input type="number" step="0.01" min={0} className="max-w-[140px] h-8"
                            defaultValue={Number(rate.taxa_fixa)}
                            onChange={(e) => handleFieldChange(rate.id, "taxa_fixa", Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.000001" min={0} className="max-w-[140px] h-8"
                            defaultValue={Number(rate.coefficient)}
                            onChange={(e) => handleFieldChange(rate.id, "coefficient", Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.000001" min={0} className="max-w-[140px] h-8"
                            defaultValue={Number(rate.coeficiente_60)}
                            onChange={(e) => handleFieldChange(rate.id, "coeficiente_60", Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.000001" min={0} className="max-w-[140px] h-8"
                            defaultValue={Number(rate.coeficiente_90)}
                            onChange={(e) => handleFieldChange(rate.id, "coeficiente_90", Number(e.target.value))} />
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

/* ===== CREDITO RATES TAB (simpler: parcelas + coeficiente) ===== */
function CreditoRatesTab() {
  const { rates, providers, refresh } = useFinancingRates("credito");
  const [newProviderName, setNewProviderName] = useState("");
  const [editingRates, setEditingRates] = useState<Record<string, number>>({});

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) return;
    const inserts = Array.from({ length: 12 }, (_, i) => ({
      provider_name: newProviderName.trim(),
      provider_type: "credito" as const,
      installments: i + 1,
      coefficient: 0,
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

  const handleExportExcel = (providerName: string) => {
    const providerRates = rates.filter((r) => r.provider_name === providerName).sort((a, b) => a.installments - b.installments);
    const data = [[providerName, ""], ["Parcelas", "Coeficiente / Taxa"]];
    providerRates.forEach((r) => {
      data.push([String(r.installments), String(r.coefficient)]);
    });
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
        const inserts = parsedRates.map((r) => ({ ...r, provider_name: providerName, provider_type: "credito" as const }));
        const { error } = await supabase.from("financing_rates").insert(inserts);
        if (error) toast.error("Erro ao importar");
        else { toast.success(`Importado "${providerName}" com ${parsedRates.length} parcelas!`); refresh(); }
      } catch { toast.error("Erro ao ler planilha"); }
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
            <div className="flex-1">
              <Label>Nome da Operadora</Label>
              <Input value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="Ex: Stone" className="mt-1" />
            </div>
            <Button onClick={handleAddProvider} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
          <Separator />
          <div>
            <Label>Importar Planilha Excel</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Primeira célula: nome da operadora. Colunas: Parcelas | Coeficiente/Taxa
            </p>
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
                <CardTitle className="text-base">{provider}</CardTitle>
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
                          <Input type="number" step="0.0001" min={0} className="max-w-[200px] h-8"
                            defaultValue={Number(rate.coefficient)}
                            onChange={(e) => handleCoefficientChange(rate.id, Number(e.target.value))} />
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
