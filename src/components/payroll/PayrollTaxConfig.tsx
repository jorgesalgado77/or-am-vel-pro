import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings2, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/financing";

export interface TaxRate {
  nome: string;
  aliquota: number;
  ativo: boolean;
}

export interface INSSFaixa {
  limite: number;
  aliquota: number;
  deducao: number;
}

export interface IRRFFaixa {
  limite: number;
  aliquota: number;
  deducao: number;
}

export type MEIAtividade = "comercio" | "servicos" | "ambos";

export interface MEIDASConfig {
  salario_minimo: number;
  inss_percentual: number;
  icms_valor: number;
  iss_valor: number;
}

export interface RegimeTaxConfig {
  CLT: TaxRate[];
  MEI: TaxRate[];
  Freelancer: TaxRate[];
}

export interface FullTaxConfig {
  regimes: RegimeTaxConfig;
  inss_faixas: INSSFaixa[];
  irrf_faixas: IRRFFaixa[];
  irrf_isencao_limite: number;
  irrf_transicao_limite: number;
  mei_das: MEIDASConfig;
}

export const DEFAULT_INSS_FAIXAS: INSSFaixa[] = [
  { limite: 1621.00, aliquota: 7.5, deducao: 0 },
  { limite: 2902.84, aliquota: 9, deducao: 24.32 },
  { limite: 4354.27, aliquota: 12, deducao: 111.40 },
  { limite: 8475.55, aliquota: 14, deducao: 198.49 },
];

export const DEFAULT_IRRF_FAIXAS: IRRFFaixa[] = [
  { limite: 2259.20, aliquota: 0, deducao: 0 },
  { limite: 2826.65, aliquota: 7.5, deducao: 169.44 },
  { limite: 3751.05, aliquota: 15, deducao: 381.44 },
  { limite: 4664.68, aliquota: 22.5, deducao: 662.77 },
  { limite: 999999.99, aliquota: 27.5, deducao: 896.00 },
];

export const DEFAULT_IRRF_ISENCAO_LIMITE = 5000.00;
export const DEFAULT_IRRF_TRANSICAO_LIMITE = 7350.00;

export const DEFAULT_MEI_DAS: MEIDASConfig = {
  salario_minimo: 1621.00,
  inss_percentual: 5,
  icms_valor: 1.00,
  iss_valor: 5.00,
};

const DEFAULT_CLT_TAXES: TaxRate[] = [
  { nome: "INSS", aliquota: 7.5, ativo: true },
  { nome: "IRRF", aliquota: 0, ativo: true },
  { nome: "FGTS", aliquota: 8, ativo: true },
  { nome: "Vale Transporte (6%)", aliquota: 6, ativo: false },
  { nome: "Vale Refeição", aliquota: 0, ativo: false },
  { nome: "Plano de Saúde", aliquota: 0, ativo: false },
];

const DEFAULT_MEI_TAXES: TaxRate[] = [
  { nome: "DAS MEI", aliquota: 5, ativo: true },
  { nome: "ISS", aliquota: 5, ativo: false },
  { nome: "ICMS", aliquota: 1, ativo: false },
  { nome: "INSS Patronal", aliquota: 0, ativo: false },
];

const DEFAULT_FREELANCER_TAXES: TaxRate[] = [
  { nome: "INSS (contribuinte individual)", aliquota: 11, ativo: true },
  { nome: "IRRF", aliquota: 0, ativo: true },
  { nome: "ISS", aliquota: 5, ativo: false },
];

export const DEFAULT_TAX_CONFIG: RegimeTaxConfig = {
  CLT: DEFAULT_CLT_TAXES,
  MEI: DEFAULT_MEI_TAXES,
  Freelancer: DEFAULT_FREELANCER_TAXES,
};

export function getRegimeTaxConfig(settings: any): RegimeTaxConfig {
  const raw = settings?.tax_config;
  if (!raw || typeof raw !== "object") return DEFAULT_TAX_CONFIG;
  const regimes = raw.regimes || raw;
  return {
    CLT: Array.isArray(regimes.CLT) ? regimes.CLT : DEFAULT_TAX_CONFIG.CLT,
    MEI: Array.isArray(regimes.MEI) ? regimes.MEI : DEFAULT_TAX_CONFIG.MEI,
    Freelancer: Array.isArray(regimes.Freelancer) ? regimes.Freelancer : DEFAULT_TAX_CONFIG.Freelancer,
  };
}

