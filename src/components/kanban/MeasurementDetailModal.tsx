/**
 * Modal to view full measurement request details including all data and attachments.
 * Shows seller, technician, store, contract and briefing info with proper scroll.
 * Attachment previews resolve Supabase storage paths to working public URLs.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Ruler, MapPin, User, FileText, Pencil, Phone, Mail, CreditCard, Eye,
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
  seller_name?: string;
  seller_cargo?: string;
  client_seller_name?: string;
  client_seller_cargo?: string;
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

interface PreviewItem {
  url: string;
  name: string;
  kind: "image" | "pdf" | "file";
}

interface NormalizedAttachment {
  url: string;
  name: string;
  kind: "image" | "pdf" | "file";
}

const STATUS_MAP: Record<string, { label: string; icon: string; className: string }> = {
  novo: { label: "Novo", icon: "🆕", className: "bg-primary/10 text-primary border-primary/30" },
  em_andamento: { label: "Em Andamento", icon: "🔧", className: "bg-violet-500/10 text-violet-700 border-violet-500/30" },
  concluido: { label: "Concluído", icon: "✅", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
};

function parseMaybeJson(value: any) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  const looksLikeJson = (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );

  if (!looksLikeJson) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function getAttachmentSource(rawAttachment: any): any {
  const parsed = parseMaybeJson(rawAttachment);
  if (Array.isArray(parsed)) return parsed[0] || null;
  if (!parsed) return null;
  if (typeof parsed === "object") return parsed.asset || parsed.file || parsed.attachment || parsed;
  return parsed;
}

function normalizeStorageUrl(bucket: string, rawPath: string) {
  const normalizedPath = String(rawPath)
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\//, "")
    .replace(new RegExp(`^${bucket}/`), "");

  if (!normalizedPath) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(normalizedPath);
  return data?.publicUrl || "";
}

function resolveAttachmentUrl(rawAttachment: any): string {
  const source = getAttachmentSource(rawAttachment);
  if (!source) return "";

  if (typeof source === "string") {
    if (/^(https?:|blob:|data:)/i.test(source)) return source;

    const cleaned = source.replace(/^\/+/, "").replace(/^storage\/v1\/object\/public\//, "");
    const parts = cleaned.split("/");
    const bucket = parts.length > 1 ? parts[0] : "company-assets";
    const path = parts.length > 1 ? parts.slice(1).join("/") : cleaned;
    return normalizeStorageUrl(bucket, path);
  }

  const directUrl = source.url
    || source.publicUrl
    || source.previewUrl
    || source.preview_url
    || source.thumbnailUrl
    || source.thumbnail_url
    || source.sourceUrl
    || source.source_url
    || source.file_url
    || source.fileUrl
    || source.signedUrl
    || source.signed_url
    || "";

  if (typeof directUrl === "string" && /^(https?:|blob:|data:)/i.test(directUrl)) {
    return directUrl;
  }

  const bucket = source.bucket || source.bucket_name || source.storageBucket || "company-assets";
  const rawPath = source.path
    || source.storagePath
    || source.storage_path
    || source.filePath
    || source.file_path
    || source.fullPath
    || source.full_path
    || directUrl
    || "";

  if (!rawPath) return "";
  return normalizeStorageUrl(bucket, rawPath);
}

function isImageFile(url: string, name: string, mimeType: string) {
  return mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url) || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
}

function isPdfFile(url: string, name: string, mimeType: string) {
  return mimeType === "application/pdf" || /\.pdf(\?.*)?$/i.test(url) || /\.pdf$/i.test(name);
}

function normalizeAttachment(rawAttachment: any, index: number): NormalizedAttachment | null {
  const source = getAttachmentSource(rawAttachment);
  const url = resolveAttachmentUrl(source || rawAttachment);
  const name = typeof source === "string"
    ? `Anexo ${index + 1}`
    : source?.name || source?.file_name || source?.fileName || `Anexo ${index + 1}`;
  const mimeType = typeof source === "string"
    ? ""
    : source?.type || source?.mimeType || source?.mime_type || "";

  const kind = isImageFile(url, name, mimeType)
    ? "image"
    : isPdfFile(url, name, mimeType)
      ? "pdf"
      : "file";

  if (!url && kind !== "file") return null;

  return {
    url,
    name,
    kind,
  };
}

function AttachmentPreview({ attachment, onClick }: { attachment: NormalizedAttachment; onClick: () => void }) {
  if (!attachment.url || attachment.kind === "file") {
    return (
      <div className="rounded-lg border bg-muted/30 aspect-square flex flex-col items-center justify-center p-2">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <span className="text-[8px] text-muted-foreground truncate w-full text-center mt-1">{attachment.name}</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden border bg-background hover:ring-2 hover:ring-primary/50 transition-all aspect-square"
      type="button"
    >
      {attachment.kind === "image" ? (
        <img src={attachment.url} alt={attachment.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 p-2 bg-destructive/5">
          <FileText className="h-8 w-8 text-destructive" />
          <span className="text-[8px] font-bold text-destructive uppercase">PDF</span>
          <span className="text-[7px] text-muted-foreground truncate w-full text-center">{attachment.name}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <Eye className="h-5 w-5 text-white" />
      </div>
    </button>
  );
}

export function MeasurementDetailModal({ open, onOpenChange, request }: Props) {
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);

  if (!request) return null;

  const statusInfo = STATUS_MAP[request.status] || STATUS_MAP.novo;
  const snapshot = request.client_snapshot || {};
  const address = request.delivery_address || {};
  const hasAddress = address.cep || address.street;

  const creatorName = request.created_by_resolved || request.client_seller_name || request.seller_name || request.created_by || "—";
  const creatorCargo = request.created_by_cargo || request.client_seller_cargo || request.seller_cargo || "";
  const editorName = request.last_edited_by_resolved || request.last_edited_by || null;
  const editorCargo = request.last_edited_by_cargo || "";
  const sellerName = request.client_seller_name || request.seller_name || snapshot.vendedor || "—";
  const sellerCargo = request.client_seller_cargo || request.seller_cargo || "";
  const storeCode = request.store_code || snapshot.store_code || snapshot.codigo_loja || "—";

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

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Cliente
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3 border">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Nome</p>
                    <p className="text-sm font-medium text-foreground">{request.nome_cliente}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor à Vista</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(Number(request.valor_venda_avista) || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vendedor / Projetista</p>
                    <p className="text-sm font-medium text-foreground">
                      {sellerName}
                      {sellerCargo && <span className="text-xs text-muted-foreground ml-1">({sellerCargo})</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Código da Loja</p>
                    <div className="flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">{storeCode}</p>
                    </div>
                  </div>
                  {snapshot.telefone1 && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{snapshot.telefone1}</span>
                    </div>
                  )}
                  {snapshot.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{snapshot.email}</span>
                    </div>
                  )}
                  {snapshot.cpf && (
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{snapshot.cpf}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Informações da Solicitação
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3 border">
                  {request.technician_name && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Técnico / Conferente</p>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        <p className="text-sm font-medium text-foreground">{request.technician_name}</p>
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

              {hasAddress && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Endereço de Entrega
                  </h3>
                  <div className="bg-muted/30 rounded-lg p-3 border text-sm text-foreground">
                    <p>{address.street}{address.number ? `, ${address.number}` : ""}{address.complement ? ` - ${address.complement}` : ""}</p>
                    <p className="text-muted-foreground">{address.district}{address.city ? ` • ${address.city}` : ""}{address.state ? ` - ${address.state}` : ""}</p>
                    {address.cep && <p className="text-muted-foreground text-xs mt-1">CEP: {address.cep}</p>}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Ambientes ({request.ambientes?.length || 0})
                </h3>
                <div className="space-y-3">
                  {(request.ambientes || []).map((environment: any, index: number) => {
                    const attachmentEntries = (environment.attachments || [])
                      .map((attachment: any, attachmentIndex: number) => normalizeAttachment(attachment, attachmentIndex))
                      .filter((attachment: NormalizedAttachment | null): attachment is NormalizedAttachment => Boolean(attachment));

                    const legacyImageEntries = attachmentEntries.length === 0
                      ? (environment.images || [])
                          .map((image: any, imageIndex: number) => normalizeAttachment(image, imageIndex))
                          .filter((attachment: NormalizedAttachment | null): attachment is NormalizedAttachment => Boolean(attachment))
                      : [];

                    const previewEntries = attachmentEntries.length > 0 ? attachmentEntries : legacyImageEntries;

                    return (
                      <div key={environment.id || index} className="bg-muted/30 rounded-lg p-3 border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{environment.name || `Ambiente ${index + 1}`}</span>
                          <span className="text-sm font-bold text-emerald-600">{formatCurrency(environment.value || 0)}</span>
                        </div>

                        {previewEntries.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Anexos</p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {previewEntries.map((attachment, attachmentIndex) => (
                                <AttachmentPreview
                                  key={`${attachment.name}-${attachmentIndex}`}
                                  attachment={attachment}
                                  onClick={() => setPreviewItem({ url: attachment.url, name: attachment.name, kind: attachment.kind })}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {environment.fileName && (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            <span>{environment.fileName}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

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

      {previewItem && (
        <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] p-2">
            {previewItem.kind === "pdf" ? (
              <iframe src={previewItem.url} className="w-full h-[80vh] rounded" title={previewItem.name} />
            ) : (
              <img src={previewItem.url} alt={previewItem.name} className="w-full h-auto max-h-[85vh] object-contain rounded" />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
