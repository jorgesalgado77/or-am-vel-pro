/**
 * LiberacaoTecnicaPanel — Full panel for the "Liberação Técnica" module.
 * Shows a ListView of clients in the liberation phase with filters, KPIs and actions.
 */
import { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { format, differenceInDays, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShieldCheck, Search, Filter, ChevronDown, FileText, BarChart3, ShoppingCart,
  CalendarDays, ArrowUpDown, Loader2, MapPin, DollarSign, RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { calculateRoundTripKm } from "@/hooks/useGoogleMapsKey";
import { PedagioModal } from "./PedagioModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  nova_solicitacao: "Nova Solicitação",
  em_negociacao: "Em Negociação",
  proposta_enviada: "Proposta Enviada",
  em_medicao: "Em Medição",
  em_andamento: "Em Andamento",
  aguardando_medida: "Aguardando Medida",
  medida_agendada: "Medida Agendada",
  em_execucao: "Em Execução",
  em_liberado: "Em Liberação",
  em_liberacao: "Em Liberação",
  em_compras: "Em Compras",
  enviado_compras: "Enviado Compras",
  para_entrega: "Para Entrega",
  para_montagem: "Para Montagem",
  assistencia: "Assistência",
  concluido: "Concluído",
  finalizado: "Finalizado",
  perdido: "Perdido",
  cancelado: "Cancelado",
  entregue: "Entregue",
};

const OPERATIONAL_STATUSES = new Set([
  "nova_solicitacao",
  "em_medicao",
  "em_liberado",
  "em_liberacao",
  "em_compras",
  "enviado_compras",
  "para_entrega",
  "para_montagem",
  "assistencia",
]);

const GENERIC_USER_LABELS = new Set([
  "",
  "sistema",
  "system",
  "admin",
  "administrador",
  "administrator",
  "usuario",
  "usuário",
  "user",
  "sem nome",
]);

function formatStatus(raw: string): string {
  if (!raw || raw === "—") return "—";
  return STATUS_LABELS[raw] || raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isGenericUserLabel(value: string | null | undefined) {
  return GENERIC_USER_LABELS.has(normalizeValue(value));
}

function pickBestHumanLabel(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim() && !isGenericUserLabel(value)) || "";
}

function getUserDisplayName(user: any) {
  if (!user) return "";

  const candidates = [
    user.nome_completo,
    user.name,
    user.full_name,
    user.apelido,
    typeof user.email === "string" ? user.email.split("@")[0] : "",
  ];

  return candidates.find((value) => typeof value === "string" && value.trim() && !isGenericUserLabel(value)) || "";
}

function buildAddress(parts: Array<string | null | undefined>) {
  const value = parts.filter(Boolean).map(part => String(part).trim()).filter(Boolean).join(", ");
  return value || null;
}

function computeValorComDesconto(sim: any): number | null {
  if (!sim) return null;
  const vt = Number(sim.valor_tela) || 0;
  if (!vt) return null;
  const d1 = Number(sim.desconto1) || 0;
  const d2 = Number(sim.desconto2) || 0;
  const d3 = Number(sim.desconto3) || 0;
  return vt * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100);
}

function extractAddressFromHtml(html: string | null | undefined) {
  const content = String(html || "");
  const match = content.match(/<strong>Endereço de entrega:\/strong>\s*([^<]+)\.?/i)
    || content.match(/<strong>Endereço:<\/strong>\s*([^<]+)\.?/i);
  return match?.[1]?.trim() || null;
}

