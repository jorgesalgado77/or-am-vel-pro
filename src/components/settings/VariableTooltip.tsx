import { useState, useEffect, useCallback, useRef } from "react";

interface VariableOption {
  var: string;
  desc: string;
}

// Example preview values for each variable
const PREVIEW_VALUES: Record<string, string> = {
  "{{nome_cliente}}": "João da Silva",
  "{{cpf_cliente}}": "123.456.789-00",
  "{{rg_insc_estadual}}": "12.345.678-9",
  "{{telefone_cliente}}": "(11) 99999-8888",
  "{{email_cliente}}": "joao@email.com",
  "{{numero_orcamento}}": "ORC-2026-0042",
  "{{numero_contrato}}": "CTR-2026-0042",
  "{{data_fechamento}}": "05/04/2026",
  "{{responsavel_venda}}": "Maria Oliveira",
  "{{data_nascimento}}": "15/03/1985",
  "{{profissao}}": "Engenheiro",
  "{{endereco}}": "Rua das Flores, 123",
  "{{bairro}}": "Centro",
  "{{cidade}}": "São Paulo",
  "{{uf}}": "SP",
  "{{cep}}": "01234-567",
  "{{endereco_entrega}}": "Av. Brasil, 456",
  "{{bairro_entrega}}": "Jardim América",
  "{{cidade_entrega}}": "São Paulo",
  "{{uf_entrega}}": "SP",
  "{{cep_entrega}}": "04567-890",
  "{{prazo_entrega}}": "45 dias úteis",
  "{{prazo_entrega_fornecedor}}": "30 dias úteis",
  "{{projetista}}": "Ana Costa",
  "{{valor_tela}}": "R$ 25.000,00",
  "{{valor_final}}": "R$ 22.500,00",
  "{{forma_pagamento}}": "Cartão de Crédito",
  "{{parcelas}}": "10",
  "{{valor_parcela}}": "R$ 2.050,00",
  "{{valor_entrada}}": "R$ 2.000,00",
  "{{data_atual}}": new Date().toLocaleDateString("pt-BR"),
  "{{empresa_nome}}": "Móveis Premium Ltda",
  "{{cnpj_loja}}": "12.345.678/0001-90",
  "{{endereco_loja}}": "Av. Paulista, 1000",
  "{{bairro_loja}}": "Bela Vista",
  "{{cidade_loja}}": "São Paulo",
  "{{uf_loja}}": "SP",
  "{{cep_loja}}": "01310-100",
  "{{telefone_loja}}": "(11) 3333-4444",
  "{{email_loja}}": "contato@moveispremium.com",
  "{{indicador_nome}}": "Carlos Indicador",
  "{{indicador_comissao}}": "5",
  "{{observacoes}}": "Entrega somente no período da manhã.",
  "{{itens_tabela}}": "[Tabela de itens]",
  "{{itens_detalhes}}": "[Detalhes técnicos]",
  "{{total_ambientes}}": "R$ 22.500,00",
  "{{quantidade_ambientes}}": "3",
  "{{produtos_catalogo}}": "[Tabela de produtos]",
  "{{valor_com_desconto}}": "R$ 22.500,00",
  "{{percentual_desconto}}": "10%",
  "{{valor_desconto}}": "R$ 2.500,00",
  "{{valor_restante}}": "R$ 20.500,00",
  "{{condicoes_pagamento}}": "Entrada de R$ 2.000,00 + 10x de R$ 2.050,00",
  "{{garantia}}": "5 anos contra defeitos de fabricação",
  "{{prazo_garantia}}": "5 anos",
  "{{validade_proposta}}": "15 dias",
  "{{data_entrega_prevista}}": "20/05/2026",
  "{{valor_total_produtos}}": "R$ 5.000,00",
  "{{valor_total_ambientes}}": "R$ 17.500,00",
  "{{valor_por_extenso}}": "Vinte e dois mil e quinhentos reais",
};

interface Props {
  variables: VariableOption[];
  editorRef: React.RefObject<HTMLDivElement>;
}

export function VariableTooltip({ variables, editorRef }: Props) {
  const [tooltip, setTooltip] = useState<{
    text: string;
    desc: string;
    preview: string;
    top: number;
    left: number;
  } | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  const varMap = new Map(variables.map((v) => [v.var, v.desc]));

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      // Check if mouse is over a text node containing {{...}}
      const target = e.target as HTMLElement;
      if (!editor.contains(target)) {
        setTooltip(null);
        return;
      }

      // Use document.caretPositionFromPoint or caretRangeFromPoint
      let range: Range | null = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(e.clientX, e.clientY);
      }

      if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
        // Don't hide immediately — allow small movements
        clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setTooltip(null), 200);
        return;
      }

      const text = range.startContainer.textContent || "";
      const offset = range.startOffset;

      // Find {{...}} around the cursor position
      const before = text.substring(0, offset + 10); // look slightly ahead
      const match = before.match(/\{\{[^}]*\}\}/g);
      if (!match) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setTooltip(null), 200);
        return;
      }

      // Find which match contains the cursor
      let found: string | null = null;
      let searchStart = 0;
      for (const m of match) {
        const idx = text.indexOf(m, searchStart);
        if (idx <= offset && offset <= idx + m.length) {
          found = m;
          break;
        }
        searchStart = idx + m.length;
      }

      if (!found) {
        // Also check if cursor is right at a match
        const allMatches = [...text.matchAll(/\{\{[^}]*\}\}/g)];
        for (const am of allMatches) {
          const start = am.index!;
          const end = start + am[0].length;
          if (offset >= start && offset <= end) {
            found = am[0];
            break;
          }
        }
      }

      if (!found) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setTooltip(null), 200);
        return;
      }

      clearTimeout(hideTimeout.current);
      const desc = varMap.get(found) || "Variável personalizada";
      const preview = PREVIEW_VALUES[found] || "—";
      const editorRect = editor.getBoundingClientRect();

      setTooltip({
        text: found,
        desc,
        preview,
        top: e.clientY - editorRect.top + editor.scrollTop - 60,
        left: e.clientX - editorRect.left,
      });
    },
    [editorRef, varMap],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.addEventListener("mousemove", handleMouseMove);
    editor.addEventListener("mouseleave", () => setTooltip(null));
    return () => {
      editor.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(hideTimeout.current);
    };
  }, [editorRef, handleMouseMove]);

  if (!tooltip) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg"
      style={{ top: tooltip.top, left: tooltip.left, maxWidth: 280 }}
    >
      <p className="font-mono text-xs font-semibold text-primary">{tooltip.text}</p>
      <p className="text-xs text-muted-foreground">{tooltip.desc}</p>
      <div className="mt-1 rounded bg-muted/50 px-2 py-1">
        <p className="text-xs text-foreground">
          <span className="text-muted-foreground">Preview: </span>
          <span className="font-medium">{tooltip.preview}</span>
        </p>
      </div>
    </div>
  );
}
