/**
 * ClientContextBuilder — Builds a DealContext from Supabase data.
 *
 * Single responsibility: fetch and assemble all client-related data
 * into a unified DealContext for the CommercialDecisionEngine.
 */

import { supabase } from "@/lib/supabaseClient";
import { calcLeadTemperature } from "@/lib/leadTemperature";
import { detectDiscFromMessages, type VendaZapMessageLike } from "@/lib/vendazapAnalysis";
import type { DealContext } from "./types";
import type { FormaPagamento, CreditRateData, BoletoRateData } from "@/lib/financing";

// ==================== TYPES ====================

interface ClientRow {
  id: string;
  nome: string;
  status: string;
  updated_at: string;
  created_at: string;
  telefone1?: string | null;
  email?: string | null;
  vendedor?: string | null;
  lead_temperature?: string | null;
}

interface SimulationRow {
  id: string;
  valor_tela: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  plus_percentual?: number;
  forma_pagamento: string;
  parcelas: number;
  valor_entrada?: number;
  indicador_percentual?: number;
  carencia_dias?: number;
}

interface TrackingMessageRow {
  mensagem: string;
  remetente_tipo: string;
  created_at: string;
}

export interface BuildContextOptions {
  /** Pre-loaded client data (avoids extra fetch) */
  client?: ClientRow;
  /** Pre-loaded simulation */
  simulation?: SimulationRow | null;
  /** Pre-loaded messages */
  messages?: TrackingMessageRow[];
  /** Tracking ID for message lookup */
  trackingId?: string;
  /** All tracking IDs for grouped conversations */
  trackingIds?: string[];
}

// ==================== BUILDER ====================

