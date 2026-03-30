/**
 * Modal to view full measurement request details including all data and attachments.
 * Shows seller, technician, store, contract and briefing info with proper scroll.
 * Attachment previews resolve Supabase storage paths to working public URLs.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Ruler, MapPin, User, FileText, Pencil, Phone, Mail, CreditCard, Eye,
  Store, ClipboardList, UserCheck, ExternalLink, Printer, Maximize2, Image as ImageIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { forwardRef, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
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
  thumbnailUrl?: string;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const STATUS_MAP: Record<string, { label: string; icon: string; className: string }> = {
  novo: { label: "Novo", icon: "🆕", className: "bg-primary/10 text-primary border-primary/30" },
  em_andamento: { label: "Em Andamento", icon: "🔧", className: "bg-violet-500/10 text-violet-700 border-violet-500/30" },
  concluido: { label: "Concluído", icon: "✅", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
};

function resolveAttachmentUrl(rawAttachment: any): string {
  if (!rawAttachment) return "";

  // Handle strings directly
  if (typeof rawAttachment === "string") {
    if (/^(https?:|blob:|data:)/i.test(rawAttachment)) return rawAttachment;
    // Treat as storage path
    const cleaned = rawAttachment.replace(/^\/+/, "").replace(/^storage\/v1\/object\/public\//, "");
    const parts = cleaned.split("/");
    const bucket = parts.length > 1 ? parts[0] : "company-assets";
    const path = parts.length > 1 ? parts.slice(1).join("/") : cleaned;
    if (!path) return "";
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  // Handle arrays - take first element
  if (Array.isArray(rawAttachment)) {
    return rawAttachment.length > 0 ? resolveAttachmentUrl(rawAttachment[0]) : "";
  }

  // Handle JSON strings
  if (typeof rawAttachment === "object") {
    // Try direct URL fields first
    const directUrl = rawAttachment.url
      || rawAttachment.publicUrl
      || rawAttachment.sourceUrl
      || rawAttachment.source_url
      || rawAttachment.previewUrl
      || rawAttachment.preview_url
      || rawAttachment.signedUrl
      || rawAttachment.signed_url
      || rawAttachment.file_url
      || rawAttachment.fileUrl
      || rawAttachment.thumbnailUrl
      || rawAttachment.thumbnail_url
      || "";

    if (typeof directUrl === "string" && /^(https?:|blob:|data:)/i.test(directUrl)) {
      return directUrl;
    }

    // Try nested asset/file
    const nested = rawAttachment.asset || rawAttachment.file || rawAttachment.attachment;
    if (nested) return resolveAttachmentUrl(nested);

    // Try storage path
    const bucket = rawAttachment.bucket || rawAttachment.bucket_name || "company-assets";
    const rawPath = rawAttachment.path
      || rawAttachment.storagePath
      || rawAttachment.storage_path
      || rawAttachment.filePath
      || rawAttachment.file_path
      || rawAttachment.fullPath
      || rawAttachment.full_path
      || directUrl
      || "";

    if (!rawPath) return "";
    const normalizedPath = String(rawPath).replace(/^\/+/, "").replace(new RegExp(`^${bucket}/`), "");
    if (!normalizedPath) return "";
    const { data } = supabase.storage.from(bucket).getPublicUrl(normalizedPath);
    return data?.publicUrl || "";
  }

  return "";
}

function isImageFile(url: string, name: string, mimeType: string) {
  return mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url) || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
}

function isPdfFile(url: string, name: string, mimeType: string) {
  return mimeType === "application/pdf" || /\.pdf(\?.*)?$/i.test(url) || /\.pdf$/i.test(name);
}

function normalizeAttachment(rawAttachment: any, index: number): NormalizedAttachment | null {
  if (!rawAttachment) return null;

  const url = resolveAttachmentUrl(rawAttachment);
  
  const source = typeof rawAttachment === "object" && !Array.isArray(rawAttachment) ? rawAttachment : null;
  const name = source?.name || source?.file_name || source?.fileName || `Anexo ${index + 1}`;
  const mimeType = source?.type || source?.mimeType || source?.mime_type || source?.kind || "";
  const thumbnailUrl = resolveAttachmentUrl(
    source?.thumbnailUrl
    || source?.thumbnail_url
    || source?.previewUrl
    || source?.preview_url
    || "",
  );

  const kind = isImageFile(url, name, mimeType)
    ? "image"
    : isPdfFile(url, name, mimeType)
      ? "pdf"
      : "file";

  // For images/pdfs, require a URL
  if (!url && kind !== "file") return null;

  return { url, name, kind, thumbnailUrl: thumbnailUrl || undefined };
}

const AttachmentPreview = forwardRef<HTMLButtonElement, { attachment: NormalizedAttachment; onClick: () => void }>(function AttachmentPreview({ attachment, onClick }, ref) {
  const [imgError, setImgError] = useState(false);
  const [pdfThumbnailUrl, setPdfThumbnailUrl] = useState(attachment.thumbnailUrl || "");

  useEffect(() => {
    let active = true;

    if (attachment.kind !== "pdf" || attachment.thumbnailUrl || !attachment.url) {
      setPdfThumbnailUrl(attachment.thumbnailUrl || "");
      return () => {
        active = false;
      };
    }

    const loadPdfThumbnail = async () => {
      try {
        const pdf = await pdfjsLib.getDocument(attachment.url).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.1 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context || !active) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        if (active) {
          setPdfThumbnailUrl(canvas.toDataURL("image/png"));
        }
      } catch {
        if (active) {
          setPdfThumbnailUrl("");
        }
      }
    };

    void loadPdfThumbnail();

    return () => {
      active = false;
    };
  }, [attachment.kind, attachment.thumbnailUrl, attachment.url]);

  const visualPreviewUrl = attachment.kind === "pdf"
    ? pdfThumbnailUrl
    : (attachment.thumbnailUrl || attachment.url);

  if (!attachment.url || attachment.kind === "file" || (attachment.kind === "image" && (imgError || !visualPreviewUrl)) || (attachment.kind === "pdf" && !visualPreviewUrl)) {
    return (
      <div className="rounded-lg border bg-muted/30 aspect-square flex flex-col items-center justify-center p-2">
        {attachment.kind === "image" ? (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        ) : (
          <FileText className="h-6 w-6 text-muted-foreground" />
        )}
        <span className="text-[8px] text-muted-foreground truncate w-full text-center mt-1">{attachment.name}</span>
      </div>
    );
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden border bg-background hover:ring-2 hover:ring-primary/50 transition-all aspect-square"
      type="button"
    >
      {(attachment.kind === "image" || attachment.kind === "pdf") ? (
        <img
          src={visualPreviewUrl}
          alt={attachment.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 p-2 bg-destructive/5">
          <FileText className="h-8 w-8 text-destructive" />
          <span className="text-[8px] font-bold text-destructive uppercase">PDF</span>
          <span className="text-[7px] text-muted-foreground truncate w-full text-center">{attachment.name}</span>
        </div>
      )}
      {attachment.kind === "pdf" && (
        <Badge variant="secondary" className="absolute left-1.5 bottom-1.5 h-5 px-1.5 text-[9px] uppercase">
          PDF
        </Badge>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <Eye className="h-5 w-5 text-white" />
      </div>
    </button>
  );
});

export function MeasurementDetailModal({ open, onOpenChange, request }: Props) {
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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
  const contractNumber = request.contract_number || snapshot.contract_number || snapshot.numero_contrato || snapshot.numero_orcamento || "";

  const handlePrint = () => {
    const printContent = contentRef.current;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Solicitação - ${request.nome_cliente}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #1a1a1a; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .section { margin: 16px 0; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
        .section h3 { margin: 0 0 8px; font-size: 14px; color: #333; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .label { font-size: 10px; text-transform: uppercase; color: #888; }
        .value { font-size: 13px; font-weight: 500; }
        .env { padding: 8px; border: 1px solid #eee; border-radius: 6px; margin: 4px 0; display: flex; justify-content: space-between; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #f0f0f0; }
        img { max-width: 120px; max-height: 120px; border-radius: 6px; object-fit: cover; margin: 4px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="header">
        <div><h2 style="margin:0">📐 Solicitação de Medida</h2><p style="margin:4px 0;font-size:12px;color:#666">${request.nome_cliente}</p></div>
        <div style="text-align:right"><span class="badge">${statusInfo.icon} ${statusInfo.label}</span>
        ${contractNumber ? `<p style="font-size:11px;margin:4px 0">Nº ${contractNumber}</p>` : ""}</div>
      </div>
      <div class="section"><h3>👤 Criado por</h3><p class="value">${creatorName}${creatorCargo ? ` (${creatorCargo})` : ""}</p><p class="label">${format(new Date(request.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p></div>
      ${editorName ? `<div class="section"><h3>✏️ Editado por</h3><p class="value">${editorName}${editorCargo ? ` (${editorCargo})` : ""}</p></div>` : ""}
      <div class="section"><h3>👤 Cliente</h3><div class="grid">
        <div><p class="label">Nome</p><p class="value">${request.nome_cliente}</p></div>
        <div><p class="label">Valor à Vista</p><p class="value" style="color:#16a34a">${formatCurrency(Number(request.valor_venda_avista) || 0)}</p></div>
        <div><p class="label">Vendedor / Projetista</p><p class="value">${sellerName}${sellerCargo ? ` (${sellerCargo})` : ""}</p></div>
        <div><p class="label">Código da Loja</p><p class="value">${storeCode}</p></div>
      </div></div>
      <div class="section"><h3>📋 Ambientes (${request.ambientes?.length || 0})</h3>
        ${(request.ambientes || []).map((env: any, i: number) => `<div class="env"><span>${env.name || `Ambiente ${i + 1}`}</span><span style="color:#16a34a;font-weight:bold">${formatCurrency(env.value || 0)}</span></div>`).join("")}
      </div>
      ${request.observacoes ? `<div class="section"><h3>📝 Observações</h3><p style="font-size:13px;white-space:pre-wrap">${request.observacoes}</p></div>` : ""}
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  const handleFullscreen = () => {
    const el = contentRef.current?.closest("[role='dialog']");
    if (el && el.requestFullscreen) el.requestFullscreen();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-[95vw] p-0 flex flex-col" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-5 w-5 text-primary" />
              Detalhes da Solicitação
              {contractNumber && (
                <Badge variant="secondary" className="text-[10px] font-mono ml-1">
                  Nº {contractNumber}
                </Badge>
              )}
              <Badge variant="outline" className={statusInfo.className + " ml-auto text-xs"}>
                {statusInfo.icon} {statusInfo.label}
              </Badge>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Visualize auditoria, cliente, ambientes, anexos e dados completos da solicitação de medida.
            </DialogDescription>
            <div className="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={handleFullscreen}>
                <Maximize2 className="h-3 w-3" /> Expandir
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={handlePrint}>
                <Printer className="h-3 w-3" /> Imprimir
              </Button>
            </div>
          </DialogHeader>

          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 pb-6">
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
                  {contractNumber && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Nº Contrato / Orçamento</p>
                      <p className="text-sm font-medium text-foreground font-mono">{contractNumber}</p>
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
                      .filter((a: NormalizedAttachment | null): a is NormalizedAttachment => Boolean(a));

                    const legacyImageEntries = attachmentEntries.length === 0
                      ? (environment.images || [])
                          .map((image: any, imageIndex: number) => normalizeAttachment(image, imageIndex))
                          .filter((a: NormalizedAttachment | null): a is NormalizedAttachment => Boolean(a))
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
