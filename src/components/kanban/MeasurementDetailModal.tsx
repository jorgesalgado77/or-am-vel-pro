/**
 * Modal to view full measurement request details including all data and attachments.
 * Shows seller, technician, store, contract and briefing info with proper scroll.
 * Attachment previews resolve Supabase storage paths to working public URLs.
 * Direct DB lookups resolve creator/seller names from usuarios table.
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
import { getTenantId } from "@/lib/tenantState";

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

const GENERIC_USER_LABELS = new Set(["", "sistema", "system", "admin", "administrador", "administrator", "usuario", "usuário", "user", "sem nome", "—"]);

interface DeliveryAddress {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
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

function pickFilled(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== "—") return text;
  }
  return "";
}

function pickHumanLabel(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim() && !isGenericUserLabel(value)) || "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function normalizeAddressEntry(raw: any): DeliveryAddress | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const street = raw.trim();
    return street ? { street } : null;
  }

  const entry: DeliveryAddress = {
    cep: pickFilled(raw.cep, raw.zip, raw.postal_code),
    street: pickFilled(raw.street, raw.endereco, raw.address, raw.logradouro),
    number: pickFilled(raw.number, raw.numero),
    complement: pickFilled(raw.complement, raw.complemento),
    district: pickFilled(raw.district, raw.bairro),
    city: pickFilled(raw.city, raw.cidade),
    state: pickFilled(raw.state, raw.uf, raw.estado),
  };

  return Object.values(entry).some(Boolean) ? entry : null;
}

function dedupeAddresses(entries: Array<DeliveryAddress | null | undefined>) {
  const seen = new Set<string>();
  return entries.filter((entry): entry is DeliveryAddress => {
    if (!entry) return false;
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatAddressLines(address: DeliveryAddress) {
  const line1 = [
    address.street,
    address.number ? `, ${address.number}` : "",
    address.complement ? ` - ${address.complement}` : "",
  ].join("");
  const line2 = [
    address.district,
    address.city ? `${address.district ? " • " : ""}${address.city}` : "",
    address.state ? ` - ${address.state}` : "",
  ].join("");

  return {
    line1: line1.trim(),
    line2: line2.trim(),
    cep: address.cep || "",
  };
}

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
  const [relatedRecords, setRelatedRecords] = useState<{ client: any | null; tracking: any | null }>({ client: null, tracking: null });
  const [resolvedNames, setResolvedNames] = useState<{
    creator: string; creatorCargo: string; seller: string; sellerCargo: string;
    editor: string; editorCargo: string;
  }>({ creator: "", creatorCargo: "", seller: "", sellerCargo: "", editor: "", editorCargo: "" });

  useEffect(() => {
    if (!request) return;
    let active = true;

    const resolve = async () => {
      const tenantId = getTenantId() || request.tenant_id;
      if (!tenantId) return;
      const snapshot = request.client_snapshot || {};

      const emptyResponse = Promise.resolve({ data: null } as any);
      const [{ data: usersData }, { data: cargosData }, { data: clientData }, { data: trackingData }] = await Promise.all([
        (supabase.from("usuarios").select("id, auth_user_id, nome_completo, apelido, email, cargo_id").eq("tenant_id", tenantId)) as any,
        (supabase.from("cargos").select("id, nome").eq("tenant_id", tenantId)) as any,
        request.client_id
          ? ((supabase.from("clients" as any).select("*").eq("id", request.client_id).maybeSingle()) as any)
          : emptyResponse,
        request.tracking_id
          ? ((supabase.from("client_tracking" as any).select("*").eq("id", request.tracking_id).maybeSingle()) as any)
          : request.client_id
            ? ((supabase.from("client_tracking" as any).select("*").eq("client_id", request.client_id).order("updated_at", { ascending: false }).limit(1).maybeSingle()) as any)
            : emptyResponse,
      ]);

      const cargoMap = new Map((cargosData || []).map((cargo: any) => [cargo.id, cargo.nome]));
      const users = (usersData || []).map((user: any) => ({
        ...user,
        cargo_nome: cargoMap.get(user.cargo_id) || "",
      }));

      const findUser = (...refs: Array<string | null | undefined>) => {
        for (const ref of refs) {
          const normalizedRef = normalizeValue(ref);
          if (!normalizedRef || isGenericUserLabel(ref)) continue;

          const exactMatch = users.find((user: any) => {
            const candidates = [
              user.id,
              user.auth_user_id,
              user.nome_completo,
              user.apelido,
              user.email,
              typeof user.email === "string" ? user.email.split("@")[0] : "",
            ].map((candidate) => normalizeValue(candidate));

            return candidates.includes(normalizedRef);
          });

          if (exactMatch) return exactMatch;

          const fuzzyMatches = users.filter((user: any) => {
            const name = normalizeValue(user.nome_completo);
            const nickname = normalizeValue(user.apelido);
            return Boolean(
              normalizedRef.length > 2
              && ((name && (name.includes(normalizedRef) || normalizedRef.includes(name)))
                || (nickname && (nickname.includes(normalizedRef) || normalizedRef.includes(nickname))))
            );
          });

          if (fuzzyMatches.length === 1) return fuzzyMatches[0];
        }

        return null;
      };

      const getName = (user: any) => pickHumanLabel(user?.nome_completo, user?.apelido);
      const getCargo = (user: any) => pickFilled(user?.cargo_nome);

      const fallbackSellerUser = findUser(clientData?.responsavel_id, snapshot.responsavel_id);
      const sellerUser = findUser(
        clientData?.responsavel_id,
        snapshot.responsavel_id,
        snapshot.seller_id,
        snapshot.vendedor_id,
        clientData?.vendedor,
        trackingData?.projetista,
        snapshot.vendedor_nome,
        snapshot.projetista_nome,
        snapshot.vendedor,
        snapshot.projetista,
        snapshot.seller_name,
        request.client_seller_name,
        request.seller_name,
      ) || fallbackSellerUser;

      const sellerName = pickHumanLabel(
        getName(sellerUser),
        clientData?.vendedor,
        trackingData?.projetista,
        snapshot.vendedor_nome,
        snapshot.projetista_nome,
        snapshot.vendedor,
        snapshot.projetista,
        snapshot.seller_name,
        request.client_seller_name,
        request.seller_name,
        getName(fallbackSellerUser),
      ) || "—";

      const sellerCargo = pickFilled(
        getCargo(sellerUser),
        getCargo(fallbackSellerUser),
        snapshot.seller_cargo,
        request.client_seller_cargo,
        request.seller_cargo,
      );

      const creatorUser = findUser(
        snapshot.created_by_user_id,
        request.created_by,
        snapshot.created_by_user_name,
        request.created_by_resolved,
        clientData?.responsavel_id,
      ) || sellerUser;

      const editorUser = findUser(
        snapshot.last_edited_by_user_id,
        request.last_edited_by,
        snapshot.last_edited_by_user_name,
        request.last_edited_by_resolved,
      );

      if (active) {
        setRelatedRecords({ client: clientData || null, tracking: trackingData || null });
        setResolvedNames({
          creator: pickHumanLabel(
            getName(creatorUser),
            request.created_by_resolved,
            snapshot.created_by_user_name,
            snapshot.created_by_name,
            sellerName,
          ) || "—",
          creatorCargo: pickFilled(
            getCargo(creatorUser),
            snapshot.created_by_user_cargo,
            request.created_by_cargo,
            sellerCargo,
          ),
          seller: sellerName,
          sellerCargo,
          editor: pickHumanLabel(
            getName(editorUser),
            request.last_edited_by_resolved,
            snapshot.last_edited_by_user_name,
            request.last_edited_by,
          ),
          editorCargo: pickFilled(
            getCargo(editorUser),
            snapshot.last_edited_by_user_cargo,
            request.last_edited_by_cargo,
          ),
        });
      }
    };

    void resolve();
    return () => { active = false; };
  }, [request]);

  if (!request) return null;

  const statusInfo = STATUS_MAP[request.status] || STATUS_MAP.novo;
  const snapshot = request.client_snapshot || {};
  const clientRecord = relatedRecords.client;
  const trackingRecord = relatedRecords.tracking;
  const deliveryAddresses = dedupeAddresses([
    normalizeAddressEntry(request.delivery_address),
    ...asArray(snapshot.enderecos_entrega).map(normalizeAddressEntry),
    normalizeAddressEntry(snapshot.delivery_address),
    normalizeAddressEntry({
      cep: snapshot.delivery_address_zip || snapshot.cep_entrega || snapshot.cep,
      street: snapshot.delivery_address_street || snapshot.endereco_entrega || snapshot.endereco,
      number: snapshot.delivery_address_number || snapshot.numero_entrega || snapshot.numero,
      complement: snapshot.delivery_address_complement || snapshot.complemento_entrega || snapshot.complemento,
      district: snapshot.delivery_address_district || snapshot.bairro_entrega || snapshot.bairro,
      city: snapshot.delivery_address_city || snapshot.cidade_entrega || snapshot.cidade,
      state: snapshot.delivery_address_state || snapshot.uf_entrega || snapshot.estado || snapshot.uf,
    }),
    normalizeAddressEntry({
      cep: clientRecord?.delivery_address_zip || clientRecord?.cep_entrega || clientRecord?.cep,
      street: clientRecord?.delivery_address_street || clientRecord?.endereco_entrega || clientRecord?.endereco,
      number: clientRecord?.delivery_address_number || clientRecord?.numero_entrega || clientRecord?.numero,
      complement: clientRecord?.delivery_address_complement || clientRecord?.complemento_entrega || clientRecord?.complemento,
      district: clientRecord?.delivery_address_district || clientRecord?.bairro_entrega || clientRecord?.bairro,
      city: clientRecord?.delivery_address_city || clientRecord?.cidade_entrega || clientRecord?.cidade,
      state: clientRecord?.delivery_address_state || clientRecord?.uf_entrega || clientRecord?.estado || clientRecord?.uf,
    }),
  ]);
  const hasAddress = deliveryAddresses.length > 0;
  const clientPhone = pickFilled(snapshot.telefone1, snapshot.telefone, clientRecord?.telefone1, clientRecord?.telefone, clientRecord?.celular);
  const clientEmail = pickFilled(snapshot.email, clientRecord?.email);
  const clientCpf = pickFilled(snapshot.cpf, clientRecord?.cpf, clientRecord?.cpf_cnpj);

  const creatorName = pickHumanLabel(
    resolvedNames.creator,
    request.created_by_resolved,
    snapshot.created_by_user_name,
    request.created_by,
    clientRecord?.vendedor,
    trackingRecord?.projetista,
  ) || "—";
  const creatorCargo = pickFilled(resolvedNames.creatorCargo, request.created_by_cargo, snapshot.created_by_user_cargo);
  const editorName = pickHumanLabel(
    resolvedNames.editor,
    request.last_edited_by_resolved,
    snapshot.last_edited_by_user_name,
    request.last_edited_by,
  ) || null;
  const editorCargo = pickFilled(resolvedNames.editorCargo, request.last_edited_by_cargo, snapshot.last_edited_by_user_cargo);
  const sellerName = pickHumanLabel(
    resolvedNames.seller,
    request.client_seller_name,
    request.seller_name,
    clientRecord?.vendedor,
    trackingRecord?.projetista,
    snapshot.vendedor_nome,
    snapshot.projetista_nome,
    snapshot.vendedor,
    snapshot.projetista,
    snapshot.seller_name,
  ) || "—";
  const sellerCargo = pickFilled(resolvedNames.sellerCargo, request.client_seller_cargo, request.seller_cargo, snapshot.seller_cargo);
  const storeCode = request.store_code || snapshot.store_code || snapshot.codigo_loja || "—";
  const contractNumber = request.contract_number || snapshot.contract_number || snapshot.numero_contrato || snapshot.numero_orcamento || "";

  // Collect all attachment image URLs for print pages
  const allImageUrls: string[] = [];
  (request.ambientes || []).forEach((env: any) => {
    const atts = env.attachments || env.images || [];
    atts.forEach((att: any) => {
      const url = resolveAttachmentUrl(att);
      if (!url) return;
      const name = typeof att === "object" ? (att.name || att.file_name || "") : "";
      const mime = typeof att === "object" ? (att.type || att.mimeType || att.mime_type || "") : "";
      if (isImageFile(url, name, mime)) {
        allImageUrls.push(url);
      }
    });
  });

  const handlePrint = () => {
    const printContent = contentRef.current;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const sellerLabel = `${sellerName}${sellerCargo ? ` (${sellerCargo})` : ""}`;
    const creatorLabel = `${creatorName}${creatorCargo ? ` (${creatorCargo})` : ""}`;
    const editorLabel = editorName ? `${editorName}${editorCargo ? ` (${editorCargo})` : ""}` : "";
    const addressCards = deliveryAddresses.map((entry, index) => {
      const formatted = formatAddressLines(entry);
      return `
        <div class="address-card">
          <p class="label">Endereço ${deliveryAddresses.length > 1 ? index + 1 : ""}</p>
          <p class="value">${escapeHtml(formatted.line1 || "—")}</p>
          ${formatted.line2 ? `<p class="muted">${escapeHtml(formatted.line2)}</p>` : ""}
          ${formatted.cep ? `<p class="muted">CEP: ${escapeHtml(formatted.cep)}</p>` : ""}
        </div>
      `;
    }).join("");

    const contactSection = `
      <div class="section">
        <h3>📞 Contato do Cliente</h3>
        <div class="grid">
          <div><p class="label">Nome</p><p class="value">${escapeHtml(request.nome_cliente || "—")}</p></div>
          ${clientPhone ? `<div><p class="label">Telefone</p><p class="value">${escapeHtml(clientPhone)}</p></div>` : ""}
          ${clientEmail ? `<div><p class="label">E-mail</p><p class="value">${escapeHtml(clientEmail)}</p></div>` : ""}
          ${clientCpf ? `<div><p class="label">CPF/CNPJ</p><p class="value">${escapeHtml(clientCpf)}</p></div>` : ""}
          <div><p class="label">Vendedor / Projetista</p><p class="value">${escapeHtml(sellerLabel || "—")}</p></div>
        </div>
      </div>
    `;

    const deliverySection = hasAddress ? `
      <div class="section">
        <h3>📍 Endereços de Entrega</h3>
        <div class="address-list">${addressCards}</div>
      </div>
    ` : "";

    const printHeader = `
      <div class="header">
        <div><h2 style="margin:0">📐 Solicitação de Medida</h2><p style="margin:4px 0;font-size:12px;color:#666">${escapeHtml(request.nome_cliente)}</p></div>
        <div style="text-align:right"><span class="badge">${escapeHtml(`${statusInfo.icon} ${statusInfo.label}`)}</span>
        ${contractNumber ? `<p style="font-size:11px;margin:4px 0">Nº ${escapeHtml(contractNumber)}</p>` : ""}</div>
      </div>
    `;

    let imagePages = "";
    for (let i = 0; i < allImageUrls.length; i += 3) {
      const pageImages = allImageUrls.slice(i, i + 3);
      imagePages += `<section class="print-page">
        ${printHeader}
        ${contactSection}
        ${deliverySection}
        <div class="section"><h3>📎 Anexos (${i + 1}–${Math.min(i + 3, allImageUrls.length)} de ${allImageUrls.length})</h3><div style="display:flex;flex-direction:column;gap:12px;align-items:center;">`;
      pageImages.forEach(url => {
        imagePages += `<img src="${url}" style="max-width:100%;max-height:280px;border-radius:8px;object-fit:contain;border:1px solid #ddd;" crossorigin="anonymous" />`;
      });
      imagePages += `</div></div></section>`;
    }

    printWindow.document.write(`
      <html><head><title>Solicitação - ${escapeHtml(request.nome_cliente)}</title>
      <style>
        @page { margin: 12mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .print-page { page-break-after: always; padding: 6px 0; }
        .print-page:last-child { page-break-after: auto; }
        .section { margin: 16px 0; padding: 12px; border: 1px solid #ddd; border-radius: 8px; break-inside: avoid; }
        .section h3 { margin: 0 0 8px; font-size: 14px; color: #333; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .address-list { display: grid; gap: 8px; }
        .address-card { padding: 8px; border: 1px solid #eee; border-radius: 6px; }
        .label { font-size: 10px; text-transform: uppercase; color: #888; }
        .value { font-size: 13px; font-weight: 500; }
        .muted { margin: 4px 0 0; font-size: 11px; color: #666; }
        .env { padding: 8px; border: 1px solid #eee; border-radius: 6px; margin: 4px 0; display: flex; justify-content: space-between; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #f0f0f0; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <section class="print-page">
        ${printHeader}
        <div class="section"><h3>👤 Criado por</h3><p class="value">${escapeHtml(creatorLabel || "—")}</p><p class="label">${format(new Date(request.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p></div>
        ${editorName ? `<div class="section"><h3>✏️ Editado por</h3><p class="value">${escapeHtml(editorLabel)}</p>${request.last_edited_at || request.updated_at ? `<p class="label">${format(new Date(request.last_edited_at || request.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>` : ""}</div>` : ""}
        <div class="section"><h3>👤 Cliente</h3><div class="grid">
          <div><p class="label">Nome</p><p class="value">${escapeHtml(request.nome_cliente || "—")}</p></div>
          <div><p class="label">Valor à Vista</p><p class="value" style="color:#16a34a">${formatCurrency(Number(request.valor_venda_avista) || 0)}</p></div>
          <div><p class="label">Vendedor / Projetista</p><p class="value">${escapeHtml(sellerLabel || "—")}</p></div>
          <div><p class="label">Código da Loja</p><p class="value">${escapeHtml(storeCode)}</p></div>
        </div></div>
        ${contactSection}
        ${deliverySection}
        <div class="section"><h3>📋 Ambientes (${request.ambientes?.length || 0})</h3>
          ${(request.ambientes || []).map((env: any, i: number) => `<div class="env"><span>${escapeHtml(env.name || `Ambiente ${i + 1}`)}</span><span style="color:#16a34a;font-weight:bold">${formatCurrency(env.value || 0)}</span></div>`).join("")}
        </div>
        ${request.observacoes ? `<div class="section"><h3>📝 Observações</h3><p style="font-size:13px;white-space:pre-wrap">${escapeHtml(request.observacoes)}</p></div>` : ""}
      </section>
      ${imagePages}
      </body></html>
    `);
    printWindow.document.close();
    // Wait for images to load before printing
    const images = printWindow.document.querySelectorAll("img");
    let loaded = 0;
    const total = images.length;
    if (total === 0) {
      setTimeout(() => { printWindow.print(); }, 300);
    } else {
      const checkReady = () => { loaded++; if (loaded >= total) setTimeout(() => printWindow.print(), 400); };
      images.forEach(img => { img.onload = checkReady; img.onerror = checkReady; });
      // Fallback timeout
      setTimeout(() => { printWindow.print(); }, 5000);
    }
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
                    <MapPin className="h-4 w-4 text-primary" /> Endereços de Entrega
                  </h3>
                  <div className="space-y-2">
                    {deliveryAddresses.map((entry, index) => {
                      const formatted = formatAddressLines(entry);
                      return (
                        <div key={`${formatted.line1}-${formatted.cep}-${index}`} className="bg-muted/30 rounded-lg p-3 border text-sm text-foreground">
                          <p>{formatted.line1 || "—"}</p>
                          {formatted.line2 && <p className="text-muted-foreground">{formatted.line2}</p>}
                          {formatted.cep && <p className="text-muted-foreground text-xs mt-1">CEP: {formatted.cep}</p>}
                        </div>
                      );
                    })}
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
