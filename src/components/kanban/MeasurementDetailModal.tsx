/**
 * Modal to view full measurement request details including all data and attachments.
 * Shows seller, technician, store, contract and briefing info with proper scroll.
 * Attachment previews resolve Supabase storage paths to public URLs.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Ruler, MapPin, User, Clock, FileText, Pencil, Phone, Mail, CreditCard, Eye,
  Store, ClipboardList, UserCheck, ExternalLink,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

interface MeasurementRequest {
  id: string;
  client_id: string;
  tracking_id: string;
  tenant_id: string;
  nome_cliente: string;
  valor_venda_avista: number;
  ambientes: any[];
  imported_files: any[];
  observacoes: string;
  client_snapshot: any;
  delivery_address: any;
  status: string;
  created_by: string | null;
  assigned_to: string | null;
  last_edited_by: string | null;
  last_edited_by_cargo: string | null;
  last_edited_at: string | null;
  created_at: string;
  updated_at: string;
  // Extended enriched fields
  seller_name?: string;
  technician_name?: string;
  store_code?: string;
  contract_number?: string;
  contract_url?: string;
  briefing_url?: string;
  created_by_resolved?: string;
  created_by_cargo?: string;
  last_edited_by_resolved?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: MeasurementRequest | null;
}

const STATUS_MAP: Record<string, { label: string; icon: string; className: string }> = {
  novo: { label: "Novo", icon: "🆕", className: "bg-primary/10 text-primary border-primary/30" },
  em_andamento: { label: "Em Andamento", icon: "🔧", className: "bg-violet-500/10 text-violet-700 border-violet-500/30" },
  concluido: { label: "Concluído", icon: "✅", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
};

/**
 * Resolves the actual URL for an attachment.
 * Handles: direct url, file_url, preview_url, and Supabase storage path.
 */
function resolveAttachmentUrl(att: any): string {
  if (att.url) return att.url;
  if (att.file_url) return att.file_url;
  if (att.preview_url) return att.preview_url;
  if (att.thumbnail_url) return att.thumbnail_url;
  // Resolve Supabase storage path
  if (att.path) {
    const bucket = att.bucket || "chat-attachments";
    const { data } = supabase.storage.from(bucket).getPublicUrl(att.path);
    return data?.publicUrl || "";
  }
  if (att.storage_path) {
    const bucket = att.bucket || "chat-attachments";
    const { data } = supabase.storage.from(bucket).getPublicUrl(att.storage_path);
    return data?.publicUrl || "";
  }
  return "";
}

function isImageFile(url: string, name: string, att: any): boolean {
  return att.kind === "image" || att.mime_type?.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(url) ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
}

function isPdfFile(url: string, name: string, att: any): boolean {
  return att.kind === "pdf" || att.mime_type === "application/pdf" ||
    /\.pdf$/i.test(url) || /\.pdf$/i.test(name);
}

