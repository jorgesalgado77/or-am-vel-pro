import {useState, useEffect} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Separator} from "@/components/ui/separator";
import {Save, Plus, Trash2, TrendingUp, DollarSign, Award, AlertTriangle} from "lucide-react";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {useComissaoPolicy, type ComissaoPolicy, type ComissaoFaixa} from "@/hooks/useComissaoPolicy";
import {useCargos} from "@/hooks/useCargos";
import {formatCurrency} from "@/lib/financing";

export function ComissaoPolicyTab() {
  const { policy, refresh, settingsId } = useComissaoPolicy();
  const { cargos } = useCargos();
  const [tipo, setTipo] = useState<"fixa" | "escalonada">("fixa");
  const [faixas, setFaixas] = useState<ComissaoFaixa[]>([]);
  const [cargosIds, setCargosIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTipo(policy.tipo);
    setFaixas(policy.faixas.map(f => ({ ...f })));
    setCargosIds([...policy.cargos_ids]);
  }, [policy]);

  const toggleCargo = (id: string) => {
    setCargosIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const updateFaixa = (index: number, field: keyof ComissaoFaixa, value: string) => {
    const num = parseFloat(value) || 0;
    setFaixas(prev => prev.map((f, i) => i === index ? { ...f, [field]: num } : f));
  };

  const addFaixa = () => {
    const last = faixas[faixas.length - 1];
    setFaixas(prev => [...prev, {
      min: last ? last.max + 1 : 0,
      max: last ? last.max + 30000 : 99999.99,
      comissao: 4,
      premio: last ? last.premio + 0.5 : 0,
    }]);
  };

  const removeFaixa = (index: number) => {
    if (faixas.length <= 1) { toast.error("Deve haver pelo menos 1 faixa"); return; }
    setFaixas(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!settingsId) { toast.error("Configurações não encontradas"); return; }
    setSaving(true);

    const newPolicy: ComissaoPolicy = { tipo, faixas, cargos_ids: cargosIds };

    const { error } = await supabase
      .from("company_settings")
      .update({ comissao_policy: newPolicy } as any)
      .eq("id", settingsId);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Política de comissão salva com sucesso!");
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Tipo de Comissão */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Tipo de Comissão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setTipo("fixa")}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipo === "fixa"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Comissão Fixa</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada cargo tem seu percentual fixo definido na configuração do cargo
              </p>
            </button>
            <button
              onClick={() => setTipo("escalonada")}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                tipo === "escalonada"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-sm">Comissão Escalonada</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Comissão + prêmio por meta batida, baseado no valor da venda
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Seleção de Cargos (só aparece se escalonada) */}
      {tipo === "escalonada" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-600" />
              Cargos com Comissão Escalonada
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Selecione quais cargos utilizarão a tabela escalonada. Cargos não selecionados mantêm comissão fixa.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {cargos.length === 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Nenhum cargo cadastrado
                </p>
              )}
              {cargos.map(cargo => (
                <button
                  key={cargo.id}
                  onClick={() => toggleCargo(cargo.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    cargosIds.includes(cargo.id)
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {cargo.nome}
                  {cargosIds.includes(cargo.id) && (
                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 bg-primary-foreground/20 text-primary-foreground">
                      Ativo
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Faixas (só aparece se escalonada) */}
      {tipo === "escalonada" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Tabela de Faixas de Comissão
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addFaixa} className="gap-1">
                <Plus className="h-3 w-3" />Adicionar Faixa
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Valor Mínimo (R$)</TableHead>
                    <TableHead>Valor Máximo (R$)</TableHead>
                    <TableHead className="text-center">Comissão (%)</TableHead>
                    <TableHead className="text-center">Prêmio (%)</TableHead>
                    <TableHead className="text-center font-semibold">Total (%)</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faixas.map((faixa, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-center text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={faixa.min}
                          onChange={e => updateFaixa(i, "min", e.target.value)}
                          className="h-8 text-sm"
                          step={0.01}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={faixa.max}
                          onChange={e => updateFaixa(i, "max", e.target.value)}
                          className="h-8 text-sm"
                          step={0.01}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={faixa.comissao}
                          onChange={e => updateFaixa(i, "comissao", e.target.value)}
                          className="h-8 text-sm text-center"
                          step={0.5}
                          min={0}
                          max={100}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={faixa.premio}
                          onChange={e => updateFaixa(i, "premio", e.target.value)}
                          className="h-8 text-sm text-center"
                          step={0.5}
                          min={0}
                          max={100}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="default"
                          className="bg-emerald-500/10 text-emerald-700 border-emerald-200 font-bold"
                        >
                          {(faixa.comissao + faixa.premio).toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeFaixa(i)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Preview */}
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Pré-visualização</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {faixas.slice(0, 4).map((f, i) => (
                  <div key={i} className="text-center p-2 rounded bg-background border">
                    <p className="text-[10px] text-muted-foreground">
                      {formatCurrency(f.min)} - {formatCurrency(f.max)}
                    </p>
                    <p className="text-lg font-bold text-emerald-600">{(f.comissao + f.premio).toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.comissao}% + {f.premio}% prêmio
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      {tipo === "fixa" && (
        <Card className="bg-muted/30 border-muted">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No modo <strong>Comissão Fixa</strong>, cada cargo utiliza o percentual definido
              na aba <strong>Cargos</strong> das configurações. Para alterar, acesse a aba Cargos
              e edite o campo "Comissão sobre vendas (%)".
            </p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Política de Comissão"}
        </Button>
      </div>
    </div>
  );
}
