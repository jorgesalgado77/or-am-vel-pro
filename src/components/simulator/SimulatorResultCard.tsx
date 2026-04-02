import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, FileDown, Handshake, RotateCcw, Loader2 } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/financing";

interface ResultRowProps {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}

function ResultRow({ label, value, muted, highlight }: ResultRowProps) {
  return (
    <div className="flex justify-between items-center">
      <span className={muted ? "text-sm text-muted-foreground" : highlight ? "text-sm font-semibold text-foreground" : "text-sm text-foreground"}>{label}</span>
      <span className={highlight ? "text-lg font-bold text-primary tabular-nums" : muted ? "text-sm text-muted-foreground tabular-nums" : "text-sm font-medium text-foreground tabular-nums"}>{value}</span>
    </div>
  );
}

interface SimulatorResultCardProps {
  valorTela: number;
  valorTelaComComissao: number;
  comissaoPercentual: number;
  hideIndicador: boolean;
  plusPercentual: number;
  result: {
    valorComDesconto: number;
    valorFinal: number;
    valorParcela: number;
    saldo: number;
    taxaCredito: number;
    taxaBoleto: number;
    taxaFixaBoleto: number;
  };
  valorEntrada: number;
  parcelas: number;
  showParcelas: boolean;
  showCarencia: boolean;
  carenciaDias: number;
  saving: boolean;
  closingSale: boolean;
  hasClient: boolean;
  generatingPdf?: boolean;
  onSave: () => void;
  onPdf: (() => void) | null;
  onCloseSale: () => void;
  onClear: () => void;
}

export function SimulatorResultCard({
  valorTela, valorTelaComComissao, comissaoPercentual, hideIndicador, plusPercentual,
  result, valorEntrada, parcelas, showParcelas, showCarencia, carenciaDias,
  saving, closingSale, hasClient, generatingPdf,
  onSave, onPdf, onCloseSale, onClear,
}: SimulatorResultCardProps) {
  const plusValue = plusPercentual > 0 ? result.valorComDesconto * (plusPercentual / 100) : 0;
  const descontoTotalComPlus = (valorTelaComComissao - result.valorComDesconto) + plusValue;
  return (
    <Card>
      <CardHeader className="pb-4"><CardTitle className="text-base">Resultado</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ResultRow label="Valor de Tela" value={formatCurrency(valorTela)} />
        {!hideIndicador && comissaoPercentual > 0 && (
          <ResultRow label={`Indicador (${comissaoPercentual}%)`} value={`+ ${formatCurrency(valorTelaComComissao - valorTela)}`} muted />
        )}
        {!hideIndicador && comissaoPercentual > 0 && (
          <ResultRow label="Valor com Indicador" value={formatCurrency(valorTelaComComissao)} />
        )}
        <ResultRow label="Desconto Total" value={formatCurrency(descontoTotalComPlus)} muted />
        <ResultRow label="Valor com Desconto" value={formatCurrency(result.valorComDesconto)} />
        {plusPercentual > 0 && (
          <>
            <ResultRow label={`Desconto Plus (${plusPercentual}%)`} value={`- ${formatCurrency(plusValue)}`} muted />
            <ResultRow label="Valor após Plus" value={formatCurrency(result.valorComDesconto - plusValue)} />
          </>
        )}
        <Separator />
        <ResultRow label="Entrada" value={formatCurrency(valorEntrada)} />
        <ResultRow label="Saldo" value={formatCurrency(result.saldo)} />
        {result.taxaCredito > 0 && <ResultRow label="Taxa de Crédito" value={formatPercent(result.taxaCredito * 100)} muted />}
        {result.taxaBoleto > 0 && <ResultRow label="Coeficiente Boleto" value={result.taxaBoleto.toFixed(6)} muted />}
        {result.taxaFixaBoleto > 0 && <ResultRow label="Taxa Fixa Boleto" value={formatCurrency(result.taxaFixaBoleto)} muted />}
        {showCarencia && <ResultRow label="Carência" value={`${carenciaDias} dias`} muted />}
        <Separator />
        <div className="bg-primary/5 -mx-6 px-6 py-4 rounded-md">
          <ResultRow label="Valor Final" value={formatCurrency(result.valorFinal)} highlight />
          {showParcelas && <ResultRow label={`Parcela (${parcelas}x)`} value={formatCurrency(result.valorParcela)} highlight />}
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <div className="flex gap-3">
            <Button onClick={onSave} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar Simulação"}
            </Button>
            {onPdf && (
              <Button variant="outline" className="gap-2" onClick={onPdf} disabled={generatingPdf}>
                {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {generatingPdf ? "Gerando..." : "PDF"}
              </Button>
            )}
          </div>
          <Button
            onClick={onCloseSale}
            disabled={closingSale}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
          >
            <Handshake className="h-4 w-4" />
            {closingSale ? "Gerando contrato..." : "Fechar Venda"}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"
            onClick={onClear}
          >
            <RotateCcw className="h-4 w-4" />
            Limpar Simulação
          </Button>
          {!hasClient && (
            <p className="text-xs text-muted-foreground text-center">
              Selecione um cliente para concluir a venda e gerar contrato.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