function extractContractNumberFromHtml(html: string | null | undefined) {
  const content = String(html || "");
  const match = content.match(/<strong>(?:N[úu]mero do Contrato|Nº do Contrato|Contrato):?<\/strong>\s*([^<]+)\.?/i)
    || content.match(/contrato\s*(?:n[º°o]\s*)?[:#-]?\s*([\w./-]+)/i);
  return match?.[1]?.trim() || null;
}

function resolveSimulationValue(sim: any): number | null {
  if (!sim) return null;
  const direct = Number(sim.valor_com_desconto) || Number(sim.valor_final) || 0;
  if (direct > 0) return direct;
  return computeValorComDesconto(sim) || (Number(sim.valor_tela) || null);
}

function resolveOperationalStatus(clientStatus?: string | null, trackingStatus?: string | null, requestStatus?: string | null) {
  const client = String(clientStatus || "").trim();
  const tracking = String(trackingStatus || "").trim();
  const request = String(requestStatus || "").trim();

  if (OPERATIONAL_STATUSES.has(client)) return client;
  if (OPERATIONAL_STATUSES.has(tracking)) return tracking;
  if (request && request !== "concluido" && request !== "finalizado") return "em_medicao";
  return client || tracking || request || "—";
}

interface LiberacaoRow {
  id: string;
  clientId: string;
  status: string;
  statusRaw: string;
  numeroContrato: string;
  nomeCliente: string;
  endereco: string;
  km: number | null;
  dataFechamento: string | null;
  numAmbientes: number | null;
  valorAVista: number | null;
  valorAtualizado: number | null;
  valorLiberado: number | null;
  saldoPosNeg: number | null;
  comissao: number | null;
  dataMedicao: string | null;
  prazoLiberacao: string | null;
  dataFinalizado: string | null;
  diasEmLiberacao: number | null;
  tecnicoResponsavel: string | null;
  responsavelRefs: string[];
  tecnicoEnderecoBase: string | null;
  loja: string | null;
  codigoLoja: string | null;
  vendedorProjetista: string | null;
}

type DatePreset = "todos" | "mes_atual" | "mes_anterior" | "ultimos_6" | "ano_anterior" | "personalizado";
type SortField = "nomeCliente" | "dataFechamento" | "diasEmLiberacao" | "valorAVista" | "saldoPosNeg";
type SortDir = "asc" | "desc";

// ──── Column width defaults & storage key ────
const COL_STORAGE_KEY = "liberacao_col_widths";
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  status: 80, contrato: 100, loja: 130, vendedor: 120, nome: 150, endereco: 180,
  km: 65, fechamento: 100, amb: 60, vb: 100, vatualizado: 100, vliberado: 100,
  saldo: 90, comissao: 90, dtMedicao: 95, prazo: 70, finalizado: 95, dias: 65,
  tecnico: 110, acoes: 40,
};

function loadColWidths(): Record<string, number> {
  try {
    const saved = localStorage.getItem(COL_STORAGE_KEY);
    if (saved) return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_COL_WIDTHS };
}

// ──── Component ────

export function LiberacaoTecnicaPanel() {
  const [rows, setRows] = useState<LiberacaoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>("todos");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [vendedorFilter, setVendedorFilter] = useState("todos");
  const [lojaFilter, setLojaFilter] = useState("todos");

  // Sort
  const [sortField, setSortField] = useState<SortField>("dataFechamento");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(0);

  // Column widths (resizable)
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColWidths);
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  // Pedágio modal
  const [pedagioModal, setPedagioModal] = useState<{ open: boolean; row: LiberacaoRow | null }>({ open: false, row: null });

  // Current user context for address-based KM calculation & comissão
  const { currentUser } = useCurrentUser();

  // Save column widths to localStorage
  const saveColWidths = useCallback((widths: Record<string, number>) => {
    try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(widths)); } catch {}
  }, []);

  const resetColWidths = () => {
    const defaults = { ...DEFAULT_COL_WIDTHS };
    setColWidths(defaults);
    localStorage.removeItem(COL_STORAGE_KEY);
    toast.success("Largura das colunas restauradas ao padrão");
  };

  // Mouse handlers for column resize
  const onResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { col, startX: e.clientX, startW: colWidths[col] || DEFAULT_COL_WIDTHS[col] || 100 };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = ev.clientX - resizingRef.current.startX;
      const newW = Math.max(40, resizingRef.current.startW + diff);
      setColWidths(prev => {
        const updated = { ...prev, [resizingRef.current!.col]: newW };
        return updated;
      });
    };

    const onMouseUp = () => {
      if (resizingRef.current) {
        setColWidths(prev => {
          saveColWidths(prev);
          return prev;
        });
      }
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [colWidths, saveColWidths]);

  // ──── Date range resolver ────
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "todos":
        return { start: new Date("2000-01-01T00:00:00.000Z"), end: new Date("2100-12-31T23:59:59.999Z") };
      case "mes_atual":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "mes_anterior": {
        const prev = subMonths(now, 1);
        return { start: startOfMonth(prev), end: endOfMonth(prev) };
      }
      case "ultimos_6":
        return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
      case "ano_anterior": {
        const prevYear = subYears(now, 1);
        return { start: startOfYear(prevYear), end: endOfYear(prevYear) };
      }
      case "personalizado":
        return {
          start: customStart ? new Date(customStart) : startOfMonth(now),
          end: customEnd ? new Date(customEnd) : endOfMonth(now),
        };
      default:
        return { start: new Date("2000-01-01T00:00:00.000Z"), end: new Date("2100-12-31T23:59:59.999Z") };
    }
  }, [datePreset, customStart, customEnd]);

  // ──── Build address string helper ────
  const buildAddressStr = (parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(", ") || "—";

  // ──── Fetch data ────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    try {
      const [tenantRes, trackingRes, mrRes, usuariosRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("nome_loja, codigo_loja")
          .eq("id", tenantId)
          .maybeSingle(),
        supabase
          .from("client_tracking")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("measurement_requests")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("usuarios")
          .select("id, nome_completo, apelido, email, cargo_id, comissao_percentual, cep, endereco, numero, complemento, bairro, cidade, uf")
          .eq("tenant_id", tenantId),
      ]);

      if (trackingRes.error && mrRes.error) {
        console.error(trackingRes.error || mrRes.error);
        setRows([]);
        return;
      }

      const nomeLoja = tenantRes.data?.nome_loja || null;
      const codigoLoja = tenantRes.data?.codigo_loja || null;
      const allTracking = ((trackingRes.data as any[]) || []).filter((item) => item?.client_id);
      const allMeasurementRequests = ((mrRes.data as any[]) || []).filter((item) => item?.client_id);
      const allUsuarios = (usuariosRes.data as any[]) || [];

      const clientIds = [...new Set([
        ...allTracking.map((t) => t.client_id),
        ...allMeasurementRequests.map((mr) => mr.client_id),
      ])];

      if (clientIds.length === 0) {
        setRows([]);
        return;
      }

      const [clientsRes, dealroomRes] = await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .in("id", clientIds),
        supabase
          .from("dealroom_transactions")
          .select("client_id, nome_vendedor, valor_venda, created_at, numero_contrato")
          .eq("tenant_id", tenantId)
          .in("client_id", clientIds)
          .order("created_at", { ascending: false }),
      ]);

      const clientsMap = new Map<string, any>();
      (clientsRes.data || []).forEach((client: any) => clientsMap.set(client.id, client));

      const trackingMap = new Map<string, any>();
      allTracking.forEach((tracking: any) => {
        if (!trackingMap.has(tracking.client_id)) trackingMap.set(tracking.client_id, tracking);
      });

      const mrMap = new Map<string, any>();
      allMeasurementRequests.forEach((request: any) => {
        if (!mrMap.has(request.client_id)) mrMap.set(request.client_id, request);
      });

      const dealroomMap = new Map<string, any>();
      ((dealroomRes.data || []) as any[]).forEach((dealroom: any) => {
        if (dealroom.client_id && !dealroomMap.has(dealroom.client_id)) dealroomMap.set(dealroom.client_id, dealroom);
      });

      const toNumberOrNull = (value: any): number | null => {
        if (value === null || value === undefined || value === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const getUserTokens = (user: any) => [
        user?.id,
        user?.nome_completo,
        user?.apelido,
        user?.email,
        typeof user?.email === "string" ? user.email.split("@")[0] : null,
      ].map(normalizeValue).filter(Boolean);

      const findUserByReference = (reference: string | null | undefined) => {
        const normalizedReference = normalizeValue(reference);
        if (!normalizedReference) return null;
        return allUsuarios.find((user: any) => getUserTokens(user).includes(normalizedReference)) || null;
      };

      const getUserAddress = (user: any) => buildAddress([
        user?.endereco,
        user?.numero,
        user?.complemento,
        user?.bairro,
        user?.cidade,
        user?.uf,
        user?.cep,
      ]);

      const currentUserData = currentUser
        ? findUserByReference(currentUser.id) || findUserByReference(currentUser.email) || findUserByReference(currentUser.nome_completo) || currentUser
        : null;
      const currentUserAddr = getUserAddress(currentUserData);
      const userComissao = toNumberOrNull(currentUserData?.comissao_percentual) ?? 0;

      const mapped: LiberacaoRow[] = clientIds.map((clientId) => {
        const tracking = trackingMap.get(clientId);
        const mr = mrMap.get(clientId);
        const client = clientsMap.get(clientId);
        const dealroom = dealroomMap.get(clientId);
        const snapshot = mr?.client_snapshot || mr?.snapshot || {};
        const deliveryAddress = mr?.delivery_address || {};

        const tecnicoUser = findUserByReference(mr?.assigned_to)
          || findUserByReference(mr?.technician_name)
          || findUserByReference(tracking?.assigned_to)
          || findUserByReference(tracking?.tecnico_responsavel)
          || findUserByReference(tracking?.liberador)
          || findUserByReference(tracking?.conferente);

        const tecnicoNome = pickBestHumanLabel(
          getUserDisplayName(tecnicoUser),
          mr?.technician_name,
          mr?.assigned_to,
          tracking?.tecnico_responsavel,
          tracking?.liberador,
          tracking?.conferente,
        ) || null;

        const tecnicoEnderecoBase = getUserAddress(tecnicoUser);
        const vendedorProjetista = pickBestHumanLabel(
          tracking?.projetista,
          dealroom?.nome_vendedor,
          mr?.seller_name,
          snapshot?.seller_name,
          snapshot?.vendedor,
          snapshot?.projetista,
          client?.vendedor,
        ) || null;

        const city = deliveryAddress.city || deliveryAddress.cidade || mr?.cidade_entrega || snapshot?.delivery_address_city || snapshot?.cidade_entrega || snapshot?.cidade;
        const state = deliveryAddress.state || deliveryAddress.uf || mr?.uf_entrega || snapshot?.delivery_address_state || snapshot?.uf_entrega || snapshot?.uf;
        const fallbackHtmlAddress = extractAddressFromHtml(tracking?.contract_html || tracking?.html_contrato || snapshot?.contract_html || "");
        const enderecoStr = buildAddress([
          deliveryAddress.street || deliveryAddress.endereco || mr?.endereco_entrega || snapshot?.delivery_address_street || snapshot?.endereco_entrega || snapshot?.endereco || fallbackHtmlAddress,
          deliveryAddress.number || deliveryAddress.numero || mr?.numero_entrega || snapshot?.delivery_address_number || snapshot?.numero_entrega || snapshot?.numero,
          deliveryAddress.complement || deliveryAddress.complemento || snapshot?.delivery_address_complement || snapshot?.complemento_entrega || snapshot?.complemento,
          deliveryAddress.district || deliveryAddress.bairro || mr?.bairro_entrega || snapshot?.delivery_address_district || snapshot?.delivery_address_neighborhood || snapshot?.bairro_entrega || snapshot?.bairro,
          city && state ? `${city}-${state}` : (city || state || null),
          deliveryAddress.cep || mr?.cep_entrega || snapshot?.delivery_address_zip || snapshot?.cep_entrega || snapshot?.cep,
        ]) || "—";

        const rawStatus = resolveOperationalStatus(client?.status, tracking?.status, mr?.status);
        const dataFechamento = tracking?.data_fechamento || dealroom?.created_at || mr?.created_at || tracking?.created_at || null;
        const valorCalculado = computeValorComDesconto(mr?.last_sim) || computeValorComDesconto(snapshot?.last_sim);
        const valorAVista = toNumberOrNull(tracking?.valor_contrato)
          ?? toNumberOrNull(mr?.valor_venda_avista)
          ?? toNumberOrNull(snapshot?.valor_venda_avista)
          ?? toNumberOrNull(dealroom?.valor_venda)
          ?? valorCalculado
          ?? toNumberOrNull(tracking?.valor_atualizado)
          ?? null;
        const valorAtualizado = toNumberOrNull(tracking?.valor_atualizado) ?? valorAVista;
        const valorLiberado = toNumberOrNull(tracking?.valor_liberado);
        const saldoPosNeg = (valorAtualizado != null && valorLiberado != null) ? valorAtualizado - valorLiberado : null;
        const numAmbientesFromRequest = Array.isArray(mr?.ambientes) ? mr.ambientes.length : null;
        const numAmbientes = client?.quantidade_ambientes
          ?? tracking?.quantidade_ambientes
          ?? numAmbientesFromRequest
          ?? toNumberOrNull(snapshot?.quantidade_ambientes)
          ?? null;
        const comissaoPercentual = toNumberOrNull(tecnicoUser?.comissao_percentual) ?? userComissao;
        const comissao = (valorAVista != null && comissaoPercentual > 0)
          ? Math.round((valorAVista * comissaoPercentual / 100) * 100) / 100
          : (toNumberOrNull(tracking?.comissao_valor) ?? null);

        let dataFinalizado: string | null = null;
        const requestStatus = String(mr?.status || "").toLowerCase();
        if (["concluido", "finalizado"].includes(requestStatus) && mr?.updated_at) {
          dataFinalizado = mr.updated_at;
        }

        let diasEmLiberacao: number | null = null;
        if (dataFechamento) {
          const start = new Date(dataFechamento);
          const end = dataFinalizado ? new Date(dataFinalizado) : new Date();
          diasEmLiberacao = differenceInDays(end, start);
          if (diasEmLiberacao < 0) diasEmLiberacao = 0;
        }

        return {
          id: tracking?.id || mr?.id || clientId,
          clientId,
          status: formatStatus(rawStatus),
          statusRaw: rawStatus,
          numeroContrato: tracking?.numero_contrato || mr?.contract_number || snapshot?.contract_number || snapshot?.numero_contrato || dealroom?.numero_contrato || "—",
          nomeCliente: tracking?.nome_cliente || mr?.nome_cliente || snapshot?.nome_cliente || snapshot?.nome || client?.nome || "—",
          endereco: enderecoStr,
          km: null,
          dataFechamento,
          numAmbientes,
          valorAVista,
          valorAtualizado,
          valorLiberado,
          saldoPosNeg,
          comissao,
          dataMedicao: mr?.updated_at || mr?.created_at || null,
          prazoLiberacao: null,
          dataFinalizado,
          diasEmLiberacao,
          tecnicoResponsavel: tecnicoNome,
          tecnicoEnderecoBase,
          loja: nomeLoja,
          codigoLoja,
          vendedorProjetista,
        };
      });

      const isAdminOrGerente = currentUser?.cargo_nome
        ? ["administrador", "admin", "gerente"].includes(currentUser.cargo_nome.toLowerCase().trim())
        : false;

      const currentUserReferences = currentUser ? [
        currentUser.id,
        currentUser.nome_completo,
        currentUser.apelido,
        currentUser.email,
        typeof currentUser.email === "string" ? currentUser.email.split("@")[0] : null,
      ].map(normalizeValue).filter(Boolean) : [];

      const filteredByResponsible = (!currentUser || isAdminOrGerente)
        ? mapped
        : mapped.filter((row) => {
            const tecnicoRef = normalizeValue(row.tecnicoResponsavel);
            return !!tecnicoRef && currentUserReferences.includes(tecnicoRef);
          });

      setRows(filteredByResponsible);

      if (currentUserAddr && currentUserAddr !== "—") {
        calculateDistances(tenantId, filteredByResponsible, currentUserAddr);
      }
    } catch (err) {
      console.error("LiberacaoTecnicaPanel fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Calculate KM distances using Google Maps API (uses row base address and falls back to current user address)
  const calculateDistances = useCallback(async (tenantId: string, currentRows: LiberacaoRow[], baseAddress: string) => {
    try {
      const { data: apiKeyData } = await (supabase as any)
        .from("api_keys")
        .select("api_key")
        .eq("tenant_id", tenantId)
        .eq("provider", "google_maps")
        .eq("is_active", true)
        .maybeSingle();

      if (!apiKeyData?.api_key) return;

      const updates: { id: string; km: number }[] = [];
      for (const row of currentRows) {
        if (!row.endereco || row.endereco === "—") continue;

        const originAddress = row.tecnicoEnderecoBase || baseAddress;
        if (!originAddress) continue;

        const result = await calculateRoundTripKm(apiKeyData.api_key, originAddress, row.endereco);
        if (result) {
          updates.push({ id: row.id, km: result.km });
        }
      }

      if (updates.length > 0) {
        setRows(prev => prev.map(r => {
          const upd = updates.find(u => u.id === r.id);
          return upd ? { ...r, km: upd.km } : r;
        }));
      }
    } catch (err) {
      console.error("Error calculating distances", err);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ──── Unique values for filters ────
  const uniqueStatuses = useMemo(() => [...new Set(rows.map(r => r.status))].sort(), [rows]);
  const uniqueVendedores = useMemo(() => [...new Set(rows.map(r => r.vendedorProjetista).filter(Boolean) as string[])].sort(), [rows]);
  const uniqueLojas = useMemo(() => {
    const lojas = rows.map(r => r.loja && r.codigoLoja ? `${r.loja} (${r.codigoLoja})` : r.loja).filter(Boolean) as string[];
    return [...new Set(lojas)].sort();
  }, [rows]);

  // ──── Filter + Sort + Paginate ────
  const filteredRows = useMemo(() => {
    let result = rows;

    // Date filter
    result = result.filter(r => {
      if (datePreset === "todos") return true;
      if (!r.dataFechamento) return true;
      const d = new Date(r.dataFechamento);
      return d >= dateRange.start && d <= dateRange.end;
    });

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        r.nomeCliente.toLowerCase().includes(q) ||
        r.numeroContrato.toLowerCase().includes(q) ||
        (r.endereco && r.endereco.toLowerCase().includes(q))
      );
    }

    // Status
    if (statusFilter !== "todos") {
      result = result.filter(r => r.status === statusFilter);
    }

    // Vendedor/Projetista
    if (vendedorFilter !== "todos") {
      result = result.filter(r => r.vendedorProjetista === vendedorFilter);
    }

    // Loja
    if (lojaFilter !== "todos") {
      result = result.filter(r => {
        const lojaStr = r.loja && r.codigoLoja ? `${r.loja} (${r.codigoLoja})` : r.loja;
        return lojaStr === lojaFilter;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let va: any = a[sortField];
      let vb: any = b[sortField];
      if (va == null) va = sortDir === "asc" ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });

    return result;
  }, [rows, dateRange, searchTerm, statusFilter, vendedorFilter, lojaFilter, sortField, sortDir, datePreset]);

  const paginatedRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);

  // ──── Sort handler ────
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      {children}
      <ArrowUpDown className={cn("h-3 w-3", sortField === field ? "text-primary" : "text-muted-foreground/50")} />
    </button>
  );

  // ──── Client actions ────
  const handleViewContract = (row: LiberacaoRow) => {
    window.dispatchEvent(new CustomEvent("navigate-to-contracts"));
    toast.info(`Abrindo contrato de ${row.nomeCliente}...`);
  };

  const handleApuracao = (row: LiberacaoRow) => {
    toast.info(`Apuração de ${row.nomeCliente} — funcionalidade em desenvolvimento`);
  };

  const handleEnviarCompras = async (row: LiberacaoRow) => {
    const tenantId = await getResolvedTenantId();
    if (!tenantId) return;

    const { error } = await (supabase as any)
      .from("measurement_requests")
      .update({ status: "enviado_compras", updated_at: new Date().toISOString() })
      .eq("client_id", row.clientId)
      .eq("tenant_id", tenantId);

    if (error) {
      toast.error("Erro ao enviar para compras");
    } else {
      toast.success(`${row.nomeCliente} enviado para Compras!`);
      fetchData();
    }
  };

  const handleInformarPedagios = (row: LiberacaoRow) => {
    setPedagioModal({ open: true, row });
  };

  // Resizable header helper
  const ResizableHead = ({ col, children, className, style: extraStyle }: { col: string; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <TableHead className={cn("relative select-none", className)} style={{ width: colWidths[col], minWidth: 40, ...extraStyle }}>
      {children}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-10"
        onMouseDown={e => onResizeStart(col, e)}
      />
    </TableHead>
  );

  // ──── KPI summary ────
  const kpis = useMemo(() => {
    const total = filteredRows.length;
    const totalValor = filteredRows.reduce((sum, r) => sum + (r.valorAVista || 0), 0);
    const avgDias = total > 0
      ? Math.round(filteredRows.reduce((sum, r) => sum + (r.diasEmLiberacao || 0), 0) / total)
      : 0;
    const finalizados = filteredRows.filter(r => r.dataFinalizado).length;
    return { total, totalValor, avgDias, finalizados };
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Total em Liberação</p>
            <p className="text-xl font-bold text-foreground">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Valor Total</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(kpis.totalValor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Média Dias Liberação</p>
            <p className="text-xl font-bold text-foreground">{kpis.avgDias} dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Finalizados</p>
            <p className="text-xl font-bold text-emerald-600">{kpis.finalizados}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <Label className="text-[11px] text-muted-foreground">Período</Label>
              <Select value={datePreset} onValueChange={(v) => { setDatePreset(v as DatePreset); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os períodos</SelectItem>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="ultimos_6">Últimos 6 Meses</SelectItem>
                  <SelectItem value="ano_anterior">Ano Anterior</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {datePreset === "personalizado" && (
              <>
                <div>
                  <Label className="text-[11px] text-muted-foreground">De</Label>
                  <Input type="date" className="h-8 text-xs w-[130px]" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Até</Label>
                  <Input type="date" className="h-8 text-xs w-[130px]" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              </>
            )}

            <div className="min-w-[140px]">
              <Label className="text-[11px] text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {uniqueStatuses.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px]">
              <Label className="text-[11px] text-muted-foreground">Vendedor / Projetista</Label>
              <Select value={vendedorFilter} onValueChange={(v) => { setVendedorFilter(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {uniqueVendedores.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px]">
              <Label className="text-[11px] text-muted-foreground">Loja</Label>
              <Select value={lojaFilter} onValueChange={(v) => { setLojaFilter(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {uniqueLojas.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <Label className="text-[11px] text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-7"
                  placeholder="Nome, contrato, CPF/CNPJ..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                />
              </div>
            </div>

            <Badge variant="secondary" className="h-8 text-xs px-3">
              {filteredRows.length} resultado(s)
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ListView Table */}
      <Card>
        <CardContent className="p-0">
          {/* Reset columns button */}
          <div className="flex items-center justify-end px-3 pt-2 pb-1">
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground" onClick={resetColWidths}>
              <RotateCcw className="h-3 w-3" /> Resetar Colunas
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table style={{ tableLayout: "fixed" }}>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <ResizableHead col="status">Status</ResizableHead>
                    <ResizableHead col="contrato">Contrato</ResizableHead>
                    <ResizableHead col="loja" className="hidden md:table-cell">Loja</ResizableHead>
                    <ResizableHead col="vendedor" className="hidden md:table-cell">Vendedor/Proj.</ResizableHead>
                    <ResizableHead col="nome">
                      <SortHeader field="nomeCliente">Nome Cliente</SortHeader>
                    </ResizableHead>
                    <ResizableHead col="endereco" className="hidden lg:table-cell">Endereço</ResizableHead>
                    <ResizableHead col="km" className="text-center hidden lg:table-cell">KM</ResizableHead>
                    <ResizableHead col="fechamento">
                      <SortHeader field="dataFechamento">Fechamento</SortHeader>
                    </ResizableHead>
                    <ResizableHead col="amb" className="text-center hidden md:table-cell">Amb.</ResizableHead>
                    <ResizableHead col="vb" className="text-right">
                      <SortHeader field="valorAVista">VB (à Vista)</SortHeader>
                    </ResizableHead>
                    <ResizableHead col="vatualizado" className="text-right hidden md:table-cell">V. Atualizado</ResizableHead>
                    <ResizableHead col="vliberado" className="text-right hidden lg:table-cell">V. Liberado</ResizableHead>
                    <ResizableHead col="saldo" className="text-right">
                      <SortHeader field="saldoPosNeg">Saldo</SortHeader>
                    </ResizableHead>
                    <ResizableHead col="comissao" className="text-right hidden md:table-cell">Comissão</ResizableHead>
                    <ResizableHead col="dtMedicao" className="hidden lg:table-cell">Dt. Medição</ResizableHead>
                    <ResizableHead col="prazo" className="text-center hidden xl:table-cell">Prazo</ResizableHead>
                    <ResizableHead col="finalizado" className="hidden xl:table-cell">Finalizado</ResizableHead>
                    <ResizableHead col="dias" className="text-center">
                      <SortHeader field="diasEmLiberacao">Dias</SortHeader>
                    </ResizableHead>
                    <ResizableHead col="tecnico" className="hidden md:table-cell">Técnico</ResizableHead>
                    <ResizableHead col="acoes" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-10 text-muted-foreground text-sm">
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map(row => (
                      <TableRow key={row.id} className="text-xs hover:bg-muted/40">
                        <TableCell><Badge variant="outline" className="text-[9px] px-1.5 capitalize">{row.status}</Badge></TableCell>
                        <TableCell className="font-mono text-[11px]">{row.numeroContrato}</TableCell>
                        <TableCell className="hidden md:table-cell text-[11px] truncate">
                          {row.loja ? <span title={row.codigoLoja ? `${row.loja} (${row.codigoLoja})` : row.loja}>{row.loja}{row.codigoLoja ? ` (${row.codigoLoja})` : ""}</span> : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell truncate">{row.vendedorProjetista || "—"}</TableCell>
                        <TableCell className="font-medium">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="text-left hover:text-primary transition-colors flex items-center gap-1">
                                {row.nomeCliente}<ChevronDown className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                              <DropdownMenuItem onClick={() => handleViewContract(row)} className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" /> Ver Contrato Fechado</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleApuracao(row)} className="gap-2 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Apuração</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEnviarCompras(row)} className="gap-2 text-xs"><ShoppingCart className="h-3.5 w-3.5" /> Enviar para Compras</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleInformarPedagios(row)} className="gap-2 text-xs"><MapPin className="h-3.5 w-3.5" /> Informar Pedágios</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground truncate" title={row.endereco}>{row.endereco}</TableCell>
                        <TableCell className="hidden lg:table-cell text-center font-mono text-[11px]">{row.km != null ? `${row.km}` : "—"}</TableCell>
                        <TableCell>{row.dataFechamento ? format(new Date(row.dataFechamento), "dd/MM/yy") : "—"}</TableCell>
                        <TableCell className="text-center hidden md:table-cell">{row.numAmbientes ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{row.valorAVista != null ? formatCurrency(row.valorAVista) : "—"}</TableCell>
                        <TableCell className="text-right hidden md:table-cell font-mono">{row.valorAtualizado != null ? formatCurrency(row.valorAtualizado) : "—"}</TableCell>
                        <TableCell className="text-right hidden lg:table-cell font-mono">{row.valorLiberado != null ? formatCurrency(row.valorLiberado) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {row.saldoPosNeg != null ? (
                            <span className={cn(row.saldoPosNeg >= 0 ? "text-emerald-600" : "text-destructive")}>{row.saldoPosNeg >= 0 ? "+" : ""}{formatCurrency(row.saldoPosNeg)}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell font-mono">{row.comissao != null ? formatCurrency(row.comissao) : "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell">{row.dataMedicao ? format(new Date(row.dataMedicao), "dd/MM/yy") : "—"}</TableCell>
                        <TableCell className="text-center hidden xl:table-cell">{row.prazoLiberacao ?? "—"}</TableCell>
                        <TableCell className="hidden xl:table-cell">{row.dataFinalizado ? format(new Date(row.dataFinalizado), "dd/MM/yy") : "—"}</TableCell>
                        <TableCell className="text-center">
                          {row.diasEmLiberacao != null ? (
                            <Badge variant={row.diasEmLiberacao > 15 ? "destructive" : row.diasEmLiberacao > 7 ? "secondary" : "outline"} className="text-[10px] px-1.5">{row.diasEmLiberacao}d</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell truncate">{row.tecnicoResponsavel || "—"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6"><ChevronDown className="h-3 w-3" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => handleViewContract(row)} className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" /> Ver Contrato</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleApuracao(row)} className="gap-2 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Apuração</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEnviarCompras(row)} className="gap-2 text-xs"><ShoppingCart className="h-3.5 w-3.5" /> Enviar Compras</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleInformarPedagios(row)} className="gap-2 text-xs"><MapPin className="h-3.5 w-3.5" /> Informar Pedágios</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t">
              <span className="text-xs text-muted-foreground">Pág. {page + 1} de {totalPages} ({filteredRows.length} registros)</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pedagioModal.row && (
        <PedagioModal
          open={pedagioModal.open}
          onOpenChange={(open) => setPedagioModal(prev => ({ ...prev, open }))}
          clientId={pedagioModal.row.clientId}
          clientName={pedagioModal.row.nomeCliente}
          trackingId={pedagioModal.row.id}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
