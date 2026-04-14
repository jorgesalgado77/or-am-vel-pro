import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MapPin, User, Phone, Mail, Calendar, DollarSign, FileText, Loader2, Store, Hash } from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { MeasurementRequestModal } from "@/components/kanban/MeasurementRequestModal";
import type { Client } from "@/components/kanban/kanbanTypes";
import type { ClientTrackingRecord } from "@/hooks/useClientTracking";

interface ClientInfo {
  nome: string;
  telefone1: string | null;
  email: string | null;
  // delivery address
  cep_entrega: string;
  endereco_entrega: string;
  numero_entrega: string;
  complemento_entrega: string;
  bairro_entrega: string;
  cidade_entrega: string;
  uf_entrega: string;
  // contract
  data_fechamento: string | null;
  valor_contrato: number | null;
  numero_contrato: string | null;
  // store
  codigo_loja: string | null;
  nome_loja: string | null;
  // refs
  measurementRequestId: string | null;
  clientId: string | null;
}

interface Props {
  taskTitle: string;
  tenantId: string | null;
}

function extractClientName(title: string): string | null {
  const match = title.match(/^(?:Medição|Vistoria|Reunião|Tarefa)\s*[-–—]\s*(.+)$/i);
  if (match) return match[1].trim();
  const dashMatch = title.match(/\s[-–—]\s(.+)$/);
  if (dashMatch) return dashMatch[1].trim();
  return null;
}