export function getINSSFaixas(settings: any): INSSFaixa[] {
  const raw = settings?.tax_config;
  if (!raw || typeof raw !== "object") return DEFAULT_INSS_FAIXAS;
  return Array.isArray(raw.inss_faixas) ? raw.inss_faixas : DEFAULT_INSS_FAIXAS;
}

export function getIRRFFaixas(settings: any): IRRFFaixa[] {
  const raw = settings?.tax_config;
  if (!raw || typeof raw !== "object") return DEFAULT_IRRF_FAIXAS;
  return Array.isArray(raw.irrf_faixas) ? raw.irrf_faixas : DEFAULT_IRRF_FAIXAS;
}

export function getIRRFLimites(settings: any): { isencao: number; transicao: number } {
  const raw = settings?.tax_config;
  if (!raw || typeof raw !== "object") return { isencao: DEFAULT_IRRF_ISENCAO_LIMITE, transicao: DEFAULT_IRRF_TRANSICAO_LIMITE };
  return {
    isencao: typeof raw.irrf_isencao_limite === "number" ? raw.irrf_isencao_limite : DEFAULT_IRRF_ISENCAO_LIMITE,
    transicao: typeof raw.irrf_transicao_limite === "number" ? raw.irrf_transicao_limite : DEFAULT_IRRF_TRANSICAO_LIMITE,
  };
}

export function getMEIDASConfig(settings: any): MEIDASConfig {
  const raw = settings?.tax_config;
  if (!raw || typeof raw !== "object" || !raw.mei_das) return DEFAULT_MEI_DAS;
  return { ...DEFAULT_MEI_DAS, ...raw.mei_das };
}

export function calcularDASMEI(
  atividade: MEIAtividade,
  config: MEIDASConfig,
): { inss: number; icms: number; iss: number; total: number; descricao: string } {
  const inss = (config.salario_minimo * config.inss_percentual) / 100;
  const icms = (atividade === "comercio" || atividade === "ambos") ? config.icms_valor : 0;
  const iss = (atividade === "servicos" || atividade === "ambos") ? config.iss_valor : 0;
  const total = inss + icms + iss;
  
  const atividadeLabel = atividade === "comercio" ? "Comércio/Indústria"
    : atividade === "servicos" ? "Prestação de Serviços"
    : "Comércio e Serviços";
  
  return { inss, icms, iss, total, descricao: atividadeLabel };
}

export function calcularINSS(salarioBruto: number, faixas: INSSFaixa[]): { valor: number; aliquota: number; faixa: string } {
  if (!faixas.length || salarioBruto <= 0) return { valor: 0, aliquota: 0, faixa: "—" };
  const sorted = [...faixas].sort((a, b) => a.limite - b.limite);
  for (const f of sorted) {
    if (salarioBruto <= f.limite) {
      const valor = (salarioBruto * f.aliquota) / 100 - f.deducao;
      return { valor: Math.max(0, valor), aliquota: f.aliquota, faixa: `Até ${formatCurrency(f.limite)}` };
    }
  }
  const last = sorted[sorted.length - 1];
  const valor = (last.limite * last.aliquota) / 100 - last.deducao;
  return { valor: Math.max(0, valor), aliquota: last.aliquota, faixa: `Teto ${formatCurrency(last.limite)}` };
}

export function calcularIRRF(
  salarioBruto: number,
  descontoINSS: number,
  faixas: IRRFFaixa[],
  isencaoLimite: number,
  transicaoLimite: number,
): { valor: number; aliquota: number; descricao: string } {
  if (!faixas.length || salarioBruto <= 0) return { valor: 0, aliquota: 0, descricao: "—" };

  // Base de cálculo = bruto - INSS
  const baseCalculo = salarioBruto - descontoINSS;

  // Até o limite de isenção: isento
  if (baseCalculo <= isencaoLimite) {
    return { valor: 0, aliquota: 0, descricao: "Isento" };
  }

  // Calcula o imposto pela tabela padrão
  const sorted = [...faixas].sort((a, b) => a.limite - b.limite);
  let impostoTabela = 0;
  let aliquotaUsada = 0;

  for (const f of sorted) {
    if (baseCalculo <= f.limite) {
      impostoTabela = (baseCalculo * f.aliquota) / 100 - f.deducao;
      aliquotaUsada = f.aliquota;
      break;
    }
  }
  if (aliquotaUsada === 0 && sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    impostoTabela = (baseCalculo * last.aliquota) / 100 - last.deducao;
    aliquotaUsada = last.aliquota;
  }

  impostoTabela = Math.max(0, impostoTabela);

  // Faixa de transição: desconto parcial entre isenção e transição
  if (baseCalculo > isencaoLimite && baseCalculo <= transicaoLimite) {
    // Redutor proporcional: quanto mais perto do teto de transição, menor o desconto
    const faixaRange = transicaoLimite - isencaoLimite;
    const posicao = baseCalculo - isencaoLimite;
    const fatorDesconto = 1 - (posicao / faixaRange);
    const desconto = impostoTabela * fatorDesconto;
    const valorFinal = Math.max(0, impostoTabela - desconto);
    return { valor: valorFinal, aliquota: aliquotaUsada, descricao: `Transição (${aliquotaUsada}%)` };
  }

  // Acima do limite de transição: tabela padrão sem desconto
  return { valor: impostoTabela, aliquota: aliquotaUsada, descricao: `${aliquotaUsada}%` };
}