export class ClientContextBuilder {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Build a complete DealContext for a client.
   * Fetches missing data from Supabase as needed.
   */
  async build(clientId: string, opts: BuildContextOptions = {}): Promise<DealContext> {
    // 1. Client data
    const client = opts.client || await this.fetchClient(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    // 2. Parallel fetches for simulation, messages, discount options, rates
    const [simulation, messages, discountOpts, rates] = await Promise.all([
      opts.simulation !== undefined
        ? Promise.resolve(opts.simulation)
        : this.fetchLatestSimulation(clientId),
      opts.messages
        ? Promise.resolve(opts.messages)
        : this.fetchMessages(clientId, opts.trackingId, opts.trackingIds),
      this.fetchDiscountOptions(),
      this.fetchRates(),
    ]);

    // 3. Calculate derived data
    const daysInactive = Math.floor(
      (Date.now() - new Date(client.updated_at || client.created_at).getTime()) / 86400000
    );

    const temperature = (client.lead_temperature as DealContext["customer"]["temperature"]) ||
      calcLeadTemperature({
        status: client.status,
        diasSemResposta: daysInactive,
        temSimulacao: !!simulation,
      });

    const discInsight = messages.length > 0
      ? detectDiscFromMessages(messages as VendaZapMessageLike[])
      : null;

    // 4. Build context
    const valorTela = simulation?.valor_tela || 0;
    const indicador = simulation?.indicador_percentual || 0;
    const formaPagamento = (simulation?.forma_pagamento || "A vista") as FormaPagamento;

    const ctx: DealContext = {
      tenant_id: this.tenantId,

      customer: {
        id: clientId,
        name: client.nome,
        status: client.status || "novo",
        temperature,
        disc_profile: discInsight?.profile || undefined,
        days_inactive: daysInactive,
        has_simulation: !!simulation,
        phone: client.telefone1 || null,
      },

      pricing: {
        total_price: valorTela,
        commission_indicator: indicador,
      },

      payment: {
        forma_pagamento: formaPagamento,
        parcelas: simulation?.parcelas || 1,
        valor_entrada: simulation?.valor_entrada || 0,
        plus_percentual: simulation?.plus_percentual || 0,
        carencia_dias: simulation?.carencia_dias as 30 | 60 | 90 | undefined,
        credit_rates: rates.creditRates,
        credit_rates_full: rates.creditRatesFull,
        boleto_rates: rates.boletoRates,
        boleto_rates_full: rates.boletoRatesFull,
      },

      discounts: {
        desconto1: simulation?.desconto1 || 0,
        desconto2: simulation?.desconto2 || 0,
        desconto3: simulation?.desconto3 || 0,
        available_options: discountOpts,
      },

      negotiation_history: messages.map((m) => ({
        mensagem: m.mensagem,
        remetente_tipo: m.remetente_tipo,
        created_at: m.created_at,
      })),
    };

    return ctx;
  }

  // ─── Private fetchers ─────────────────────────────────────

  private async fetchClient(clientId: string): Promise<ClientRow | null> {
    const { data } = await supabase
      .from("clients")
      .select("id, nome, status, updated_at, created_at, telefone1, email, vendedor, lead_temperature")
      .eq("id", clientId)
      .maybeSingle();
    return data as ClientRow | null;
  }

  private async fetchLatestSimulation(clientId: string): Promise<SimulationRow | null> {
    const { data } = await supabase
      .from("simulations")
      .select("id, valor_tela, desconto1, desconto2, desconto3, plus_percentual, forma_pagamento, parcelas, valor_entrada, indicador_percentual, carencia_dias")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as unknown as SimulationRow | null;
  }

  private async fetchMessages(
    clientId: string,
    trackingId?: string,
    trackingIds?: string[],
  ): Promise<TrackingMessageRow[]> {
    // If we have tracking IDs, fetch messages from them
    const ids = trackingIds || [];
    if (trackingId && !ids.includes(trackingId)) ids.push(trackingId);

    if (ids.length === 0) {
      // Try to find tracking records for this client
      const { data: trackings } = await supabase
        .from("client_tracking")
        .select("id")
        .eq("client_id", clientId)
        .limit(5);
      if (trackings) {
        ids.push(...trackings.map((t: { id: string }) => t.id));
      }
    }

    if (ids.length === 0) return [];

    const { data } = await supabase
      .from("tracking_messages")
      .select("mensagem, remetente_tipo, created_at")
      .in("tracking_id", ids)
      .order("created_at", { ascending: true })
      .limit(30);

    return (data || []) as TrackingMessageRow[];
  }

  private async fetchDiscountOptions(): Promise<DealContext["discounts"]["available_options"]> {
    const { data } = await supabase
      .from("discount_options")
      .select("field_name, percentages")
      .eq("tenant_id", this.tenantId);

    if (!data || data.length === 0) return undefined;

    const map: Record<string, number[]> = {};
    for (const row of data as Array<{ field_name: string; percentages: number[] }>) {
      map[row.field_name] = row.percentages.map(Number).sort((a, b) => a - b);
    }

    return {
      desconto1: map["desconto1"] || [0],
      desconto2: map["desconto2"] || [0],
      desconto3: map["desconto3"] || [0],
      plus: map["plus"] || [0],
    };
  }

  private async fetchRates(): Promise<{
    creditRates: Record<number, number>;
    creditRatesFull: Record<number, CreditRateData>;
    boletoRates: Record<number, number>;
    boletoRatesFull: Record<number, BoletoRateData>;
  }> {
    const [creditRes, boletoRes] = await Promise.all([
      supabase
        .from("credit_rates" as unknown as "clients")
        .select("*")
        .eq("tenant_id", this.tenantId),
      supabase
        .from("boleto_rates" as unknown as "clients")
        .select("*")
        .eq("tenant_id", this.tenantId),
    ]);

    const creditRates: Record<number, number> = {};
    const creditRatesFull: Record<number, CreditRateData> = {};
    for (const r of (creditRes.data || []) as unknown as Array<CreditRateData & { parcelas: number; coeficiente: number }>) {
      creditRates[r.parcelas] = r.coeficiente;
      creditRatesFull[r.parcelas] = r;
    }

    const boletoRates: Record<number, number> = {};
    const boletoRatesFull: Record<number, BoletoRateData> = {};
    for (const r of (boletoRes.data || []) as unknown as Array<BoletoRateData & { parcelas: number; coeficiente: number }>) {
      boletoRates[r.parcelas] = r.coeficiente;
      boletoRatesFull[r.parcelas] = r;
    }

    return { creditRates, creditRatesFull, boletoRates, boletoRatesFull };
  }
}

// ==================== FACTORY ====================

const builderCache = new Map<string, ClientContextBuilder>();

export function getContextBuilder(tenantId: string): ClientContextBuilder {
  let builder = builderCache.get(tenantId);
  if (!builder) {
    builder = new ClientContextBuilder(tenantId);
    builderCache.set(tenantId, builder);
  }
  return builder;
}
