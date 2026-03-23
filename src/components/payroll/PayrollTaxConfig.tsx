import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings2, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "sonner";

export interface TaxRate {
  nome: string;
  aliquota: number;
  ativo: boolean;
}

export interface RegimeTaxConfig {
  CLT: TaxRate[];
  MEI: TaxRate[];
  Freelancer: TaxRate[];
}

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
  return {
    CLT: Array.isArray(raw.CLT) ? raw.CLT : DEFAULT_TAX_CONFIG.CLT,
    MEI: Array.isArray(raw.MEI) ? raw.MEI : DEFAULT_TAX_CONFIG.MEI,
    Freelancer: Array.isArray(raw.Freelancer) ? raw.Freelancer : DEFAULT_TAX_CONFIG.Freelancer,
  };
}

interface Props {
  onClose: () => void;
}

export function PayrollTaxConfig({ onClose }: Props) {
  const { settings, refresh } = useCompanySettings();
  const [config, setConfig] = useState<RegimeTaxConfig>(DEFAULT_TAX_CONFIG);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(getRegimeTaxConfig(settings));
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
    setConfig(prev => ({
      ...prev,
      [regime]: [...prev[regime], { nome: "", aliquota: 0, ativo: true }],
    }));
  };

  const removeTax = (regime: keyof RegimeTaxConfig, index: number) => {
    setConfig(prev => ({
      ...prev,
      [regime]: prev[regime].filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("company_settings")
      .update({ tax_config: config } as any)
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
                    <Input
                      value={tax.nome}
                      onChange={(e) => updateTax(regime, i, "nome", e.target.value)}
                      placeholder="Nome do imposto"
                      className="text-xs h-8 flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={tax.aliquota}
                        onChange={(e) => updateTax(regime, i, "aliquota", parseFloat(e.target.value) || 0)}
                        className="text-xs h-8 w-20 text-right"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tax.ativo}
                        onChange={(e) => updateTax(regime, i, "ativo", e.target.checked)}
                        className="rounded"
                      />
                    </label>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeTax(regime, i)}>
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              <Separator />
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => addTax(regime)}>
                + Adicionar imposto
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
