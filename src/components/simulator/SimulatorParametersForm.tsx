import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Lock, LockOpen, Upload, EyeOff, Eye, FolderOpen, Cpu, Package } from "lucide-react";
import { SimulatorEnvironmentsTable, type ImportedEnvironment } from "@/components/simulator/SimulatorEnvironmentsTable";
import { formatCurrency, type FormaPagamento } from "@/lib/financing";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { toast } from "sonner";

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "A vista", label: "À Vista" },
  { value: "Pix", label: "Pix" },
  { value: "Credito", label: "Cartão de Crédito" },
  { value: "Boleto", label: "Boleto" },
  { value: "Credito / Boleto", label: "Crédito + Boleto" },
  { value: "Entrada e Entrega", label: "Entrada e Entrega" },
];

interface SimulatorParametersFormProps {
  valorTela: number;
  setValorTela: (v: number) => void;
  desconto1: number; setDesconto1: (v: number) => void;
  desconto2: number; setDesconto2: (v: number) => void;
  desconto3: number; setDesconto3: (v: number) => void;
  desconto3Unlocked: boolean;
  formaPagamento: FormaPagamento;
  setFormaPagamento: (v: FormaPagamento) => void;
  parcelas: number; setParcelas: (v: number) => void;
  valorEntrada: number; setValorEntrada: (v: number) => void;
  plusPercentual: number; setPlusPercentual: (v: number) => void;
  plusUnlocked: boolean;
  carenciaDias: 30 | 60 | 90;
  setCarenciaDias: (v: 30 | 60 | 90) => void;
  selectedIndicadorId: string;
  setSelectedIndicadorId: (v: string) => void;
  hideIndicador: boolean;
  setHideIndicador: (v: boolean) => void;
  comissaoPercentual: number;
  valorTelaComComissao: number;
  canHideIndicador: boolean;
  environments: ImportedEnvironment[];
  setEnvironments: React.Dispatch<React.SetStateAction<ImportedEnvironment[]>>;
  detectedSoftware: string | null;
  canDeleteEnvironment: boolean;
  activeIndicadores: Array<{ id: string; nome: string; comissao_percentual: number }>;
  getOptionsForField: (field: string) => number[];
  showParcelas: boolean;
  showPlus: boolean;
  showCarencia: boolean;
  availableParcelas: number[];
  availableCarenciaOptions: Array<{ value: string; label: string }>;
  boletoProviders: string[];
  creditoProviders: string[];
  selectedBoletoProvider: string;
  selectedCreditoProvider: string;
  onBoletoProviderChange: (p: string) => void;
  onCreditoProviderChange: (p: string) => void;
  onRequestUnlock: (field: "desconto3" | "plus") => void;
  onFileImport: () => void;
  onRemoveEnvironment: (id: string) => void;
  onLoadSimulation: () => void;
  onProductPicker: () => void;
  VALOR_TELA_MAX: number;
  VALOR_ENTRADA_MAX: number;
}

