/**
 * Commission generation service — creates payroll commissions after a sale.
 */

import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";

interface CommissionInput {
  clientId: string;
  clientName: string;
  valorAVista: number;
  contratoNumero: string;
  responsavelVenda: string;
  selectedIndicador?: { id: string; nome: string } | null;
  comissaoPercentual: number;
}

export async function generateSaleCommissions(input: CommissionInput): Promise<{ count: number; error?: string }> {
  const { clientId, clientName, valorAVista, contratoNumero, responsavelVenda, selectedIndicador, comissaoPercentual } = input;
  const mesRef = format(new Date(), "yyyy-MM");
  const commissions: any[] = [];

  // 1. Indicador commission
  if (selectedIndicador && comissaoPercentual > 0) {
    commissions.push({
      usuario_id: null,
      indicador_id: selectedIndicador.id,
      mes_referencia: mesRef,
      valor_comissao: (valorAVista * comissaoPercentual) / 100,
      valor_base: valorAVista,
      cargo_referencia: "Indicador",
      contrato_numero: contratoNumero,
      client_name: clientName,
      observacao: `Indicador: ${selectedIndicador.nome} (${comissaoPercentual}%)`,
      status: "pendente",
    });
  }

  // 2. Fetch all cargos with commission > 0
  const { data: cargosData } = await supabase.from("cargos").select("id, nome, comissao_percentual");
  const cargosComComissao = (cargosData || []).filter((c: any) => Number(c.comissao_percentual) > 0);

  if (cargosComComissao.length > 0) {
    const { data: usersData } = await supabase.from("usuarios").select("id, nome_completo, apelido, cargo_id, ativo").eq("ativo", true);
    const activeUsers = usersData || [];

    for (const cargo of cargosComComissao) {
      const cargoPercent = Number(cargo.comissao_percentual);
      const usersWithCargo = activeUsers.filter((u: any) => u.cargo_id === cargo.id);

      const vendedorName = responsavelVenda.toLowerCase().trim();
      const matchedVendedor = usersWithCargo.find((u: any) =>
        u.nome_completo.toLowerCase().includes(vendedorName) ||
        (u.apelido && u.apelido.toLowerCase().includes(vendedorName))
      );

      if (matchedVendedor) {
        commissions.push({
          usuario_id: matchedVendedor.id,
          mes_referencia: mesRef,
          valor_comissao: (valorAVista * cargoPercent) / 100,
          valor_base: valorAVista,
          cargo_referencia: cargo.nome,
          contrato_numero: contratoNumero,
          client_name: clientName,
          observacao: `${cargo.nome}: ${matchedVendedor.apelido || matchedVendedor.nome_completo} (${cargoPercent}%)`,
          status: "pendente",
        });
      } else if (usersWithCargo.length === 1) {
        const u = usersWithCargo[0];
        commissions.push({
          usuario_id: u.id,
          mes_referencia: mesRef,
          valor_comissao: (valorAVista * cargoPercent) / 100,
          valor_base: valorAVista,
          cargo_referencia: cargo.nome,
          contrato_numero: contratoNumero,
          client_name: clientName,
          observacao: `${cargo.nome}: ${u.apelido || u.nome_completo} (${cargoPercent}%)`,
          status: "pendente",
        });
      } else if (usersWithCargo.length > 1) {
        for (const u of usersWithCargo) {
          commissions.push({
            usuario_id: u.id,
            mes_referencia: mesRef,
            valor_comissao: (valorAVista * cargoPercent) / 100,
            valor_base: valorAVista,
            cargo_referencia: cargo.nome,
            contrato_numero: contratoNumero,
            client_name: clientName,
            observacao: `${cargo.nome}: ${u.apelido || u.nome_completo} (${cargoPercent}%)`,
            status: "pendente",
          });
        }
      }
    }
  }

  if (commissions.length > 0) {
    const { error } = await supabase.from("payroll_commissions").insert(commissions as any);
    if (error) {
      console.error("Erro ao inserir comissões:", error);
      return { count: 0, error: "Erro ao gerar comissões automáticas" };
    }
  }

  return { count: commissions.length };
}