interface Props {
  onClose: () => void;
}

export function PayrollTaxConfig({ onClose }: Props) {
  const { settings, refresh } = useCompanySettings();
  const [config, setConfig] = useState<RegimeTaxConfig>(DEFAULT_TAX_CONFIG);
  const [inssFaixas, setInssFaixas] = useState<INSSFaixa[]>(DEFAULT_INSS_FAIXAS);
  const [irrfFaixas, setIrrfFaixas] = useState<IRRFFaixa[]>(DEFAULT_IRRF_FAIXAS);
  const [irrfIsencao, setIrrfIsencao] = useState(DEFAULT_IRRF_ISENCAO_LIMITE);
  const [irrfTransicao, setIrrfTransicao] = useState(DEFAULT_IRRF_TRANSICAO_LIMITE);
  const [meiDas, setMeiDas] = useState<MEIDASConfig>(DEFAULT_MEI_DAS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(getRegimeTaxConfig(settings));
    setInssFaixas(getINSSFaixas(settings));
    setIrrfFaixas(getIRRFFaixas(settings));
    const limites = getIRRFLimites(settings);
    setIrrfIsencao(limites.isencao);
    setIrrfTransicao(limites.transicao);
    setMeiDas(getMEIDASConfig(settings));
  }, [settings]);

  const updateTax = (regime: keyof RegimeTaxConfig, index: number, field: keyof TaxRate, value: any) => {
    setConfig(prev => {
      const updated = { ...prev };
      updated[regime] = [...prev[regime]];
      updated[regime][index] = { ...updated[regime][index], [field]: value };
      return updated;
    });
  };

  const addTax = (regime: keyof RegimeTaxConfig) => {
    setConfig(prev => ({ ...prev, [regime]: [...prev[regime], { nome: "", aliquota: 0, ativo: true }] }));
  };

  const removeTax = (regime: keyof RegimeTaxConfig, index: number) => {
    setConfig(prev => ({ ...prev, [regime]: prev[regime].filter((_, i) => i !== index) }));
  };

  const updateINSSFaixa = (index: number, field: keyof INSSFaixa, value: number) => {
    setInssFaixas(prev => { const u = [...prev]; u[index] = { ...u[index], [field]: value }; return u; });
  };
  const addINSSFaixa = () => setInssFaixas(prev => [...prev, { limite: 0, aliquota: 0, deducao: 0 }]);
  const removeINSSFaixa = (index: number) => setInssFaixas(prev => prev.filter((_, i) => i !== index));

  const updateIRRFFaixa = (index: number, field: keyof IRRFFaixa, value: number) => {
    setIrrfFaixas(prev => { const u = [...prev]; u[index] = { ...u[index], [field]: value }; return u; });
  };
  const addIRRFFaixa = () => setIrrfFaixas(prev => [...prev, { limite: 0, aliquota: 0, deducao: 0 }]);
  const removeIRRFFaixa = (index: number) => setIrrfFaixas(prev => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    setSaving(true);
    const fullConfig: FullTaxConfig = {
      regimes: config,
      inss_faixas: inssFaixas,
      irrf_faixas: irrfFaixas,
      irrf_isencao_limite: irrfIsencao,
      irrf_transicao_limite: irrfTransicao,
      mei_das: meiDas,
    };
    const { error } = await supabase
      .from("company_settings")
      .update({ tax_config: fullConfig } as any)
      .eq("id", settings.id);
    if (error) toast.error("Erro ao salvar configuração de impostos");
    else { toast.success("Impostos salvos!"); refresh(); }
    setSaving(false);
  };

  const regimeLabels: Record<string, { label: string; color: string }> = {
    CLT: { label: "CLT", color: "border-emerald-500/50 text-emerald-700" },
    MEI: { label: "MEI", color: "border-blue-500/50 text-blue-700" },
    Freelancer: { label: "Freelancer", color: "border-amber-500/50 text-amber-700" },
  };

  const renderFaixaTable = (
    title: string,
    badgeClass: string,
    subtitle: string,
    faixas: { limite: number; aliquota: number; deducao: number }[],
    updateFn: (i: number, field: string, value: number) => void,
    addFn: () => void,
    removeFn: (i: number) => void,
  ) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge variant="outline" className={badgeClass}>{title}</Badge>
          <span className="text-xs text-muted-foreground font-normal">{subtitle}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-xs font-medium text-muted-foreground">
          <span>Faixa Salarial (até)</span>
          <span className="w-20 text-center">Alíquota</span>
          <span className="w-24 text-center">Parcela a Deduzir</span>
          <span className="w-6"></span>
        </div>
        {faixas.map((faixa, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">R$</span>
              <Input type="number" step="0.01" value={faixa.limite}
                onChange={(e) => updateFn(i, "limite", parseFloat(e.target.value) || 0)} className="text-xs h-8" />
            </div>
            <div className="flex items-center gap-1">
              <Input type="number" step="0.1" value={faixa.aliquota}
                onChange={(e) => updateFn(i, "aliquota", parseFloat(e.target.value) || 0)} className="text-xs h-8 w-20 text-right" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">R$</span>
              <Input type="number" step="0.01" value={faixa.deducao}
                onChange={(e) => updateFn(i, "deducao", parseFloat(e.target.value) || 0)} className="text-xs h-8 w-24 text-right" />
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFn(i)}>×</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={addFn}>+ Adicionar faixa</Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Configuração de Impostos por Regime</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Voltar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </div>
      </div>

      {/* INSS + IRRF Tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderFaixaTable(
          "Tabela INSS 2026", "border-primary/50 text-primary",
          "Cálculo progressivo por faixa salarial",
          inssFaixas,
          (i, f, v) => updateINSSFaixa(i, f as keyof INSSFaixa, v),
          addINSSFaixa, removeINSSFaixa,
        )}

        <div className="space-y-4">
          {renderFaixaTable(
            "Tabela IRRF 2026", "border-amber-500/50 text-amber-700",
            "Tabela padrão (base = bruto − INSS)",
            irrfFaixas,
            (i, f, v) => updateIRRFFaixa(i, f as keyof IRRFFaixa, v),
            addIRRFFaixa, removeIRRFFaixa,
          )}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Regra de Isenção e Transição IRRF</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Isenção total até</p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">R$</span>
                    <Input type="number" step="0.01" value={irrfIsencao}
                      onChange={(e) => setIrrfIsencao(parseFloat(e.target.value) || 0)} className="text-xs h-8" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Transição parcial até</p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">R$</span>
                    <Input type="number" step="0.01" value={irrfTransicao}
                      onChange={(e) => setIrrfTransicao(parseFloat(e.target.value) || 0)} className="text-xs h-8" />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                • Até <strong>{formatCurrency(irrfIsencao)}</strong>: isenção total (R$ 0,00)<br />
                • De <strong>{formatCurrency(irrfIsencao)}</strong> até <strong>{formatCurrency(irrfTransicao)}</strong>: desconto parcial (transição)<br />
                • Acima de <strong>{formatCurrency(irrfTransicao)}</strong>: tabela padrão sem desconto
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(Object.keys(config) as Array<keyof RegimeTaxConfig>).map((regime) => (
          <Card key={regime}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <Badge variant="outline" className={regimeLabels[regime]?.color}>
                  {regimeLabels[regime]?.label || regime}
                </Badge>
                <span className="text-xs text-muted-foreground">{config[regime].length} itens</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {config[regime].map((tax, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input value={tax.nome} onChange={(e) => updateTax(regime, i, "nome", e.target.value)}
                      placeholder="Nome do imposto" className="text-xs h-8 flex-1" />
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.1" value={tax.aliquota}
                        onChange={(e) => updateTax(regime, i, "aliquota", parseFloat(e.target.value) || 0)}
                        className="text-xs h-8 w-20 text-right" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={tax.ativo}
                        onChange={(e) => updateTax(regime, i, "ativo", e.target.checked)} className="rounded" />
                    </label>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeTax(regime, i)}>×</Button>
                  </div>
                </div>
              ))}
              <Separator />
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => addTax(regime)}>+ Adicionar imposto</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
