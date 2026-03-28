/**
 * Modal for sending measurement requests (Solicitação de Medida).
 * Shows client data, sale value, environments, imported files and requires image uploads.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Image, AlertTriangle, CheckCircle2, Ruler, X, Eye, Pencil, Search, Building2, Loader2, Download } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { formatCurrency } from "@/lib/financing";
import { maskCep, maskCodigoLoja, maskCpfCnpj, maskPhone } from "@/lib/masks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import type { Client, LastSimInfo } from "./kanbanTypes";
import type { ClientTrackingRecord } from "@/hooks/useClientTracking";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface EnvironmentData {
  id: string;
  name: string;
  value: number;
  fileUrl?: string;
  fileName?: string;
}

type AttachmentKind = "image" | "pdf";

interface EnvironmentAttachment {
  id: string;
  file?: File;
  kind: AttachmentKind;
  mimeType: string;
  name: string;
  previewUrl: string;
  thumbnailUrl: string;
  sourceUrl?: string;
}

interface MeasurementRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  tracking: ClientTrackingRecord;
  lastSim: LastSimInfo | undefined;
}

export function MeasurementRequestModal({
  open, onOpenChange, client, tracking, lastSim,
}: MeasurementRequestModalProps) {
  const [environments, setEnvironments] = useState<EnvironmentData[]>([]);
  const [importedFiles, setImportedFiles] = useState<{ name: string; url: string; type: string }[]>([]);
  const [envAttachments, setEnvAttachments] = useState<Record<string, EnvironmentAttachment[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewImages, setPdfPreviewImages] = useState<string[]>([]);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const { settings } = useCompanySettings();
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());

  // Store data
  const [storeData, setStoreData] = useState<{ name: string; cnpj: string; logo_url: string; codigo_loja: string; gerente_nome: string }>({
    name: "", cnpj: "", logo_url: "", codigo_loja: "", gerente_nome: "",
  });

  // Editable client address
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    cep: "", street: "", number: "", complement: "", district: "", city: "", state: "",
  });
  const [cepLoading, setCepLoading] = useState(false);

  // Editable client phone/email
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editableFields, setEditableFields] = useState({
    telefone: "",
    email: "",
    cpf: "",
  });

  const normalizeText = (value?: string | null) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const revokePreviewUrl = useCallback((url?: string) => {
    if (!url || !localPreviewUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    localPreviewUrlsRef.current.delete(url);
  }, []);

  const clearPreviewUrls = useCallback(() => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  const hydrateClientState = useCallback((source: any) => {
    const merged = source || {};
    const nestedDeliveryAddress = merged.delivery_address && typeof merged.delivery_address === "object"
      ? merged.delivery_address
      : {};
    const plainDeliveryAddress = typeof merged.delivery_address === "string"
      ? merged.delivery_address
      : "";
    setEditableFields({
      telefone: maskPhone(merged.telefone1 || client.telefone1 || ""),
      email: merged.email || client.email || "",
      cpf: maskCpfCnpj(merged.cpf || client.cpf || tracking.cpf_cnpj || ""),
    });
    setAddressForm({
      cep: maskCep(nestedDeliveryAddress.cep || merged.delivery_address_zip || merged.cep_entrega || merged.cep || ""),
      street: nestedDeliveryAddress.street || nestedDeliveryAddress.endereco || merged.delivery_address_street || merged.endereco_entrega || plainDeliveryAddress || merged.endereco || "",
      number: nestedDeliveryAddress.number || merged.delivery_address_number || merged.numero_entrega || merged.numero || "",
      complement: nestedDeliveryAddress.complement || merged.delivery_address_complement || merged.complemento_entrega || merged.complemento || "",
      district: nestedDeliveryAddress.district || nestedDeliveryAddress.bairro || merged.delivery_address_district || merged.bairro_entrega || merged.bairro || "",
      city: nestedDeliveryAddress.city || nestedDeliveryAddress.cidade || merged.delivery_address_city || merged.cidade_entrega || merged.cidade || "",
      state: nestedDeliveryAddress.state || nestedDeliveryAddress.uf || merged.delivery_address_state || merged.uf_entrega || merged.estado || merged.uf || "",
    });
    setEditingAddress(false);
    setEditingField(null);
  }, [client.cpf, client.email, client.telefone1, tracking.cpf_cnpj]);

  useEffect(() => {
    if (!open || !client?.id) return;
    let active = true;

    clearPreviewUrls();
    setEnvAttachments({});
    setUploadProgress({});
    setObservacoes("");
    setPdfPreviewImages([]);
    setPdfPreviewOpen(false);
    hydrateClientState(client as any);

    const loadFreshClient = async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("*")
        .eq("id", client.id)
        .maybeSingle();

      if (active && data) hydrateClientState(data);
    };

    void loadFreshClient();

    return () => {
      active = false;
    };
  }, [clearPreviewUrls, client, hydrateClientState, open]);

  useEffect(() => () => {
    clearPreviewUrls();
  }, [clearPreviewUrls]);

  // Load store data
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const tenantId = await getResolvedTenantId();
      if (!tenantId) {
        setStoreData({
          name: settings.company_name || "",
          cnpj: maskCpfCnpj(settings.cnpj_loja || ""),
          logo_url: settings.logo_url || "",
          codigo_loja: maskCodigoLoja(settings.codigo_loja || ""),
          gerente_nome: "",
        });
        return;
      }

      const [companyRes, gerenteRes, cargosRes] = await Promise.all([
        (supabase as any).from("company_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
        (supabase as any).from("usuarios").select("nome_completo, cargo_nome, cargo_id").eq("tenant_id", tenantId).eq("ativo", true),
        (supabase as any).from("cargos").select("id, nome").eq("tenant_id", tenantId),
      ]);

      const company = companyRes.data || {};
      const cargos = (cargosRes.data || []) as any[];
      const gerenteCargo = cargos.find((c: any) => {
        const n = normalizeText(c.nome);
        return n.includes("gerente") || n.includes("administrador") || n.includes("gestor");
      });

      const usuarios = (gerenteRes.data || []) as any[];
      // Try finding by cargo_id first, then fallback to cargo_nome text match
      let gerente = gerenteCargo
        ? usuarios.find((u: any) => u.cargo_id === gerenteCargo.id)
        : null;
      if (!gerente) {
        gerente = usuarios.find((u: any) => {
          const cargo = normalizeText(u.cargo_nome);
          return cargo.includes("gerente") || cargo.includes("administrador") || cargo.includes("gestor");
        });
      }

      setStoreData({
        name: company.company_name || company.nome_empresa || settings.company_name || "",
        cnpj: maskCpfCnpj(company.cnpj_loja || company.cnpj || settings.cnpj_loja || ""),
        logo_url: company.logo_url || settings.logo_url || "",
        codigo_loja: maskCodigoLoja(company.codigo_loja || settings.codigo_loja || ""),
        gerente_nome: gerente?.nome_completo || "",
      });
    };
    load();
  }, [open, settings]);

  // CEP auto-fill
  const fetchCep = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddressForm(prev => ({
          ...prev,
          street: data.logradouro || prev.street,
          district: data.bairro || prev.district,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
        toast.success("CEP encontrado! Endereço preenchido automaticamente.");
      } else {
        toast.error("CEP não encontrado.");
      }
    } catch {
      toast.error("Erro ao buscar CEP.");
    }
    setCepLoading(false);
  }, []);

  // Save editable fields to client in DB
  const saveClientField = useCallback(async (field: string, value: string) => {
    try {
      const updateData: Record<string, string> = {};
      if (field === "telefone") updateData.telefone1 = value;
      else if (field === "email") updateData.email = value;
      else if (field === "cpf") updateData.cpf = value;
      await (supabase as any).from("clients").update(updateData).eq("id", client.id);
    } catch { /* silent */ }
  }, [client?.id]);

  const saveAddress = useCallback(async () => {
    try {
      await (supabase as any).from("clients").update({
        delivery_address_zip: addressForm.cep,
        delivery_address_street: addressForm.street,
        delivery_address_number: addressForm.number,
        delivery_address_complement: addressForm.complement,
        delivery_address_district: addressForm.district,
        delivery_address_city: addressForm.city,
        delivery_address_state: addressForm.state,
        cep_entrega: addressForm.cep,
        endereco_entrega: addressForm.street,
        numero_entrega: addressForm.number,
        complemento_entrega: addressForm.complement,
        bairro_entrega: addressForm.district,
        cidade_entrega: addressForm.city,
        uf_entrega: addressForm.state,
      } as any).eq("id", client.id);
      toast.success("Endereço salvo!");
      setEditingAddress(false);
    } catch {
      toast.error("Erro ao salvar endereço.");
    }
  }, [client?.id, addressForm]);

  // Load environments from simulations
  useEffect(() => {
    if (!client?.id || !open) return;

    const loadData = async () => {
      // Load simulation environments
      const { data: sims } = await supabase
        .from("simulations")
        .select("arquivo_nome, valor_tela, desconto1, desconto2, desconto3")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (sims && sims.length > 0) {
        const sim = sims[0];
        try {
          if (sim.arquivo_nome && sim.arquivo_nome.startsWith("[")) {
            const parsed = JSON.parse(sim.arquivo_nome) as any[];
            const envs: EnvironmentData[] = parsed.map((e: any, i: number) => {
              const vt = Number(e.totalValue) || 0;
              const d1 = Number(sim.desconto1) || 0;
              const d2 = Number(sim.desconto2) || 0;
              const d3 = Number(sim.desconto3) || 0;
              const after1 = vt * (1 - d1 / 100);
              const after2 = after1 * (1 - d2 / 100);
              const valorAvista = after2 * (1 - d3 / 100);
              return {
                id: e.id || `env-${i}`,
                name: e.environmentName || `Ambiente ${i + 1}`,
                value: valorAvista,
                fileUrl: e.fileUrl,
                fileName: e.fileName,
              };
            });
            setEnvironments(envs);

            // Collect imported files (txt/xml)
            const files = parsed
              .filter((e: any) => e.fileUrl && e.fileName)
              .map((e: any) => ({
                name: e.fileName,
                url: e.fileUrl,
                type: e.fileName.split(".").pop()?.toLowerCase() || "",
              }));
            setImportedFiles(files);
          }
        } catch {
          // fallback: create single environment
          const vt = Number(sim.valor_tela) || 0;
          const d1 = Number(sim.desconto1) || 0;
          const d2 = Number(sim.desconto2) || 0;
          const d3 = Number(sim.desconto3) || 0;
          const after1 = vt * (1 - d1 / 100);
          const after2 = after1 * (1 - d2 / 100);
          const valorAvista = after2 * (1 - d3 / 100);
          setEnvironments([{ id: "env-1", name: "Ambiente 1", value: valorAvista }]);
        }
      }
    };

    loadData();
  }, [client?.id, open]);

  const getFileKind = (file: Pick<File, "type" | "name">) => {
    const ref = `${file?.type || ""} ${file?.name || ""}`.toLowerCase();
    if (ref.includes("application/pdf") || ref.endsWith(".pdf")) return "pdf";
    if (/(image\/|\.png$|\.jpe?g$|\.webp$|\.gif$|\.bmp$|\.svg$|\.heic$|\.heif$|\.avif$)/.test(ref)) return "image";
    return "other";
  };

  const sourceToDataUrl = useCallback((source: string | File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao processar arquivo"));

    if (source instanceof File) {
      reader.readAsDataURL(source);
      return;
    }

    fetch(source)
      .then((response) => response.blob())
      .then((blob) => reader.readAsDataURL(blob))
      .catch(reject);
  }), []);

  const createPdfThumbnail = useCallback(async (source: string | File) => {
    try {
      const data = source instanceof File
        ? await source.arrayBuffer()
        : await fetch(source).then((response) => response.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.42 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return null;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }, []);

  const buildAttachment = useCallback(async (file: File): Promise<EnvironmentAttachment | null> => {
    const kind = getFileKind(file);
    if (kind === "other") return null;

    const previewUrl = URL.createObjectURL(file);
    localPreviewUrlsRef.current.add(previewUrl);
    const thumbnailUrl = kind === "pdf"
      ? (await createPdfThumbnail(file)) || previewUrl
      : previewUrl;

    return {
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      kind,
      mimeType: file.type || "",
      name: file.name,
      previewUrl,
      thumbnailUrl,
      sourceUrl: previewUrl,
    };
  }, [createPdfThumbnail]);

  const buildPersistedAttachment = useCallback(async (
    envId: string,
    envName: string,
    rawAttachment: any,
    index: number,
  ): Promise<EnvironmentAttachment | null> => {
    const sourceUrl = typeof rawAttachment === "string"
      ? rawAttachment
      : rawAttachment?.url || rawAttachment?.publicUrl || rawAttachment?.previewUrl || "";

    if (!sourceUrl) return null;

    const name = typeof rawAttachment === "string"
      ? `${envName} ${index + 1}`
      : rawAttachment?.name || `${envName} ${index + 1}`;
    const mimeType = typeof rawAttachment === "string"
      ? ""
      : rawAttachment?.type || rawAttachment?.mimeType || "";
    const inferredKind = typeof rawAttachment === "string"
      ? "image"
      : rawAttachment?.kind || getFileKind({ type: mimeType, name: `${name} ${sourceUrl}` });

    if (inferredKind === "other") return null;

    const thumbnailUrl = inferredKind === "pdf"
      ? (await createPdfThumbnail(sourceUrl)) || sourceUrl
      : sourceUrl;

    return {
      id: `${envId}-persisted-${rawAttachment?.id || index}`,
      kind: inferredKind,
      mimeType,
      name,
      previewUrl: sourceUrl,
      thumbnailUrl,
      sourceUrl,
    };
  }, [createPdfThumbnail]);

  const handleFileChange = async (envId: string, files: FileList | null) => {
    if (!files) return;

    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter(file => getFileKind(file) !== "other");

    if (validFiles.length !== selectedFiles.length) {
      toast.error("Apenas PDF e formatos de imagem são permitidos");
    }

    setUploadProgress(prev => ({ ...prev, [envId]: 0 }));
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => setUploadProgress(prev => {
          const next = { ...prev };
          delete next[envId];
          return next;
        }), 500);
      }
      setUploadProgress(prev => ({ ...prev, [envId]: Math.min(progress, 100) }));
    }, 150);

    const nextAttachments = (await Promise.all(validFiles.map((file) => buildAttachment(file))))
      .filter((attachment): attachment is EnvironmentAttachment => Boolean(attachment));

    setEnvAttachments(prev => ({
      ...prev,
      [envId]: [...(prev[envId] || []), ...nextAttachments],
    }));
  };

  const removeImage = (envId: string, index: number) => {
    setEnvAttachments(prev => {
      const current = prev[envId] || [];
      const target = current[index];
      revokePreviewUrl(target?.previewUrl);
      return {
        ...prev,
        [envId]: current.filter((_, i) => i !== index),
      };
    });
  };

  const allEnvsHaveImages = environments.length > 0 &&
    environments.every(env => (envAttachments[env.id] || []).some((attachment) => attachment.kind === "image"));

  const totalValorAvista = environments.reduce((sum, e) => sum + e.value, 0);

  const buildPdfDoc = useCallback(async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mx = 12;
    const cw = pw - mx * 2;
    const bottomMargin = 14;
    const topStart = 14;
    const gap = 4;
    const FONT = "helvetica";

    const PRIMARY: [number, number, number] = [8, 145, 178];
    const PRIMARY_LIGHT: [number, number, number] = [230, 247, 250];
    const DARK: [number, number, number] = [30, 41, 59];
    const GRAY: [number, number, number] = [100, 116, 139];
    const WHITE: [number, number, number] = [255, 255, 255];
    const BORDER: [number, number, number] = [203, 213, 225];
    const BG_ALT: [number, number, number] = [248, 250, 252];
    const ADDRESS_BORDER: [number, number, number] = [37, 99, 235];
    const ADDRESS_BG: [number, number, number] = [239, 246, 255];
    const ADDRESS_TITLE: [number, number, number] = [30, 64, 175];

    let y = topStart;

    const contractNumber = String(
      tracking?.numero_contrato ||
      (client as any)?.numero_orcamento ||
      (client as any)?.numero_contrato ||
      "—",
    );

    const resetText = () => {
      doc.setFont(FONT, "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
    };

    const ensureSpace = (height: number) => {
      if (y + height > ph - bottomMargin) {
        doc.addPage();
        y = topStart;
      }
    };

    const getImageFormat = (src: string, fallbackName?: string) => {
      const ref = `${src} ${fallbackName || ""}`.toLowerCase();
      return ref.includes("png") || ref.includes("image/png") ? "PNG" : "JPEG";
    };

    const loadImageAsset = async (src: string | File, fallbackName?: string) => {
      const normalizedSrc = await sourceToDataUrl(src);
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = normalizedSrc;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Falha ao processar imagem");
      ctx.drawImage(img, 0, 0);

      const format = getImageFormat(typeof src === "string" ? src : src.type, fallbackName);
      const mimeType = format === "PNG" ? "image/png" : "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, 0.92);

      return {
        dataUrl,
        format,
        width: canvas.width,
        height: canvas.height,
      };
    };

    const drawCard = (title: string, height: number, bodyFill: [number, number, number] = WHITE) => {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.45);
      doc.setFillColor(...bodyFill);
      doc.roundedRect(mx, y, cw, height, 2, 2, "FD");
      doc.setFillColor(...PRIMARY);
      doc.roundedRect(mx, y, cw, 8, 2, 2, "F");
      doc.rect(mx, y + 5, cw, 3, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(title, mx + 4, y + 5.5);
    };

    const drawField = (label: string, value: string, xPos: number, yPos: number, maxWidth: number) => {
      const safeValue = value?.trim() ? value : "—";
      const lines = doc.splitTextToSize(safeValue, maxWidth);
      doc.setFont(FONT, "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text(label, xPos, yPos);
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(lines, xPos, yPos + 4);
      return lines.length;
    };

    const drawFieldGridSection = (
      title: string,
      rows: Array<[{ label: string; value: string }, { label: string; value: string }?]>,
    ) => {
      const innerX = mx + 4;
      const columnGap = 8;
      const colW = (cw - 8 - columnGap) / 2;

      const rowHeights = rows.map(([left, right]) => {
        const leftLines = doc.splitTextToSize(left.value?.trim() ? left.value : "—", colW).length;
        const rightLines = right ? doc.splitTextToSize(right.value?.trim() ? right.value : "—", colW).length : 0;
        return 9 + Math.max(leftLines, rightLines, 1) * 4.5;
      });

      const totalHeight = 12 + rowHeights.reduce((sum, h) => sum + h, 0) + 2;
      ensureSpace(totalHeight + gap);
      drawCard(title, totalHeight);

      let cy = y + 12;
      rows.forEach(([left, right], index) => {
        drawField(left.label, left.value, innerX, cy, colW);
        if (right) {
          drawField(right.label, right.value, innerX + colW + columnGap, cy, colW);
        }
        cy += rowHeights[index];
      });

      y += totalHeight + gap;
    };

    const drawAddressSection = (address: string) => {
      const lines = doc.splitTextToSize(address?.trim() ? address : "Não informado", cw - 10);
      const totalHeight = 13 + lines.length * 5;
      ensureSpace(totalHeight + gap);

      doc.setDrawColor(...ADDRESS_BORDER);
      doc.setLineWidth(0.5);
      doc.setFillColor(...ADDRESS_BG);
      doc.roundedRect(mx, y, cw, totalHeight, 2, 2, "FD");
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...ADDRESS_TITLE);
      doc.text("ENDEREÇO DE ENTREGA", mx + 4, y + 6.5);
      doc.setFont(FONT, "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(lines, mx + 4, y + 13);

      y += totalHeight + gap;
    };

    const drawValueSection = () => {
      const totalHeight = 14;
      ensureSpace(totalHeight + gap);
      doc.setDrawColor(...PRIMARY);
      doc.setLineWidth(0.5);
      doc.setFillColor(...PRIMARY_LIGHT);
      doc.roundedRect(mx, y, cw, totalHeight, 2, 2, "FD");
      doc.setFont(FONT, "bold");
      doc.setFontSize(11);
      doc.setTextColor(...PRIMARY);
      doc.text("VALOR TOTAL À VISTA", mx + 4, y + 8.5);
      doc.text(formatCurrency(totalValorAvista), pw - mx - 4, y + 8.5, { align: "right" });
      y += totalHeight + gap;
    };

    const drawEnvironmentsSection = () => {
      if (environments.length === 0) return;
      const totalHeight = 18 + environments.length * 7;
      ensureSpace(totalHeight + gap);
      drawCard(`AMBIENTES VENDIDOS (${environments.length})`, totalHeight);

      const tableTop = y + 10;
      doc.setFillColor(...BG_ALT);
      doc.rect(mx, tableTop, cw, 7, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("Ambiente", mx + 4, tableTop + 5);
      doc.text("Valor", pw - mx - 4, tableTop + 5, { align: "right" });

      let rowY = tableTop + 9;
      environments.forEach((env, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(...BG_ALT);
          doc.rect(mx, rowY - 3.5, cw, 7, "F");
        }
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.1);
        doc.line(mx, rowY + 3.5, pw - mx, rowY + 3.5);
        doc.setFont(FONT, "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...DARK);
        doc.text(env.name, mx + 4, rowY + 1);
        doc.setFont(FONT, "bold");
        doc.text(formatCurrency(env.value), pw - mx - 4, rowY + 1, { align: "right" });
        rowY += 7;
      });

      y += totalHeight + gap;
    };

    const drawUtilitiesSection = () => {
      const utilitarios = [
        "Refrigerador",
        "Fogão / Cooktop",
        "Forno Elétrico",
        "Micro-ondas",
        "Lava Louças",
        "Lava Roupas",
        "Aquecedor",
        "Adega",
        "Climatizador",
        "Ar Condicionado",
        "TV",
        "Cama Box",
        "",
        "",
        "",
        "",
      ];

      const totalHeight = 19 + utilitarios.length * 7;
      ensureSpace(totalHeight + gap);
      drawCard("DIMENSÕES DE UTILITÁRIOS", totalHeight);

      const nameW = cw * 0.4;
      const dimW = (cw - nameW) / 3;
      const tableY = y + 10;
      const colStarts = [mx, mx + nameW, mx + nameW + dimW, mx + nameW + dimW * 2];

      doc.setFillColor(...PRIMARY);
      doc.rect(mx, tableY, cw, 7, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text("UTILITÁRIO", colStarts[0] + 4, tableY + 5);
      doc.text("LARGURA", colStarts[1] + 3, tableY + 5);
      doc.text("ALTURA", colStarts[2] + 3, tableY + 5);
      doc.text("PROFUNDIDADE", colStarts[3] + 3, tableY + 5);

      let rowY = tableY + 8;
      utilitarios.forEach((item, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(...BG_ALT);
          doc.rect(mx, rowY - 1, cw, 7, "F");
        }
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.2);
        for (let i = 1; i < 4; i++) {
          doc.line(colStarts[i], rowY - 1, colStarts[i], rowY + 6);
        }
        doc.line(mx, rowY + 6, pw - mx, rowY + 6);
        doc.setFont(FONT, item ? "normal" : "italic");
        doc.setFontSize(8);
        doc.setTextColor(...DARK);
        doc.text(item || "________________", colStarts[0] + 4, rowY + 4);
        rowY += 7;
      });

      y += totalHeight + gap;
    };

    const drawObservationsSection = () => {
      const obsText = observacoes.trim();
      const lines = obsText ? doc.splitTextToSize(obsText, cw - 8) : [];
      const totalHeight = obsText ? 13 + lines.length * 5 : 13 + 5 * 7;
      ensureSpace(totalHeight + gap);
      drawCard("OBSERVAÇÕES GERAIS", totalHeight);

      let currentY = y + 13;
      doc.setFont(FONT, "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK);

      if (obsText) {
        doc.text(lines, mx + 4, currentY);
      } else {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.15);
        for (let i = 0; i < 5; i++) {
          doc.line(mx + 4, currentY + 2, pw - mx - 4, currentY + 2);
          currentY += 7;
        }
      }

      y += totalHeight + gap;
    };

    const drawPhotoPages = async () => {
      const imageEntries = environments.flatMap((env) =>
        (envAttachments[env.id] || []).filter((attachment) => attachment.kind === "image").map((attachment) => ({
          envName: env.name,
          attachment,
        })),
      );

      if (imageEntries.length === 0) return;

      const slotHeight = 84;
      const imageMaxHeight = 62;
      let slotIndex = 0;

      for (const entry of imageEntries) {
        if (slotIndex % 3 === 0) {
          doc.addPage();
          y = topStart;
          drawCard("FOTOS DOS AMBIENTES", 12, WHITE);
          y += 16;
        }

        ensureSpace(slotHeight);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.35);
        doc.setFillColor(...WHITE);
        doc.roundedRect(mx, y, cw, slotHeight - 4, 2, 2, "FD");

        doc.setFont(FONT, "bold");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(entry.envName, mx + 4, y + 7);
        doc.setFont(FONT, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        doc.text(entry.attachment.name || "Imagem enviada", mx + 4, y + 12);

        try {
          const imageAsset = await loadImageAsset(entry.attachment.file, entry.attachment.name);
          const ratio = imageAsset.width / imageAsset.height;
          let drawW = cw - 8;
          let drawH = drawW / ratio;
          if (drawH > imageMaxHeight) {
            drawH = imageMaxHeight;
            drawW = drawH * ratio;
          }
          const drawX = mx + (cw - drawW) / 2;
          const drawY = y + 16;

          doc.addImage(imageAsset.dataUrl, imageAsset.format, drawX, drawY, drawW, drawH);
          doc.setDrawColor(...BORDER);
          doc.roundedRect(drawX, drawY, drawW, drawH, 1, 1, "S");
        } catch {
          doc.setFont(FONT, "normal");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY);
          doc.text("Falha ao carregar imagem.", mx + 4, y + 22);
        }

        y += slotHeight;
        slotIndex += 1;
      }
    };

    const addFooter = () => {
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page++) {
        doc.setPage(page);
        const footerY = ph - 9;
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.25);
        doc.line(mx, footerY - 3, pw - mx, footerY - 3);
        doc.setFont(FONT, "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        doc.text(`${storeData.name || "Empresa"} — Solicitação de Medida`, mx, footerY);
        doc.text(`Página ${page} de ${totalPages}`, pw - mx, footerY, { align: "right" });
      }
    };

    resetText();

    const headerHeight = 26;
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pw, headerHeight, "F");

    let logoRightX = mx;
    if (storeData.logo_url) {
      try {
        const logoAsset = await loadImageAsset(storeData.logo_url, "logo.png");
        const logoH = 14;
        const logoW = (logoAsset.width / logoAsset.height) * logoH;
        doc.addImage(logoAsset.dataUrl, logoAsset.format, mx, 5.5, logoW, logoH);
        logoRightX = mx + logoW + 5;
      } catch {
        logoRightX = mx;
      }
    }

    doc.setFont(FONT, "bold");
    doc.setFontSize(15);
    doc.setTextColor(...WHITE);
    doc.text("SOLICITAÇÃO DE MEDIDA", logoRightX, 11.5);
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }), logoRightX, 18);

    doc.setFont(FONT, "bold");
    doc.setFontSize(8);
    doc.text("CONTRATO / ORÇAMENTO", pw - mx, 10, { align: "right" });
    doc.setFont(FONT, "bold");
    doc.setFontSize(11);
    doc.text(doc.splitTextToSize(contractNumber, 72), pw - mx, 17, { align: "right" });

    y = 32;

    drawFieldGridSection("DADOS DA LOJA", [
      [{ label: "Loja", value: storeData.name }, { label: "CNPJ", value: storeData.cnpj }],
      [{ label: "Código da Loja", value: storeData.codigo_loja }, { label: "Gerente", value: storeData.gerente_nome }],
    ]);

    const fullAddr = [
      addressForm.street,
      addressForm.number,
      addressForm.complement,
      addressForm.district,
      addressForm.city && addressForm.state ? `${addressForm.city} - ${addressForm.state}` : addressForm.city || addressForm.state,
      addressForm.cep,
    ].filter(Boolean).join(", ") || "Não informado";

    drawFieldGridSection("DADOS DO CLIENTE", [
      [{ label: "Nome", value: client.nome || "—" }, { label: "CPF/CNPJ", value: editableFields.cpf || "—" }],
      [{ label: "Telefone", value: editableFields.telefone || "—" }, { label: "Email", value: editableFields.email || "—" }],
      [{ label: "Vendedor", value: client.vendedor || "—" }],
    ]);

    drawAddressSection(fullAddr);
    drawValueSection();
    drawEnvironmentsSection();
    drawUtilitiesSection();
    drawObservationsSection();
    await drawPhotoPages();
    addFooter();

    return doc;
  }, [addressForm, client, editableFields, environments, envAttachments, formatCurrency, observacoes, sourceToDataUrl, storeData, totalValorAvista, tracking]);

  const generatePdfPreview = useCallback(async () => {
    setPdfPreviewLoading(true);
    try {
      const doc = await buildPdfDoc();

      // Render to images
      const arrayBuffer = doc.output("arraybuffer");
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const images: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        images.push(canvas.toDataURL("image/png"));
      }

      setPdfPreviewImages(images);
      setPdfPreviewOpen(true);
    } catch (err: any) {
      toast.error("Erro ao gerar pré-visualização do PDF", {
        description: err?.message || "Tente novamente.",
      });
    } finally {
      setPdfPreviewLoading(false);
    }
  }, [buildPdfDoc]);

  const downloadPdf = useCallback(async () => {
    try {
      const doc = await buildPdfDoc();
      const safeName = (client.nome || "cliente").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
      doc.save(`Solicitacao_Medida_${safeName}.pdf`);
      toast.success("PDF baixado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar PDF", { description: err?.message });
    }
  }, [buildPdfDoc, client.nome]);

  const handleSubmit = async () => {
    if (!allEnvsHaveImages) {
      toast.error("Cada ambiente precisa ter pelo menos 1 imagem anexada");
      return;
    }

    setSaving(true);
    try {
      const tenantId = await getResolvedTenantId();
      const userInfo = getAuditUserInfo();

      // Upload images to storage
      const uploadedImages: Record<string, string[]> = {};
      const uploadedAttachments: Record<string, Array<{ kind: AttachmentKind; name: string; type: string; url: string }>> = {};
      for (const env of environments) {
        const attachments = envAttachments[env.id] || [];
        const imageUrls: string[] = [];
        const attachmentUrls: Array<{ kind: AttachmentKind; name: string; type: string; url: string }> = [];
        for (const attachment of attachments) {
          const path = `measurement-requests/${client.id}/${env.id}/${Date.now()}-${attachment.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("company-assets")
            .upload(path, attachment.file);
          if (uploadError) {
            console.error("Upload error:", uploadError);
          } else {
            const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
            if (attachment.kind === "image") imageUrls.push(urlData.publicUrl);
            attachmentUrls.push({
              kind: attachment.kind,
              name: attachment.name,
              type: attachment.mimeType || attachment.kind,
              url: urlData.publicUrl,
            });
          }
        }
        uploadedImages[env.id] = imageUrls;
        uploadedAttachments[env.id] = attachmentUrls;
      }

      // Insert measurement request
      const { error } = await supabase.from("measurement_requests" as any).insert({
        client_id: client.id,
        tracking_id: tracking.id,
        tenant_id: tenantId,
        nome_cliente: client.nome,
        valor_venda_avista: totalValorAvista,
        ambientes: environments.map(e => ({
          id: e.id,
          name: e.name,
          value: e.value,
          fileName: e.fileName,
          fileUrl: e.fileUrl,
          images: uploadedImages[e.id] || [],
          attachments: uploadedAttachments[e.id] || [],
        })),
        imported_files: importedFiles,
        status: "novo",
        created_by: userInfo.usuario_nome || "Sistema",
      } as any);

      if (error) throw error;

      // Send push notifications to gerentes/técnicos
      try {
        const { data: gerentes } = await supabase
          .from("usuarios" as any)
          .select("id, nome_completo, cargo_nome")
          .eq("tenant_id", tenantId)
          .eq("ativo", true);
        if (gerentes) {
          for (const g of gerentes as any[]) {
            const cargo = (g.cargo_nome || "").toLowerCase();
            if (cargo.includes("gerente") || cargo.includes("tecnico") || cargo.includes("técnico")) {
              sendPushIfEnabled(
                "medidas",
                g.id,
                "📐 Nova Solicitação de Medida",
                `Cliente: ${client.nome} • ${environments.length} ambiente(s) • ${formatCurrency(totalValorAvista)}`,
                "medida_nova",
              );
            }
          }
        }
      } catch { /* silent */ }

      logAudit({
        acao: "solicitacao_medida_criada",
        entidade: "measurement_request",
        entidade_id: client.id,
        detalhes: {
          cliente: client.nome,
          valor: totalValorAvista,
          ambientes: environments.length,
        },
        ...userInfo,
      });

      toast.success("✅ Solicitação de medida enviada com sucesso!", {
        description: "O gerente técnico receberá a solicitação no Kanban.",
        duration: 6000,
      });

      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao enviar solicitação: " + (err.message || "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            Solicitação de Medida
          </DialogTitle>
          {tracking.numero_contrato && (
            <p className="text-xs text-muted-foreground font-mono mt-1">
              Nº Contrato: <span className="font-semibold text-foreground">{tracking.numero_contrato}</span>
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-2" style={{ maxHeight: "calc(90vh - 140px)" }}>
          <div className="space-y-4 py-4">
            {/* Store Info */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Dados da Loja
              </h4>
              <div className="flex items-center gap-3">
                {storeData.logo_url && (
                  <img src={storeData.logo_url} alt="Logo" className="h-10 w-10 rounded-md object-contain border bg-background" />
                )}
                <div className="flex-1 grid grid-cols-2 gap-1 text-sm">
                  <div><span className="text-muted-foreground">Loja:</span> <span className="font-medium">{storeData.name || "—"}</span></div>
                  <div><span className="text-muted-foreground">CNPJ:</span> <span className="font-medium font-mono">{storeData.cnpj || "—"}</span></div>
                  <div><span className="text-muted-foreground">Código:</span> <span className="font-medium font-mono">{storeData.codigo_loja || "—"}</span></div>
                  <div><span className="text-muted-foreground">Gerente:</span> <span className="font-medium">{storeData.gerente_nome || "—"}</span></div>
                </div>
              </div>
            </div>

            {/* Client Info — Editable */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Dados do Cliente
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="ml-2 font-medium">{client.nome}</span>
                </div>
                {/* Editable CPF */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">CPF/CNPJ:</span>
                  {editingField === "cpf" ? (
                    <Input
                      className="h-6 text-xs w-36 ml-1"
                      value={editableFields.cpf}
                      onChange={e => setEditableFields(p => ({ ...p, cpf: maskCpfCnpj(e.target.value) }))}
                      onBlur={() => { setEditingField(null); saveClientField("cpf", editableFields.cpf); }}
                      onKeyDown={e => { if (e.key === "Enter") { setEditingField(null); saveClientField("cpf", editableFields.cpf); } }}
                      inputMode="numeric"
                      maxLength={18}
                      autoFocus
                    />
                  ) : (
                    <button className="ml-1 font-medium hover:underline flex items-center gap-1" onClick={() => setEditingField("cpf")}>
                      {editableFields.cpf || "Clique para informar"}
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {/* Editable Phone */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Telefone:</span>
                  {editingField === "telefone" ? (
                    <Input
                      className="h-6 text-xs w-36 ml-1"
                      value={editableFields.telefone}
                      onChange={e => setEditableFields(p => ({ ...p, telefone: maskPhone(e.target.value) }))}
                      onBlur={() => { setEditingField(null); saveClientField("telefone", editableFields.telefone); }}
                      onKeyDown={e => { if (e.key === "Enter") { setEditingField(null); saveClientField("telefone", editableFields.telefone); } }}
                      inputMode="tel"
                      maxLength={15}
                      autoFocus
                    />
                  ) : (
                    <button className="ml-1 font-medium hover:underline flex items-center gap-1" onClick={() => setEditingField("telefone")}>
                      {editableFields.telefone || "Clique para informar"}
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {/* Editable Email */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Email:</span>
                  {editingField === "email" ? (
                    <Input
                      className="h-6 text-xs w-36 ml-1"
                      value={editableFields.email}
                      onChange={e => setEditableFields(p => ({ ...p, email: e.target.value }))}
                      onBlur={() => { setEditingField(null); saveClientField("email", editableFields.email); }}
                      onKeyDown={e => { if (e.key === "Enter") { setEditingField(null); saveClientField("email", editableFields.email); } }}
                      autoFocus
                    />
                  ) : (
                    <button className="ml-1 font-medium hover:underline flex items-center gap-1" onClick={() => setEditingField("email")}>
                      {editableFields.email || "Clique para informar"}
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Nº Contrato:</span>
                  <span className="ml-2 font-medium font-mono">{tracking.numero_contrato}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Vendedor:</span>
                  <span className="ml-2 font-medium">{client.vendedor || "—"}</span>
                </div>
              </div>

              {/* Endereço de Entrega — editable */}
              <div className="mt-2 pt-2 border-t border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">📍 Endereço de Entrega:</span>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1 px-1.5" onClick={() => setEditingAddress(!editingAddress)}>
                    <Pencil className="h-3 w-3" /> {editingAddress ? "Fechar" : "Editar"}
                  </Button>
                </div>
                {editingAddress ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px]">CEP</Label>
                        <div className="flex gap-1">
                          <Input
                            className="h-7 text-xs"
                            placeholder="00000-000"
                            value={addressForm.cep}
                            onChange={e => {
                              const maskedCep = maskCep(e.target.value);
                              setAddressForm(p => ({ ...p, cep: maskedCep }));
                              if (maskedCep.replace(/\D/g, "").length === 8) {
                                void fetchCep(maskedCep);
                              }
                            }}
                            inputMode="numeric"
                            maxLength={9}
                          />
                          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => fetchCep(addressForm.cep)} disabled={cepLoading}>
                            <Search className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-[10px]">Rua</Label>
                        <Input className="h-7 text-xs" value={addressForm.street} onChange={e => setAddressForm(p => ({ ...p, street: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Nº</Label>
                        <Input className="h-7 text-xs" value={addressForm.number} onChange={e => setAddressForm(p => ({ ...p, number: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Complemento</Label>
                        <Input className="h-7 text-xs" value={addressForm.complement} onChange={e => setAddressForm(p => ({ ...p, complement: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Bairro</Label>
                        <Input className="h-7 text-xs" value={addressForm.district} onChange={e => setAddressForm(p => ({ ...p, district: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-[10px]">Cidade</Label>
                        <Input className="h-7 text-xs" value={addressForm.city} onChange={e => setAddressForm(p => ({ ...p, city: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-[10px]">UF</Label>
                        <Input className="h-7 text-xs" maxLength={2} value={addressForm.state} onChange={e => setAddressForm(p => ({ ...p, state: e.target.value.toUpperCase() }))} />
                      </div>
                    </div>
                    <Button size="sm" className="w-full h-7 text-xs" onClick={saveAddress}>
                      💾 Salvar Endereço
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm font-medium mt-0.5">
                    {[addressForm.street, addressForm.number, addressForm.complement, addressForm.district,
                      addressForm.city && addressForm.state ? `${addressForm.city} - ${addressForm.state}` : addressForm.city || addressForm.state,
                      addressForm.cep].filter(Boolean).join(", ") || (
                      <button className="text-muted-foreground hover:underline flex items-center gap-1" onClick={() => setEditingAddress(true)}>
                        Clique para informar endereço <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Sale Value */}
            <div className="bg-primary/5 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm font-medium">Valor Total da Venda à Vista</span>
              <span className="text-lg font-bold text-emerald-600">{formatCurrency(totalValorAvista)}</span>
            </div>

            <Separator />

            {/* Environments */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                Ambientes Vendidos ({environments.length})
              </h4>
              {environments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum ambiente encontrado nas simulações.</p>
              ) : (
                environments.map((env) => {
                  const attachments = envAttachments[env.id] || [];
                  const imageCount = attachments.filter((attachment) => attachment.kind === "image").length;
                  const hasMinImages = imageCount >= 1;
                  return (
                    <div key={env.id} className={cn(
                      "rounded-lg border p-3 space-y-2",
                      hasMinImages ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {hasMinImages ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                          <span className="text-sm font-medium">{env.name}</span>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(env.value)}</span>
                      </div>
                      {env.fileName && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>{env.fileName}</span>
                        </div>
                      )}
                      {/* Image uploads */}
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Image className="h-3 w-3" />
                          Arquivos enviados (mín. 1 imagem) * — {attachments.length} item(ns)
                        </Label>

                        {uploadProgress[env.id] !== undefined && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <Progress value={uploadProgress[env.id]} className="h-2 flex-1" />
                            <span className="text-[10px] text-muted-foreground">{Math.round(uploadProgress[env.id])}%</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {attachments.map((attachment, idx) => {
                            const preview = attachment.thumbnailUrl || attachment.previewUrl;

                            return (
                              <div key={attachment.id} className="relative group">
                                <div className="h-20 w-20 rounded-lg border-2 border-border bg-muted flex items-center justify-center overflow-hidden shadow-sm">
                                  {preview ? (
                                    <img
                                      src={preview}
                                      alt={attachment.name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                  )}
                                  {attachment.kind === "pdf" && (
                                    <div className="absolute inset-x-0 bottom-0 bg-background/90 px-1 py-0.5 text-center text-[8px] font-semibold text-foreground">
                                      PDF
                                    </div>
                                  )}
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate w-20 mt-0.5 text-center">{attachment.name}</p>
                                <button
                                  type="button"
                                  onClick={() => removeImage(env.id, idx)}
                                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                          <label className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors gap-1">
                            <Upload className="h-5 w-5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Adicionar</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                void handleFileChange(env.id, e.target.files);
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Imported Files */}
            {importedFiles.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Arquivos Importados</h4>
                  <div className="space-y-1">
                    {importedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded-md p-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <Badge variant="outline" className="text-[9px]">{f.type.toUpperCase()}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Observações Gerais */}
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                📝 Observações Gerais
              </h4>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Digite observações gerais sobre a medição, pontos de atenção, detalhes especiais do local, etc."
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-3 border-t flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="secondary"
            onClick={generatePdfPreview}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Visualizar PDF
          </Button>
          <Button
            variant="secondary"
            onClick={downloadPdf}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !allEnvsHaveImages}
            className="gap-2"
          >
            <Ruler className="h-4 w-4" />
            {saving ? "Enviando..." : "Salvar e Enviar Solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* PDF Preview Dialog */}
    <Dialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-4 pb-2 flex flex-row items-center justify-between">
          <DialogTitle>Pré-visualização do PDF</DialogTitle>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={downloadPdf}>
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {pdfPreviewLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Gerando pré-visualização...
            </div>
          ) : pdfPreviewImages.length > 0 ? (
            <div className="space-y-4">
              {pdfPreviewImages.map((src, index) => (
                <img
                  key={`${index}-${src.slice(0, 32)}`}
                  src={src}
                  alt={`Página ${index + 1} do PDF`}
                  className="w-full rounded-md border border-border bg-background shadow-sm"
                  loading="lazy"
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Nenhuma pré-visualização disponível.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
