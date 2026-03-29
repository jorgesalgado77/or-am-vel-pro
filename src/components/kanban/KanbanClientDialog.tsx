/**
 * Expanded client detail dialog for the Kanban board.
 */
import { useState, useEffect } from "react";
import { differenceInDays } from "date-fns";
import { format, addDays, isPast, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Handshake, Pencil, Trash2, History, FileText, Phone, Mail, User, Hash, Clock,
  AlertTriangle, CalendarIcon, FileQuestion, Paperclip, ExternalLink, Download, ArrowRight,
  Send, ClipboardList, Calculator, CheckCircle2, Ruler, Award,
} from "lucide-react";
import { BriefingModal } from "@/components/BriefingModal";
import { MeasurementRequestModal } from "./MeasurementRequestModal";
import { supabase } from "@/lib/supabaseClient";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/financing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { KANBAN_COLUMNS, type Client, type LastSimInfo } from "./kanbanTypes";
import type { ClientTrackingRecord } from "@/hooks/useClientTracking";

interface LeadAttachment {
  id: string;
  file_name: string;
  file_url: string | null;
  file_size: number;
  file_type: string | null;
  created_at: string;
}

interface BriefingInfo {
  exists: boolean;
  created_at: string | null;
}

interface SimulationInfo {
  exists: boolean;
  last_date: string | null;
  count: number;
}

interface MeasurementRequestInfo {
  exists: boolean;
  status: string | null;
  created_at: string | null;
}

interface KanbanClientDialogProps {
  client: Client | null;
  onClose: () => void;
  lastSim: LastSimInfo | undefined;
  budgetValidityDays: number;
  cargoNome: string;
  canEdit: boolean;
  canDelete: boolean;
  indicadorMap: Record<string, { nome: string; comissao: number }>;
  usuarios: { id: string; nome_completo: string; cargo_nome?: string | null; ativo: boolean }[];
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
  onSimulate: (client: Client) => void;
  onHistory: (client: Client) => void;
  onContracts: (client: Client) => void;
  onClientUpdate: (updatedClient: Client, shouldMoveToNegociacao: boolean) => void;
}