export const SimulatorParametersForm = React.memo(function SimulatorParametersForm({
  valorTela, setValorTela,
  desconto1, setDesconto1, desconto2, setDesconto2, desconto3, setDesconto3,
  desconto3Unlocked,
  formaPagamento, setFormaPagamento,
  parcelas, setParcelas,
  valorEntrada, setValorEntrada,
  plusPercentual, setPlusPercentual, plusUnlocked,
  carenciaDias, setCarenciaDias,
  selectedIndicadorId, setSelectedIndicadorId,
  hideIndicador, setHideIndicador,
  comissaoPercentual, valorTelaComComissao, canHideIndicador,
  environments, setEnvironments, detectedSoftware, canDeleteEnvironment,
  activeIndicadores, getOptionsForField,
  showParcelas, showPlus, showCarencia,
  availableParcelas, availableCarenciaOptions,
  boletoProviders, creditoProviders,
  selectedBoletoProvider, selectedCreditoProvider,
  onBoletoProviderChange, onCreditoProviderChange,
  onRequestUnlock, onFileImport, onRemoveEnvironment,
  onLoadSimulation, onProductPicker,
  VALOR_TELA_MAX, VALOR_ENTRADA_MAX,
}: SimulatorParametersFormProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Parâmetros da Negociação</CardTitle>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={onLoadSimulation}>
            <FolderOpen className="h-3.5 w-3.5" /> Carregar Simulação
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Valor de Tela */}
        <div>
          <Label>Valor de Tela</Label>
          <div className="flex gap-2 mt-1">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input
                type="text"
                inputMode="numeric"
                value={valorTela ? maskCurrency(String(Math.round(valorTela * 100))) : ""}
                onChange={(e) => {
                  const raw = unmaskCurrency(e.target.value);
                  if (raw > VALOR_TELA_MAX) {
                    toast.error(`Valor máximo: ${formatCurrency(VALOR_TELA_MAX)}`);
                    setValorTela(VALOR_TELA_MAX);
                    return;
                  }
                  setValorTela(raw);
                }}
                className="pl-10"
                placeholder="R$ 0,00"
              />
            </div>
            <Button variant="outline" size="icon" className="shrink-0" title="Importar arquivo TXT ou XML" onClick={onFileImport}>
              <Upload className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="shrink-0" title="Adicionar produtos do catálogo" onClick={onProductPicker}>
              <Package className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 border rounded-md overflow-hidden">
            <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Ambientes Importados</span>
                {detectedSoftware && (
                  <Badge variant="secondary" className="text-[9px] h-5 gap-1 px-1.5 font-semibold">
                    <Cpu className="h-2.5 w-2.5" />
                    {detectedSoftware === "promob" ? "Promob" : detectedSoftware === "focco" ? "Focco" : detectedSoftware === "gabster" ? "Gabster" : detectedSoftware}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{environments.length} arquivo(s)</span>
            </div>
            <SimulatorEnvironmentsTable
              environments={environments}
              onUpdateName={(id, name) => setEnvironments((prev) => prev.map((item) => item.id === id ? { ...item, environmentName: name } : item))}
              onRemove={onRemoveEnvironment}
              canDelete={canDeleteEnvironment}
            />
          </div>
        </div>

        {/* Indicador */}
        <div>
          <div className="flex items-center justify-between">
            <Label>Indicador do Cliente</Label>
            {selectedIndicadorId && comissaoPercentual > 0 && canHideIndicador && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground" onClick={() => setHideIndicador(!hideIndicador)}>
                {hideIndicador ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {hideIndicador ? "Mostrar" : "Ocultar"}
              </Button>
            )}
            {selectedIndicadorId && comissaoPercentual > 0 && !canHideIndicador && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> VIP
              </span>
            )}
          </div>
          {!hideIndicador && (
            <Select value={selectedIndicadorId || "_none"} onValueChange={(v) => setSelectedIndicadorId(v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhum (0%)</SelectItem>
                {activeIndicadores.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.nome} ({ind.comissao_percentual}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!hideIndicador && comissaoPercentual > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Acréscimo de {comissaoPercentual}%: {formatCurrency(valorTela)} → {formatCurrency(valorTelaComComissao)}
            </p>
          )}
        </div>

        {/* Descontos */}
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <Label className="mb-1 block">Desconto 1 (%)</Label>
            <Select value={String(desconto1)} onValueChange={(v) => setDesconto1(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {getOptionsForField("desconto1").map((v) => (
                  <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Desconto 2 (%)</Label>
            <Select value={String(desconto2)} onValueChange={(v) => setDesconto2(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {getOptionsForField("desconto2").map((v) => (
                  <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 flex items-center gap-1">
              Desconto 3 (%)
              {!desconto3Unlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              {desconto3Unlocked && <LockOpen className="h-3 w-3 text-success" />}
            </Label>
            {desconto3Unlocked ? (
              <Select value={String(desconto3)} onValueChange={(v) => setDesconto3(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getOptionsForField("desconto3").map((v) => (
                    <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button variant="outline" size="sm" className="w-full h-9 gap-1 text-muted-foreground" onClick={() => onRequestUnlock("desconto3")}>
                <Lock className="h-3 w-3" />Desbloquear
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Forma de Pagamento */}
        <div>
          <Label>Forma de Pagamento</Label>
          <Select value={formaPagamento} onValueChange={(v) => { setFormaPagamento(v as FormaPagamento); setParcelas(1); }}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMAS_PAGAMENTO.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Boleto Provider */}
        {formaPagamento === "Boleto" && boletoProviders.length > 0 && (
          <div>
            <Label>Financeira</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {boletoProviders.map((p) => (
                <Button key={p} size="sm" variant={selectedBoletoProvider === p ? "default" : "outline"} onClick={() => onBoletoProviderChange(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Credito Provider */}
        {(formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") && creditoProviders.length > 0 && (
          <div>
            <Label>Operadora de Crédito</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {creditoProviders.map((p) => (
                <Button key={p} size="sm" variant={selectedCreditoProvider === p ? "default" : "outline"} onClick={() => onCreditoProviderChange(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Carência */}
        {showCarencia && (
          <div>
            <Label>Carência (dias)</Label>
            <Select value={String(carenciaDias)} onValueChange={(v) => setCarenciaDias(Number(v) as 30 | 60 | 90)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableCarenciaOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Parcelas */}
        {showParcelas && (
          <div>
            <Label>Parcelas</Label>
            <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {availableParcelas.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Valor de Entrada */}
        <div>
          <Label>Valor de Entrada</Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              type="text"
              inputMode="numeric"
              value={valorEntrada ? maskCurrency(String(Math.round(valorEntrada * 100))) : ""}
              onChange={(e) => {
                const raw = unmaskCurrency(e.target.value);
                if (raw > VALOR_ENTRADA_MAX) {
                  toast.error(`Valor máximo de entrada: ${formatCurrency(VALOR_ENTRADA_MAX)}`);
                  setValorEntrada(VALOR_ENTRADA_MAX);
                  return;
                }
                setValorEntrada(raw);
              }}
              className="pl-10"
              placeholder="R$ 0,00"
            />
          </div>
        </div>

        {/* Plus */}
        {showPlus && (
          <div>
            <Label className="flex items-center gap-1">
              Desconto Plus (%)
              {!plusUnlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              {plusUnlocked && <LockOpen className="h-3 w-3 text-success" />}
            </Label>
            {plusUnlocked ? (
              <Select value={String(plusPercentual)} onValueChange={(v) => setPlusPercentual(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getOptionsForField("plus").map((v) => (
                    <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button variant="outline" size="sm" className="mt-1 w-full gap-1 text-muted-foreground" onClick={() => onRequestUnlock("plus")}>
                <Lock className="h-3 w-3" />Desbloquear
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