export function TaskClientInfo({ taskTitle, tenantId }: Props) {
  const [info, setInfo] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);
  const [fullClient, setFullClient] = useState<Client | null>(null);
  const [trackingRecord, setTrackingRecord] = useState<ClientTrackingRecord | null>(null);

  useEffect(() => {
    if (!tenantId || !taskTitle) { setLoading(false); return; }
    const clientName = extractClientName(taskTitle);
    if (!clientName) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Find client
        const { data: clients } = await supabase
          .from("clients")
          .select("*")
          .eq("tenant_id", tenantId)
          .ilike("nome", `%${clientName}%`)
          .limit(1);

        if (!clients || clients.length === 0) { setLoading(false); return; }
        const client = clients[0];
        setFullClient(client as Client);

        // Fetch tracking, measurement_request, and tenant in parallel
        const [trackingRes, mrRes, tenantRes] = await Promise.all([
          supabase
            .from("client_tracking")
            .select("*")
            .eq("client_id", client.id)
            .eq("tenant_id", tenantId)
            .limit(1),
          (supabase as any)
            .from("measurement_requests")
            .select("id, delivery_address, client_snapshot")
            .eq("client_id", client.id)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("tenants")
            .select("codigo_loja, nome_loja")
            .eq("id", tenantId)
            .maybeSingle(),
        ]);

        const tracking = trackingRes.data?.[0];
        const mr = mrRes.data?.[0];
        const tenant = tenantRes.data;

        // Extract address from delivery_address JSON or client_snapshot fallback
        const addr = mr?.delivery_address || {};
        const snapshot = mr?.client_snapshot || {};

        const cep = addr.cep || snapshot.delivery_address_zip || snapshot.cep_entrega || snapshot.cep || "";
        const street = addr.street || snapshot.delivery_address_street || snapshot.endereco_entrega || snapshot.endereco || "";
        const num = addr.number || snapshot.delivery_address_number || snapshot.numero_entrega || snapshot.numero || "";
        const compl = addr.complement || snapshot.delivery_address_complement || snapshot.complemento_entrega || snapshot.complemento || "";
        const district = addr.district || snapshot.delivery_address_district || snapshot.bairro_entrega || snapshot.bairro || "";
        const city = addr.city || snapshot.delivery_address_city || snapshot.cidade_entrega || snapshot.cidade || "";
        const state = addr.state || snapshot.delivery_address_state || snapshot.uf_entrega || snapshot.estado || snapshot.uf || "";

        setInfo({
          nome: client.nome,
          telefone1: client.telefone1,
          email: client.email,
          cep_entrega: cep,
          endereco_entrega: street,
          numero_entrega: num,
          complemento_entrega: compl,
          bairro_entrega: district,
          cidade_entrega: city,
          uf_entrega: state,
          data_fechamento: tracking?.data_fechamento || null,
          valor_contrato: tracking?.valor_contrato || null,
          numero_contrato: tracking?.numero_contrato || null,
          codigo_loja: tenant?.codigo_loja || null,
          nome_loja: tenant?.nome_loja || null,
          measurementRequestId: mr?.id || null,
          clientId: client.id,
        });
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [taskTitle, tenantId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados do cliente...
      </div>
    );
  }

  if (!info) return null;

  const fullAddress = [
    info.endereco_entrega,
    info.numero_entrega && `nº ${info.numero_entrega}`,
    info.complemento_entrega,
    info.bairro_entrega,
    info.cidade_entrega && info.uf_entrega
      ? `${info.cidade_entrega} - ${info.uf_entrega}`
      : info.cidade_entrega || info.uf_entrega,
    info.cep_entrega && `CEP: ${info.cep_entrega}`,
  ].filter(Boolean).join(", ");

  const lojaDisplay = [info.codigo_loja, info.nome_loja].filter(Boolean).join(" - ");

  return (
    <div className="space-y-3">
      <Separator />
      <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-primary" />
        Dados do Cliente
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground">Nome do Cliente</Label>
          <Input value={info.nome} readOnly className="h-8 text-xs bg-muted/50" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" /> Contato
          </Label>
          <Input value={info.telefone1 || "—"} readOnly className="h-8 text-xs bg-muted/50" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Mail className="h-3 w-3" /> Email
          </Label>
          <Input value={info.email || "—"} readOnly className="h-8 text-xs bg-muted/50" />
        </div>
      </div>

      {/* Contract & Store */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Hash className="h-3 w-3" /> Nº Contrato
          </Label>
          <Input value={info.numero_contrato || "—"} readOnly className="h-8 text-xs bg-muted/50" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Store className="h-3 w-3" /> Loja
          </Label>
          <Input value={lojaDisplay || "—"} readOnly className="h-8 text-xs bg-muted/50" />
        </div>
      </div>

      {/* Delivery Address - individual fields */}
      <div>
        <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
          <MapPin className="h-3 w-3" /> Endereço de Entrega
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground/70">Endereço</Label>
            <Input value={info.endereco_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground/70">Número</Label>
              <Input value={info.numero_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground/70">Complemento</Label>
              <Input value={info.complemento_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground/70">Bairro</Label>
            <Input value={info.bairro_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground/70">Cidade</Label>
              <Input value={info.cidade_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground/70">UF</Label>
              <Input value={info.uf_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground/70">CEP</Label>
              <Input value={info.cep_entrega || "—"} readOnly className="h-7 text-xs bg-muted/50" />
            </div>
          </div>
        </div>
      </div>

      {/* Dates & Values */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Data de Fechamento
          </Label>
          <Input
            value={info.data_fechamento ? format(new Date(info.data_fechamento + "T00:00:00"), "dd/MM/yyyy") : "—"}
            readOnly
            className="h-8 text-xs bg-muted/50"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Valor à Vista
          </Label>
          <Input
            value={info.valor_contrato != null ? formatCurrency(info.valor_contrato) : "—"}
            readOnly
            className="h-8 text-xs bg-muted/50"
          />
        </div>
      </div>

      {/* Action button */}
      {info.measurementRequestId && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 w-full"
          onClick={() => {
            window.open(`/app?view=kanban&clientId=${info.clientId}`, "_blank");
          }}
        >
          <FileText className="h-3.5 w-3.5" />
          Abrir Solicitação de Medição
        </Button>
      )}

      <Separator />
    </div>
  );
}
