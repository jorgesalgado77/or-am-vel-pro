import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";

interface SalesRulesData {
  id?: string;
  min_margin: number;
  max_discount: number;
  preferred_payment: string;
  max_parcelas: number | null;
  approval_required_above: number | null;
}

const DEFAULTS: SalesRulesData = {
  min_margin: 0,
  max_discount: 100,
  preferred_payment: "Boleto",
  max_parcelas: null,
  approval_required_above: null,
};

export function SalesRulesTab() {
  const [rules, setRules] = useState<SalesRulesData>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const tenantId = await getResolvedTenantId();
      if (!tenantId) { setLoading(false); return; }

      const { data } = await supabase
        .from("sales_rules" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (data) {
        const d = data as any;
        setRules({
          id: d.id,
          min_margin: Number(d.min_margin) || 0,
          max_discount: Number(d.max_discount) || 100,
          preferred_payment: d.preferred_payment || "Boleto",
          max_parcelas: d.max_parcelas || null,
          approval_required_above: d.approval_required_above || null,
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { toast.error("Tenant não encontrado"); setSaving(false); return; }

    const payload = {
      tenant_id: tenantId,
      min_margin: rules.min_margin,
      max_discount: rules.max_discount,
      preferred_payment: rules.preferred_payment,
      max_parcelas: rules.max_parcelas,
      approval_required_above: rules.approval_required_above,
      updated_at: new Date().toISOString(),
    };

    if (rules.id) {
      const { error } = await supabase
        .from("sales_rules" as any)
        .update(payload as any)
        .eq("id", rules.id);
      if (error) toast.error("Erro ao salvar: " + error.message);
      else toast.success("Regras comerciais salvas!");
    } else {
      const { data, error } = await supabase
        .from("sales_rules" as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) toast.error("Erro ao criar: " + error.message);
      else {
        setRules(prev => ({ ...prev, id: (data as any).id }));
        toast.success("Regras comerciais criadas!");
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Regras Comerciais</CardTitle>
          </div>
          <CardDescription>
            Defina limites de desconto, margem mínima e políticas de aprovação para proteger a rentabilidade da loja.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Margin */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="min_margin">Margem Mínima (%)</Label>
              <Input
                id="min_margin"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={rules.min_margin}
                onChange={e => setRules(prev => ({ ...prev, min_margin: Number(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
                Orçamentos abaixo dessa margem exibirão alerta ao vendedor.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_discount">Desconto Máximo (%)</Label>
              <Input
                id="max_discount"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={rules.max_discount}
                onChange={e => setRules(prev => ({ ...prev, max_discount: Number(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
                Limite máximo que o vendedor pode aplicar sem aprovação.
              </p>
            </div>
          </div>

          {/* Payment & Parcelas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Forma de Pagamento Preferida</Label>
              <Select
                value={rules.preferred_payment}
                onValueChange={v => setRules(prev => ({ ...prev, preferred_payment: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="Credito">Crédito</SelectItem>
                  <SelectItem value="Credito / Boleto">Crédito + Boleto</SelectItem>
                  <SelectItem value="A vista">À Vista</SelectItem>
                  <SelectItem value="Pix">Pix</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_parcelas">Máximo de Parcelas</Label>
              <Input
                id="max_parcelas"
                type="number"
                min={1}
                max={120}
                placeholder="Sem limite"
                value={rules.max_parcelas ?? ""}
                onChange={e => setRules(prev => ({ ...prev, max_parcelas: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>
          </div>

          {/* Approval threshold */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="approval_above">Aprovação obrigatória acima de (R$)</Label>
              <Input
                id="approval_above"
                type="number"
                min={0}
                step={1000}
                placeholder="Sem limite"
                value={rules.approval_required_above ?? ""}
                onChange={e => setRules(prev => ({ ...prev, approval_required_above: e.target.value ? Number(e.target.value) : null }))}
              />
              <p className="text-xs text-muted-foreground">
                Descontos acima deste valor precisam de aprovação do gerente.
              </p>
            </div>
          </div>

          {/* Preview */}
          {(rules.min_margin > 0 || rules.max_discount < 100) && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-warning/30 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm text-foreground">
                <span className="font-medium">Proteção ativa:</span>{" "}
                {rules.min_margin > 0 && (
                  <Badge variant="outline" className="mr-1">Margem ≥ {rules.min_margin}%</Badge>
                )}
                {rules.max_discount < 100 && (
                  <Badge variant="outline" className="mr-1">Desconto ≤ {rules.max_discount}%</Badge>
                )}
                {rules.approval_required_above && (
                  <Badge variant="outline">Aprovação acima de R$ {rules.approval_required_above.toLocaleString("pt-BR")}</Badge>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Regras"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default SalesRulesTab;
