/**
 * Expanded client detail dialog for the Kanban board.
 */
import { useState } from "react";
import { differenceInDays } from "date-fns";
import { format, addDays, isPast, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Handshake, Pencil, Trash2, History, FileText, Phone, Mail, User, Hash, Clock,
  AlertTriangle, CalendarIcon, FileQuestion,
} from "lucide-react";
import { BriefingModal } from "@/components/BriefingModal";
import { supabase } from "@/lib/supabaseClient";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/financing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { KANBAN_COLUMNS, type Client, type LastSimInfo } from "./kanbanTypes";

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
  if (!client) return null;

  const isExpired = lastSim ? isPast(addDays(new Date(lastSim.created_at), budgetValidityDays)) : false;
  const status = (client as any).status || "novo";
  const colCfg = KANBAN_COLUMNS.find(c => c.id === status);
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

    const shouldMove = !!newVendedor && status === "novo";
    const updatedClient = { ...client, vendedor: newVendedor, ...(shouldMove ? { status: "em_negociacao" } : {}) } as any;
    onClientUpdate(updatedClient, shouldMove);

    if (shouldMove) {
      await supabase.from("clients").update({ status: "em_negociacao" } as any).eq("id", client.id);
      toast.success(`📋 "${client.nome}" movido para "Em Negociação"`, { duration: 3000 });
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
            <Badge variant="outline" className="text-xs shrink-0" style={{ borderColor: colCfg?.color, color: colCfg?.color }}>
              {colCfg?.icon} {colCfg?.label}
            </Badge>
          </div>
        </DialogHeader>

        <Separator className="my-3" />

        <ScrollArea className="flex-1 pr-3">
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
                  daysInColumn <= 1 ? "border-emerald-400 text-emerald-600" :
                  daysInColumn <= 3 ? "border-yellow-400 text-yellow-600" :
                  daysInColumn <= 7 ? "border-orange-400 text-orange-600" :
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
                {(cargoNome.includes("administrador") || cargoNome.includes("gerente")) ? (
                  <Select value={client.vendedor || "__none__"} onValueChange={handleAssignVendedor}>
                    <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                      <SelectValue>{client.vendedor || "Atribuir responsável"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {usuarios
                        .filter(u => u.ativo && u.cargo_nome && !u.cargo_nome.toLowerCase().includes("admin"))
                        .map(p => (
                          <SelectItem key={p.id} value={p.nome_completo}>{p.nome_completo} ({p.cargo_nome})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-foreground font-medium">{client.vendedor || "—"}</span>
                )}
              </div>
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
          </div>
        </ScrollArea>

        <Separator className="my-3" />

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          {lastSim && lastSim.sim_count > 0 ? (
            <Button className="gap-2 flex-1" variant="outline" onClick={() => { onClose(); onHistory(client); }}>
              <History className="h-4 w-4" />Reabrir Simulação
            </Button>
          ) : (
            <Button className="gap-2 flex-1" onClick={() => { onClose(); onSimulate(client); }}>
              <Handshake className="h-4 w-4" />Negociar
            </Button>
          )}
          {lastSim && lastSim.sim_count > 0 && (
            <Button variant="outline" size="icon" onClick={() => { onClose(); onSimulate(client); }} title="Nova Simulação">
              <Handshake className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => { onClose(); onContracts(client); }} title="Contratos">
            <FileText className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button variant="outline" size="icon" onClick={() => { onClose(); onEdit(client); }} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" onClick={() => { onClose(); onDelete(client.id); }} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