function AttachmentPreview({ att, onClick }: { att: any; onClick: () => void }) {
  const url = useMemo(() => resolveAttachmentUrl(att), [att]);
  const name = att.name || att.file_name || att.fileName || "arquivo";
  const isImage = isImageFile(url, name, att);
  const isPdf = isPdfFile(url, name, att);

  if (!url) {
    return (
      <div className="rounded-lg border bg-muted/30 aspect-square flex flex-col items-center justify-center p-2">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <span className="text-[8px] text-muted-foreground truncate w-full text-center mt-1">{name}</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden border bg-background hover:ring-2 hover:ring-primary/50 transition-all aspect-square"
    >
      {isImage ? (
        <img src={url} alt={name} className="w-full h-full object-cover" loading="lazy" />
      ) : isPdf ? (
        <div className="flex flex-col items-center justify-center h-full gap-1 p-2 bg-destructive/5">
          <FileText className="h-8 w-8 text-destructive" />
          <span className="text-[8px] font-bold text-destructive uppercase">PDF</span>
          <span className="text-[7px] text-muted-foreground truncate w-full text-center">{name}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 p-2">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="text-[8px] text-muted-foreground truncate w-full text-center">{name}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <Eye className="h-5 w-5 text-white" />
      </div>
    </button>
  );
}

export function MeasurementDetailModal({ open, onOpenChange, request }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!request) return null;

  const statusInfo = STATUS_MAP[request.status] || STATUS_MAP.novo;
  const snap = request.client_snapshot || {};
  const addr = request.delivery_address || {};
  const hasAddress = addr.cep || addr.street;

  // Resolved names
  const creatorName = request.created_by_resolved || request.seller_name || request.created_by || "—";
  const creatorCargo = request.created_by_cargo || "";
  const editorName = request.last_edited_by_resolved || request.last_edited_by || null;
  const editorCargo = request.last_edited_by_cargo || "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-[95vw] p-0 flex flex-col" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-5 w-5 text-primary" />
              Detalhes da Solicitação
              <Badge variant="outline" className={statusInfo.className + " ml-auto text-xs"}>
                {statusInfo.icon} {statusInfo.label}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-5 py-4">

              {/* Criado por + Editado por — ABOVE all content */}
              <div className="space-y-2">
                <div className="bg-muted/30 rounded-lg p-3 border space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Criado por</p>
                      <p className="text-sm font-medium text-foreground">
                        {creatorName}
                        {creatorCargo && <span className="text-xs text-muted-foreground ml-1">({creatorCargo})</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(request.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  {editorName && (
                    <>
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Pencil className="h-3.5 w-3.5 text-primary" />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Editado por</p>
                          <p className="text-sm font-medium text-foreground">
                            {editorName}
                            {editorCargo && <span className="text-xs text-muted-foreground ml-1">({editorCargo})</span>}
                          </p>
                          {(request.last_edited_at || request.updated_at) && (
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(request.last_edited_at || request.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Client info */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Cliente
                </h3>
                <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3 border">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Nome</p>
                    <p className="text-sm font-medium text-foreground">{request.nome_cliente}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor à Vista</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(Number(request.valor_venda_avista) || 0)}</p>
                  </div>
                  {snap.telefone1 && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{snap.telefone1}</span>
                    </div>
                  )}
                  {snap.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{snap.email}</span>
                    </div>
                  )}
                  {snap.cpf && (
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{snap.cpf}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Seller / Technician / Store / Contract */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Informações da Solicitação
                </h3>
                <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3 border">
                  {request.seller_name && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vendedor / Projetista</p>
                      <p className="text-sm font-medium text-foreground">{request.seller_name}</p>
                    </div>
                  )}
                  {request.technician_name && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Técnico / Conferente</p>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        <p className="text-sm font-medium text-foreground">{request.technician_name}</p>
                      </div>
                    </div>
                  )}
                  {request.assigned_to && !request.technician_name && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Atribuído a</p>
                      <p className="text-sm font-medium text-foreground">{request.assigned_to}</p>
                    </div>
                  )}
                  {request.store_code && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Código da Loja</p>
                      <div className="flex items-center gap-1.5">
                        <Store className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">{request.store_code}</p>
                      </div>
                    </div>
                  )}
                  {request.contract_number && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Nº Contrato</p>
                      <p className="text-sm font-medium text-foreground">{request.contract_number}</p>
                    </div>
                  )}
                </div>

                {/* Contract + Briefing links */}
                {(request.contract_url || request.briefing_url) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {request.contract_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => window.open(request.contract_url!, "_blank")}
                      >
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        Ver Contrato
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {request.briefing_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => window.open(request.briefing_url!, "_blank")}
                      >
                        <ClipboardList className="h-3.5 w-3.5 text-primary" />
                        Ver Briefing
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery address */}
              {hasAddress && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Endereço de Entrega
                  </h3>
                  <div className="bg-muted/30 rounded-lg p-3 border text-sm text-foreground">
                    <p>{addr.street}{addr.number ? `, ${addr.number}` : ""}{addr.complement ? ` - ${addr.complement}` : ""}</p>
                    <p className="text-muted-foreground">{addr.district}{addr.city ? ` • ${addr.city}` : ""}{addr.state ? ` - ${addr.state}` : ""}</p>
                    {addr.cep && <p className="text-muted-foreground text-xs mt-1">CEP: {addr.cep}</p>}
                  </div>
                </div>
              )}

              {/* Environments + attachments */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Ambientes ({request.ambientes?.length || 0})
                </h3>
                <div className="space-y-3">
                  {(request.ambientes || []).map((amb: any, i: number) => (
                    <div key={amb.id || i} className="bg-muted/30 rounded-lg p-3 border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{amb.name || `Ambiente ${i + 1}`}</span>
                        <span className="text-sm font-bold text-emerald-600">{formatCurrency(amb.value || 0)}</span>
                      </div>

                      {/* Attached files */}
                      {amb.attachments && amb.attachments.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Anexos</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {amb.attachments.map((att: any, j: number) => (
                              <AttachmentPreview
                                key={j}
                                att={att}
                                onClick={() => setPreviewUrl(resolveAttachmentUrl(att))}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legacy images field */}
                      {!amb.attachments?.length && amb.images && amb.images.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {amb.images.map((url: string, j: number) => (
                            <AttachmentPreview
                              key={j}
                              att={{ url, kind: "image", name: `Imagem ${j + 1}` }}
                              onClick={() => setPreviewUrl(url)}
                            />
                          ))}
                        </div>
                      )}

                      {amb.fileName && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>{amb.fileName}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Observações */}
              {request.observacoes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">📝 Observações</h3>
                  <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3 border whitespace-pre-wrap">
                    {request.observacoes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen preview */}
      {previewUrl && (
        <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] p-2">
            {previewUrl.toLowerCase().endsWith(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[80vh] rounded" />
            ) : (
              <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[85vh] object-contain rounded" />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
