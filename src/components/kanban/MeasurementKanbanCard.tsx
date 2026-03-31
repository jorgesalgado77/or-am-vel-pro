import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarCheck, Clock, Eye, MapPin, Pencil, Phone, Ruler, Store, User, UserCheck } from "lucide-react";

interface MeasurementCardRequest {
  id: string;
  nome_cliente: string;
  valor_venda_avista: number;
  created_at: string;
  status: string;
  ambientes: any[];
  contract_number?: string;
  store_code?: string;
  client_phone?: string | null;
  client_seller_name?: string;
  technician_name?: string;
  assigned_to?: string | null;
  created_by_resolved?: string;
  last_edited_by_resolved?: string;
  last_edited_by_cargo?: string | null;
  last_edited_at?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  scheduled_km?: number | null;
}

interface MeasurementKanbanCardProps {
  request: MeasurementCardRequest;
  daysOld: number;
  isStalled: boolean;
  columnColor: string;
  onViewDetails: () => void;
  assignmentControl: ReactNode;
  statusControl?: ReactNode;
}

function getTintClass(status: string) {
  switch (status) {
    case "novo":
      return "bg-[hsl(188_78%_55%/0.12)]";
    case "em_andamento":
      return "bg-[hsl(43_96%_56%/0.12)]";
    case "concluido":
      return "bg-[hsl(142_71%_45%/0.12)]";
    default:
      return "bg-muted/30";
  }
}

export function MeasurementKanbanCard({
  request,
  daysOld,
  isStalled,
  columnColor,
  onViewDetails,
  assignmentControl,
  statusControl,
}: MeasurementKanbanCardProps) {
  const primaryReference = request.contract_number || request.store_code || "Sem referência";
  const sellerName = request.client_seller_name || "—";
  const technicianName = request.technician_name || request.assigned_to || "";

  return (
    <Card
      className={cn(
        "rounded-xl border shadow-sm transition-all group border-l-[4px] hover:shadow-md hover:border-primary/30",
        getTintClass(request.status),
        isStalled && "border-destructive/50 bg-destructive/5",
        request.status === "concluido" && "border-success/40",
      )}
      style={{ borderLeftColor: columnColor }}
    >
      <CardContent className="p-3 space-y-3">
        {isStalled && (
          <div className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold">⚠️ Parada há {daysOld} dias sem distribuição</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{request.nome_cliente}</p>
              {request.client_phone && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3 text-success shrink-0" />
                  <span className="text-[11px] text-muted-foreground font-mono truncate">{request.client_phone}</span>
                </div>
              )}
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground font-mono">
                <Store className="h-3 w-3 shrink-0" />
                <span className="truncate">{primaryReference}</span>
              </div>
            </div>
            <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium shrink-0">
              <Ruler className="h-2.5 w-2.5 mr-0.5" /> {request.ambientes?.length || 0}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] text-muted-foreground">{format(new Date(request.created_at), "dd/MM/yy", { locale: ptBR })}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] h-4 px-1 font-medium",
                  daysOld === 0 && "border-success text-success",
                  daysOld >= 1 && daysOld <= 3 && "border-warning text-warning",
                  daysOld > 3 && "border-destructive text-destructive",
                )}
              >
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                {daysOld === 0 ? "hoje" : `${daysOld}d`}
              </Badge>
            </div>
            <span className="text-xl font-bold text-destructive whitespace-nowrap">
              {formatCurrency(Number(request.valor_venda_avista) || 0)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{request.ambientes?.length || 0} {(request.ambientes?.length || 0) === 1 ? "ambiente" : "ambientes"}</span>
            {request.last_edited_at && (
              <span>Última: {format(new Date(request.last_edited_at), "dd/MM/yy", { locale: ptBR })}</span>
            )}
          </div>
        </div>

        <div className="space-y-1 text-[11px]">
          {sellerName && sellerName !== "—" && (
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium text-primary truncate">{sellerName}</span>
            </div>
          )}
          {technicianName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <UserCheck className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="font-medium text-success truncate">{technicianName}</span>
            </div>
          )}
          {request.last_edited_by_resolved && (
            <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground">
              <Pencil className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Última alteração por <span className="font-medium text-foreground">{request.last_edited_by_resolved}</span>
                {request.last_edited_by_cargo ? <span className="text-primary"> ({request.last_edited_by_cargo})</span> : null}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-background/80 p-2.5 space-y-2">
          <Button variant="outline" size="sm" className="w-full h-8 text-[11px] gap-1.5" onClick={onViewDetails}>
            <Eye className="h-3.5 w-3.5" /> Ver detalhes
          </Button>

          <Separator />

          <div className="space-y-2">
            {assignmentControl}
            {statusControl}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}