export function KanbanClientDialog({
  client, onClose, lastSim, budgetValidityDays, cargoNome, canEdit, canDelete,
  indicadorMap, usuarios, onEdit, onDelete, onSimulate, onHistory, onContracts, onClientUpdate,
}: KanbanClientDialogProps) {
  const [showBriefing, setShowBriefing] = useState(false);
  const [showMeasurementRequest, setShowMeasurementRequest] = useState(false);
  const [attachments, setAttachments] = useState<LeadAttachment[]>([]);
  const [briefingInfo, setBriefingInfo] = useState<BriefingInfo>({ exists: false, created_at: null });
  const [simInfo, setSimInfo] = useState<SimulationInfo>({ exists: false, last_date: null, count: 0 });
  const [trackingRecord, setTrackingRecord] = useState<ClientTrackingRecord | null>(null);
  const [measurementInfo, setMeasurementInfo] = useState<MeasurementRequestInfo>({ exists: false, status: null, created_at: null });
  const [sending, setSending] = useState(false);

  const isAdminOrManager = cargoNome.includes("administrador") || cargoNome.includes("gerente");
  const isAdmin = cargoNome.includes("administrador");
  const isLiberadorTecnicoConferente = cargoNome.includes("liberador") || cargoNome.includes("tecnico") || cargoNome.includes("técnico") || cargoNome.includes("conferente");
  const status = (client as any)?.status || "novo";
  const isNovo = status === "novo";
  const hasContract = !!trackingRecord;

  useEffect(() => {
    if (!client?.id) {
      setAttachments([]);
      setBriefingInfo({ exists: false, created_at: null });
      setSimInfo({ exists: false, last_date: null, count: 0 });
      setTrackingRecord(null);
      setMeasurementInfo({ exists: false, status: null, created_at: null });
      return;
    }

    // Load attachments
    supabase
      .from("lead_attachments" as any)
      .select("id, file_name, file_url, file_size, file_type, created_at")
      .or(`client_id.eq.${client.id},client_name.eq.${client.nome}`)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        if (data) setAttachments(data as LeadAttachment[]);
      });

    // Load briefing info
    supabase
      .from("client_briefings" as any)
      .select("created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          setBriefingInfo({ exists: true, created_at: data[0].created_at });
        } else {
          setBriefingInfo({ exists: false, created_at: null });
        }
      });

    // Load simulation info
    supabase
      .from("simulations" as any)
      .select("created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          setSimInfo({ exists: true, last_date: data[0].created_at, count: data.length });
        } else {
          setSimInfo({ exists: false, last_date: null, count: 0 });
        }
      });

    // Load contract info from client_contracts (source of truth)
    supabase
      .from("client_contracts")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          const contract = data[0];
          setTrackingRecord({
            id: contract.id,
            client_id: contract.client_id,
            numero_contrato: contract.numero_contrato || "",
            nome_cliente: contract.nome_cliente || "",
            cpf_cnpj: contract.cpf_cnpj || null,
            quantidade_ambientes: contract.quantidade_ambientes || 0,
            valor_contrato: Number(contract.valor_contrato) || 0,
            data_fechamento: contract.data_fechamento || contract.created_at,
            projetista: contract.projetista || null,
            status: contract.status || "ativo",
            comissao_percentual: null,
            comissao_valor: null,
            comissao_status: null,
            created_at: contract.created_at,
          } as ClientTrackingRecord);
        } else {
          setTrackingRecord(null);
        }
      });

    // Load measurement request info
    const fetchMeasurement = () => {
      supabase
        .from("measurement_requests" as any)
        .select("status, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }: any) => {
          if (data && data.length > 0) {
            setMeasurementInfo({ exists: true, status: data[0].status, created_at: data[0].created_at });
          } else {
            setMeasurementInfo({ exists: false, status: null, created_at: null });
          }
        });
    };
    fetchMeasurement();

    // Realtime subscription for measurement requests
    const mrChannel = supabase
      .channel(`mr-dialog-${client.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "measurement_requests", filter: `client_id=eq.${client.id}` },
        () => fetchMeasurement()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(mrChannel);
    };
  }, [client?.id, client?.nome]);

  if (!client) return null;

  const isExpired = lastSim ? isPast(addDays(new Date(lastSim.created_at), budgetValidityDays)) : false;
  
  // If client has a contract, show "Fechado" tag
  const effectiveStatus = hasContract ? "fechado" : status;
  const colCfg = KANBAN_COLUMNS.find(c => c.id === effectiveStatus);
  const daysInColumn = differenceInDays(new Date(), new Date((client as any).updated_at || client.created_at));

  const handleAssignVendedor = async (val: string) => {
    const newVendedor = val === "__none__" ? null : val;
    const oldVendedor = client.vendedor;
    const { error } = await supabase
      .from("clients")
      .update({ vendedor: newVendedor })
      .eq("id", client.id);
    if (error) { toast.error("Erro ao atribuir responsável"); return; }

    const userInfo = getAuditUserInfo();
    logAudit({
      acao: "lead_atribuido", entidade: "client", entidade_id: client.id,
      detalhes: { cliente: client.nome, de: oldVendedor || "Nenhum", para: newVendedor || "Nenhum" },
      ...userInfo,
    });

    if (newVendedor) {
      const tenantId = await getResolvedTenantId();
      supabase.from("tracking_messages").insert({
        tenant_id: tenantId, tipo: "sistema", canal: "interno",
        remetente: userInfo.usuario_nome || "Sistema",
        conteudo: `📋 O lead "${client.nome}" foi atribuído a você por ${userInfo.usuario_nome || "um administrador"}.`,
        destinatario: newVendedor,
      } as any).then(() => {});
    }

    toast.success(
      newVendedor
        ? `✅ "${client.nome}" atribuído a ${newVendedor}. Notificação enviada!`
        : `"${client.nome}" desvinculado.`,
      { duration: 5000 }
    );

    const updatedClient = { ...client, vendedor: newVendedor } as any;
    onClientUpdate(updatedClient, false);
  };

  const handleSendToResponsavel = async () => {
    if (!client.vendedor) {
      toast.error("Selecione um responsável antes de enviar");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ vendedor: client.vendedor, status: "novo" } as any)
        .eq("id", client.id);
      if (error) throw error;

      const userInfo = getAuditUserInfo();
      const tenantId = await getResolvedTenantId();

      await supabase.from("tracking_messages").insert({
        tenant_id: tenantId, tipo: "sistema", canal: "interno",
        remetente: userInfo.usuario_nome || "Sistema",
        conteudo: `🚀 O lead "${client.nome}" foi enviado para seu atendimento por ${userInfo.usuario_nome || "um administrador"}. ${briefingInfo.exists ? "✅ Briefing preenchido." : "⚠️ Sem briefing."} ${simInfo.exists ? `✅ ${simInfo.count} simulação(ões).` : "⚠️ Sem simulações."}`,
        destinatario: client.vendedor,
      } as any);

      logAudit({
        acao: "lead_enviado_responsavel", entidade: "client", entidade_id: client.id,
        detalhes: { cliente: client.nome, responsavel: client.vendedor },
        ...userInfo,
      });

      toast.success(`🚀 "${client.nome}" enviado para ${client.vendedor}!`, { duration: 5000 });
      onClientUpdate({ ...client } as any, false);
      onClose();
    } catch (err: any) {
      toast.error("Erro ao enviar: " + (err.message || "erro desconhecido"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{client.nome}</DialogTitle>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Hash className="h-3 w-3" />{(client as any).numero_orcamento || "—"}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />{format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
            </div>
            {/* Status tag: show Fechado if contract exists */}
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0",
                hasContract && "border-success text-success bg-success/10"
              )}
              style={!hasContract ? { borderColor: colCfg?.color, color: colCfg?.color } : undefined}
            >
              {hasContract ? "✅ Fechado" : `${colCfg?.icon} ${colCfg?.label}`}
            </Badge>
          </div>
        </DialogHeader>

        <Separator className="my-3" />

        <div className="flex-1 overflow-y-auto pr-1 -mr-1" style={{ maxHeight: "calc(90vh - 200px)" }}>
          <div className="space-y-4">
            {/* Client info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {client.cpf && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{client.cpf}</span>
                </div>
              )}
              {client.telefone1 && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{client.telefone1}</span>
                </div>
              )}
              {client.telefone2 && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{client.telefone2}</span>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-2 text-sm col-span-1 sm:col-span-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{client.email}</span>
                </div>
              )}
            </div>

            {/* Lead origin info */}
            {(client as any).origem_lead && (
              <div className="bg-primary/5 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5" /> Dados da Captação
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Origem</span>
                    <Badge variant="outline" className="text-[10px]">
                      {(client as any).origem_lead === "landing_page" ? "Landing Page" :
                       (client as any).origem_lead === "indicacao" ? "Indicação" :
                       (client as any).origem_lead === "site" ? "Site" :
                       (client as any).origem_lead}
                    </Badge>
                  </div>
                  {(client as any).lead_temperature && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Temperatura</span>
                      <Badge variant="outline" className="text-[10px]">
                        {(client as any).lead_temperature === "quente" ? "🔥 Quente" :
                         (client as any).lead_temperature === "morno" ? "🟡 Morno" : "❄️ Frio"}
                      </Badge>
                    </div>
                  )}
                </div>
                {client.descricao_ambientes && (
                  <div className="text-sm">
                    <span className="text-muted-foreground block mb-1 text-xs">Interesse / Descrição</span>
                    <p className="text-foreground text-xs bg-background/60 rounded-md p-2">{client.descricao_ambientes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Briefing & Simulation Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className={cn(
                "rounded-lg p-3 border flex items-start gap-2.5",
                briefingInfo.exists
                  ? "bg-success/10 border-success/30"
                  : "bg-warning/10 border-warning/30"
              )}>
                <ClipboardList className={cn("h-4 w-4 mt-0.5 shrink-0", briefingInfo.exists ? "text-success" : "text-warning")} />
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold", briefingInfo.exists ? "text-success" : "text-warning")}>
                    {briefingInfo.exists ? "✅ Briefing Preenchido" : "⚠️ Sem Briefing"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {briefingInfo.exists && briefingInfo.created_at
                      ? `Criado em ${format(new Date(briefingInfo.created_at), "dd/MM/yyyy", { locale: ptBR })}`
                      : "Nenhum briefing salvo para este cliente"}
                  </p>
                </div>
              </div>
              <div className={cn(
                "rounded-lg p-3 border flex items-start gap-2.5",
                simInfo.exists
                  ? "bg-success/10 border-success/30"
                  : "bg-warning/10 border-warning/30"
              )}>
                <Calculator className={cn("h-4 w-4 mt-0.5 shrink-0", simInfo.exists ? "text-success" : "text-warning")} />
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold", simInfo.exists ? "text-success" : "text-warning")}>
                    {simInfo.exists ? `✅ ${simInfo.count} Simulação(ões)` : "⚠️ Sem Simulações"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {simInfo.exists && simInfo.last_date
                      ? `Última em ${format(new Date(simInfo.last_date), "dd/MM/yyyy", { locale: ptBR })}`
                      : "Nenhuma simulação salva para este cliente"}
                  </p>
                </div>
              </div>
            </div>

            {/* Contract Closed Warning */}
            {hasContract && (
              <div className="rounded-lg p-3 border bg-success/10 border-success/30 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-success">
                    ✅ Contrato Fechado
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Contrato nº {trackingRecord!.numero_contrato} • Valor: {formatCurrency(trackingRecord!.valor_contrato)}
                    {trackingRecord!.data_fechamento && ` • Fechado em ${format(new Date(trackingRecord!.data_fechamento), "dd/MM/yyyy")}`}
                  </p>
                </div>
              </div>
            )}

            {/* Measurement Request Warning */}
            {hasContract && (
              <div className={cn(
                "rounded-lg p-3 border flex items-start gap-2.5",
                measurementInfo.exists
                  ? "bg-success/10 border-success/30"
                  : "bg-warning/10 border-warning/30"
              )}>
                <Ruler className={cn("h-4 w-4 mt-0.5 shrink-0", measurementInfo.exists ? "text-success" : "text-warning")} />
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold", measurementInfo.exists ? "text-success" : "text-warning")}>
                    {measurementInfo.exists ? "✅ Solicitação de Medida Enviada" : "⚠️ Solicitação de Medida Pendente"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {measurementInfo.exists && measurementInfo.created_at
                      ? `Enviada em ${format(new Date(measurementInfo.created_at), "dd/MM/yyyy", { locale: ptBR })} • Status: ${measurementInfo.status}`
                      : "Nenhuma solicitação de medida enviada para este cliente"}
                  </p>
                </div>
              </div>
            )}

            {/* Indicator Commission Info - for liberador/tecnico/conferente */}
            {hasContract && isLiberadorTecnicoConferente && client.indicador_id && indicadorMap[client.indicador_id] && (
              <div className="rounded-lg p-3 border bg-primary/5 border-primary/20 flex items-start gap-2.5">
                <Award className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary">
                    💰 Indicador com Comissão
                  </p>
                  <div className="text-[10px] text-muted-foreground mt-0.5 space-y-0.5">
                    <p>Indicador: <span className="font-medium text-foreground">{indicadorMap[client.indicador_id].nome}</span></p>
                    <p>Comissão: <span className="font-medium text-foreground">{indicadorMap[client.indicador_id].comissao}%</span></p>
                    <p>Valor: <span className="font-medium text-foreground">
                      {formatCurrency(trackingRecord!.valor_contrato * indicadorMap[client.indicador_id].comissao / 100)}
                    </span></p>
                  </div>
                </div>
              </div>
            )}

            {/* Datas e tempo */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" />Cadastrado em</span>
                <span className="text-foreground font-medium">{format(new Date(client.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Tempo no sistema</span>
                <span className="text-foreground font-medium">{formatDistanceToNow(new Date(client.created_at), { locale: ptBR, addSuffix: false })}</span>
              </div>
              <Separator />
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Tempo na coluna atual</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{colCfg?.icon} {colCfg?.label}</span>
                <Badge variant="outline" className={cn("text-xs font-medium",
                  daysInColumn <= 1 ? "border-success text-success" :
                  daysInColumn <= 3 ? "border-warning text-warning" :
                  daysInColumn <= 7 ? "border-warning text-warning" :
                  "border-destructive text-destructive"
                )}>
                  {daysInColumn === 0 ? "Hoje" : `${daysInColumn} dia${daysInColumn > 1 ? "s" : ""}`}
                </Badge>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-sm">
                <span className="text-muted-foreground">Responsável</span>
                {isAdminOrManager ? (
                  <Select value={client.vendedor || "__none__"} onValueChange={handleAssignVendedor}>
                    <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                      <SelectValue>{client.vendedor || "Atribuir responsável"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {usuarios
                        .filter(u => u.ativo && u.cargo_nome && (
                          u.cargo_nome.toLowerCase().includes("vendedor") ||
                          u.cargo_nome.toLowerCase().includes("projetista")
                        ))
                        .map(p => (
                          <SelectItem key={p.id} value={p.nome_completo}>{p.nome_completo} ({p.cargo_nome})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-foreground font-medium">{client.vendedor || "—"}</span>
                )}
              </div>

              {/* Enviar ao Responsável button */}
              {isAdminOrManager && isNovo && client.vendedor && (
                <Button
                  className="w-full gap-2 mt-1"
                  variant="default"
                  onClick={handleSendToResponsavel}
                  disabled={sending}
                >
                  <Send className="h-4 w-4" />
                  {sending ? "Enviando..." : "Enviar ao Responsável"}
                </Button>
              )}

              {client.indicador_id && indicadorMap[client.indicador_id] && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Indicador</span>
                  <span className="text-foreground font-medium">
                    {indicadorMap[client.indicador_id].nome}
                    <span className="text-muted-foreground ml-1">({indicadorMap[client.indicador_id].comissao}%)</span>
                  </span>
                </div>
              )}
              {(client.quantidade_ambientes ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ambientes</span>
                  <span className="text-foreground font-medium">{client.quantidade_ambientes}</span>
                </div>
              )}
              {client.descricao_ambientes && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">Descrição dos ambientes</span>
                  <p className="text-foreground text-xs bg-muted/40 rounded-md p-2">{client.descricao_ambientes}</p>
                </div>
              )}
            </div>

            {/* Last simulation */}
            {lastSim && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Último Orçamento</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="text-sm font-bold text-foreground">{formatCurrency(lastSim.valor_com_desconto || lastSim.valor_final)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Data</span>
                    <span className="text-sm text-foreground">{format(new Date(lastSim.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Validade</span>
                    {isExpired ? (
                      <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />Expirado</Badge>
                    ) : (
                      <span className="text-sm text-foreground">Até {format(addDays(new Date(lastSim.created_at), budgetValidityDays), "dd/MM/yyyy")}</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Lead Attachments */}
            {attachments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" /> Anexos do Lead ({attachments.length})
                    </h4>
                    {attachments.filter(a => a.file_url).length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={async () => {
                          const downloadable = attachments.filter(a => a.file_url);
                          toast.info(`Baixando ${downloadable.length} anexos...`);
                          for (const att of downloadable) {
                            try {
                              const res = await fetch(att.file_url!);
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = att.file_name;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              URL.revokeObjectURL(url);
                              await new Promise(r => setTimeout(r, 300));
                            } catch { /* skip failed */ }
                          }
                          toast.success("Downloads concluídos!");
                        }}
                      >
                        <Download className="h-3.5 w-3.5" /> Baixar todos
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {attachments.map(att => {
                      const sizeKB = Math.round(att.file_size / 1024);
                      return (
                        <div key={att.id} className="flex items-center gap-2 text-xs bg-muted/40 rounded-md p-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground truncate font-medium">{att.file_name}</p>
                            <p className="text-muted-foreground">{sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`} • {format(new Date(att.created_at), "dd/MM/yy HH:mm")}</p>
                          </div>
                          {att.file_url && (
                            <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <Separator className="my-3" />

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          {/* Measurement Request button for closed contracts */}
          {hasContract && (
            <Button
              className="gap-2 flex-1 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setShowMeasurementRequest(true)}
            >
              <Ruler className="h-4 w-4" />Enviar Solicitação de Medida
            </Button>
          )}

          {!hasContract && lastSim && lastSim.sim_count > 0 ? (
            <Button className="gap-2 flex-1" variant="outline" onClick={() => { onClose(); onHistory(client); }}>
              <History className="h-4 w-4" />Reabrir Simulação
            </Button>
          ) : !hasContract ? (
            <Button className="gap-2 flex-1" onClick={() => { onClose(); onSimulate(client); }}>
              <Handshake className="h-4 w-4" />Negociar
            </Button>
          ) : null}

          {!hasContract && lastSim && lastSim.sim_count > 0 && (
            <Button variant="outline" size="icon" onClick={() => { onClose(); onSimulate(client); }} title="Nova Simulação">
              <Handshake className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => { onClose(); onContracts(client); }} title="Contratos">
            <FileText className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowBriefing(true)} title="Briefing">
            <FileQuestion className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button variant="outline" size="icon" onClick={() => { onClose(); onEdit(client); }} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {/* Delete: only for admin users */}
          {isAdmin && (
            <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" onClick={() => { onClose(); onDelete(client.id); }} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <BriefingModal
          open={showBriefing}
          onOpenChange={(isOpen) => {
            setShowBriefing(isOpen);
            if (!isOpen && client?.id) {
              // Refresh briefing info when modal closes
              supabase
                .from("client_briefings" as any)
                .select("created_at")
                .eq("client_id", client.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .then(({ data }: any) => {
                  if (data && data.length > 0) {
                    setBriefingInfo({ exists: true, created_at: data[0].created_at });
                  } else {
                    setBriefingInfo({ exists: false, created_at: null });
                  }
                });
            }
          }}
          clientId={client.id}
          clientName={client.nome}
          orcamentoNumero={(client as any).numero_orcamento}
          clientData={{
            nome: client.nome,
            telefone1: client.telefone1,
            email: client.email,
            vendedor: client.vendedor,
            created_at: client.created_at,
            descricao_ambientes: client.descricao_ambientes,
          }}
          onSendToSimulator={(data) => {
            supabase.from("clients").update({
              quantidade_ambientes: data.quantidadeAmbientes,
              descricao_ambientes: data.descricaoAmbientes,
            } as any).eq("id", client.id).then(() => {});
            setShowBriefing(false);
            onClose();
            onSimulate({
              ...client,
              quantidade_ambientes: data.quantidadeAmbientes,
              descricao_ambientes: data.descricaoAmbientes,
            } as any);
          }}
        />

        {hasContract && trackingRecord && (
          <MeasurementRequestModal
            open={showMeasurementRequest}
            onOpenChange={setShowMeasurementRequest}
            client={client}
            tracking={trackingRecord}
            lastSim={lastSim}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
