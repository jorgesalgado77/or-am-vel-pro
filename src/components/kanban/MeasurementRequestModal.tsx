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
import { Upload, FileText, Image, AlertTriangle, CheckCircle2, Ruler, X, Eye, Pencil, Search, Building2, Loader2 } from "lucide-react";
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
  const [envImages, setEnvImages] = useState<Record<string, File[]>>({});
  const [envImagePreviews, setEnvImagePreviews] = useState<Record<string, string[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewImages, setPdfPreviewImages] = useState<string[]>([]);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const { settings } = useCompanySettings();

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

  // Init editable fields from client
  useEffect(() => {
    if (!open) return;
    const c = client as any;
    setEditableFields({
      telefone: maskPhone(client.telefone1 || ""),
      email: client.email || "",
      cpf: maskCpfCnpj(client.cpf || tracking.cpf_cnpj || ""),
    });
    setAddressForm({
      cep: maskCep(c.delivery_address_zip || c.cep || ""),
      street: c.delivery_address_street || c.endereco || "",
      number: c.delivery_address_number || "",
      complement: c.delivery_address_complement || "",
      district: c.delivery_address_district || c.bairro || "",
      city: c.delivery_address_city || c.cidade || "",
      state: c.delivery_address_state || c.estado || "",
    });
    setEditingAddress(false);
    setEditingField(null);
  }, [open, client?.id]);

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

  const handleFileChange = (envId: string, files: FileList | null) => {
    if (!files) return;
    const validTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
    const validFiles = Array.from(files).filter(f => validTypes.includes(f.type));
    if (validFiles.length !== files.length) {
      toast.error("Apenas imagens (PNG, JPG, WebP) e PDF são permitidos");
    }

    // Simulate progress
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

    // Generate preview URLs
    const newPreviews: string[] = [];
    for (const file of validFiles) {
      if (file.type.startsWith("image/")) {
        newPreviews.push(URL.createObjectURL(file));
      } else {
        newPreviews.push(""); // no preview for PDFs
      }
    }

    setEnvImages(prev => ({
      ...prev,
      [envId]: [...(prev[envId] || []), ...validFiles],
    }));
    setEnvImagePreviews(prev => ({
      ...prev,
      [envId]: [...(prev[envId] || []), ...newPreviews],
    }));
  };

  const removeImage = (envId: string, index: number) => {
    // Revoke URL to prevent memory leak
    const previews = envImagePreviews[envId] || [];
    if (previews[index]) URL.revokeObjectURL(previews[index]);

    setEnvImages(prev => ({
      ...prev,
      [envId]: (prev[envId] || []).filter((_, i) => i !== index),
    }));
    setEnvImagePreviews(prev => ({
      ...prev,
      [envId]: (prev[envId] || []).filter((_, i) => i !== index),
    }));
  };

  const allEnvsHaveImages = environments.length > 0 &&
    environments.every(env => (envImages[env.id] || []).length >= 1);

  const totalValorAvista = environments.reduce((sum, e) => sum + e.value, 0);

  const buildPdfDoc = useCallback(async () => {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const mx = 14;
      const cw = pw - mx * 2;

      // Colors
      const PRIMARY: [number, number, number] = [8, 145, 178];
      const PRIMARY_LIGHT: [number, number, number] = [230, 247, 250];
      const DARK: [number, number, number] = [30, 41, 59];
      const GRAY: [number, number, number] = [100, 116, 139];
      const WHITE: [number, number, number] = [255, 255, 255];
      const BORDER: [number, number, number] = [203, 213, 225];
      const BG_ALT: [number, number, number] = [248, 250, 252];

      let y = 0;

      const checkPage = (need = 20) => {
        if (y + need > ph - 18) { doc.addPage(); y = 14; }
      };

      const drawSectionFrame = (startY: number, height: number, title: string) => {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.4);
        doc.roundedRect(mx, startY, cw, height, 2, 2, "S");
        // Title bar
        doc.setFillColor(...PRIMARY);
        doc.roundedRect(mx, startY, cw, 8, 2, 2, "F");
        // Cover bottom corners of title bar
        doc.rect(mx, startY + 5, cw, 3, "F");
        doc.setTextColor(...WHITE);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(title, mx + 4, startY + 5.5);
      };

      const fieldLabel = (label: string, value: string, xPos: number, yPos: number, maxW = 80) => {
        doc.setTextColor(...GRAY);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(label, xPos, yPos);
        doc.setTextColor(...DARK);
        doc.setFont("helvetica", "bold");
        doc.text(value || "—", xPos, yPos + 4, { maxWidth: maxW });
      };

      // ══════════════════ HEADER ══════════════════
      doc.setFillColor(...PRIMARY);
      doc.rect(0, 0, pw, 28, "F");

      // Logo
      let logoX = mx;
      if (storeData.logo_url) {
        try {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = storeData.logo_url;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const logoData = canvas.toDataURL("image/png");
            const logoH = 16;
            const logoW = (img.width / img.height) * logoH;
            doc.addImage(logoData, "PNG", mx + 2, 6, logoW, logoH);
            logoX = mx + logoW + 6;
          }
        } catch {
          // skip logo if load fails
        }
      }

      doc.setTextColor(...WHITE);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("SOLICITAÇÃO DE MEDIDA", logoX, 14);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }), logoX, 20);
      doc.text(`Nº Contrato: ${tracking.numero_contrato || "—"}`, pw - mx, 14, { align: "right" });

      y = 34;

      // ══════════════════ DADOS DA LOJA ══════════════════
      const storeH = 28;
      drawSectionFrame(y, storeH, "DADOS DA LOJA");
      const sy = y + 12;
      const col1 = mx + 4;
      const col2 = mx + cw / 2 + 2;
      fieldLabel("Loja", storeData.name, col1, sy);
      fieldLabel("CNPJ", storeData.cnpj, col2, sy);
      fieldLabel("Código da Loja", storeData.codigo_loja, col1, sy + 10);
      fieldLabel("Gerente", storeData.gerente_nome, col2, sy + 10);
      y += storeH + 4;

      // ══════════════════ DADOS DO CLIENTE ══════════════════
      const fullAddr = [
        addressForm.street, addressForm.number, addressForm.complement, addressForm.district,
        addressForm.city && addressForm.state ? `${addressForm.city} - ${addressForm.state}` : addressForm.city || addressForm.state,
        addressForm.cep,
      ].filter(Boolean).join(", ") || "Não informado";

      const clientH = 42;
      drawSectionFrame(y, clientH, "DADOS DO CLIENTE");
      const cy = y + 12;
      fieldLabel("Nome", client.nome, col1, cy, cw / 2 - 10);
      fieldLabel("CPF/CNPJ", editableFields.cpf, col2, cy);
      fieldLabel("Telefone", editableFields.telefone, col1, cy + 10);
      fieldLabel("Email", editableFields.email, col2, cy + 10);
      fieldLabel("Vendedor", client.vendedor || "—", col1, cy + 20);
      fieldLabel("Endereço de Entrega", fullAddr, col2, cy + 20, cw / 2 - 8);
      y += clientH + 4;

      // ══════════════════ VALOR TOTAL ══════════════════
      doc.setFillColor(...PRIMARY_LIGHT);
      doc.setDrawColor(...PRIMARY);
      doc.setLineWidth(0.5);
      doc.roundedRect(mx, y, cw, 12, 2, 2, "FD");
      doc.setTextColor(...PRIMARY);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("VALOR TOTAL À VISTA", mx + 4, y + 7.5);
      doc.text(formatCurrency(totalValorAvista), pw - mx - 4, y + 7.5, { align: "right" });
      y += 16;

      // ══════════════════ AMBIENTES ══════════════════
      if (environments.length > 0) {
        checkPage(30);
        const envStartY = y;
        // Table header
        doc.setFillColor(...PRIMARY);
        doc.roundedRect(mx, y, cw, 8, 2, 2, "F");
        doc.rect(mx, y + 5, cw, 3, "F");
        doc.setTextColor(...WHITE);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`AMBIENTES VENDIDOS (${environments.length})`, mx + 4, y + 5.5);
        y += 10;

        // Column headers
        doc.setFillColor(...BG_ALT);
        doc.rect(mx, y, cw, 7, "F");
        doc.setTextColor(...GRAY);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Ambiente", mx + 4, y + 5);
        doc.text("Valor", pw - mx - 4, y + 5, { align: "right" });
        y += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        for (let i = 0; i < environments.length; i++) {
          checkPage(8);
          const env = environments[i];
          if (i % 2 === 0) {
            doc.setFillColor(...BG_ALT);
            doc.rect(mx, y - 3.5, cw, 7, "F");
          }
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.1);
          doc.line(mx, y + 3.5, pw - mx, y + 3.5);

          doc.setTextColor(...DARK);
          doc.text(env.name, mx + 4, y + 1);
          doc.setTextColor(...DARK);
          doc.setFont("helvetica", "bold");
          doc.text(formatCurrency(env.value), pw - mx - 4, y + 1, { align: "right" });
          doc.setFont("helvetica", "normal");
          y += 7;
        }

        // Border around table
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.4);
        doc.roundedRect(mx, envStartY, cw, y - envStartY + 2, 2, 2, "S");
        y += 6;
      }

      // ══════════════════ DIMENSÕES DE UTILITÁRIOS ══════════════════
      checkPage(100);
      const utilitarios = [
        "Refrigerador", "Fogão / Cooktop", "Forno Elétrico", "Micro-ondas",
        "Lava Louças", "Lava Roupas", "Aquecedor", "Adega",
        "Climatizador", "Ar Condicionado", "TV", "Cama Box",
        "", "", "", "",
      ];

      const tblStartY = y;
      // Title bar
      doc.setFillColor(...PRIMARY);
      doc.roundedRect(mx, y, cw, 8, 2, 2, "F");
      doc.rect(mx, y + 5, cw, 3, "F");
      doc.setTextColor(...WHITE);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("DIMENSÕES DE UTILITÁRIOS", mx + 4, y + 5.5);
      y += 10;

      // Column widths
      const nameW = cw * 0.40;
      const dimW = (cw - nameW) / 3;
      const colStarts = [mx, mx + nameW, mx + nameW + dimW, mx + nameW + dimW * 2];

      // Table header row
      doc.setFillColor(...PRIMARY);
      doc.rect(mx, y, cw, 7, "F");
      doc.setTextColor(...WHITE);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("UTILITÁRIO", colStarts[0] + 4, y + 5);
      doc.text("LARGURA", colStarts[1] + 3, y + 5);
      doc.text("ALTURA", colStarts[2] + 3, y + 5);
      doc.text("PROFUNDIDADE", colStarts[3] + 3, y + 5);
      y += 8;

      // Data rows
      doc.setFontSize(8);
      const rowH = 7;
      for (let i = 0; i < utilitarios.length; i++) {
        checkPage(rowH + 2);
        if (i % 2 === 0) {
          doc.setFillColor(...BG_ALT);
          doc.rect(mx, y - 1, cw, rowH, "F");
        }

        // Vertical lines
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.2);
        for (let c = 1; c < 4; c++) {
          doc.line(colStarts[c], y - 1, colStarts[c], y + rowH - 1);
        }

        // Horizontal bottom line
        doc.line(mx, y + rowH - 1, pw - mx, y + rowH - 1);

        // Name
        doc.setTextColor(...DARK);
        doc.setFont("helvetica", utilitarios[i] ? "normal" : "italic");
        doc.text(utilitarios[i] || "", colStarts[0] + 4, y + 4);

        // Empty dimension cells (for manual fill)
        // Just draw light dotted placeholders
        if (!utilitarios[i]) {
          doc.setTextColor(200, 200, 200);
          doc.text("________________", colStarts[0] + 4, y + 4);
        }

        y += rowH;
      }

      // Border around entire table
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.4);
      doc.roundedRect(mx, tblStartY, cw, y - tblStartY + 1, 2, 2, "S");
      y += 8;

      // ══════════════════ OBSERVAÇÕES GERAIS ══════════════════
      checkPage(40);
      const obsText = observacoes.trim();
      const obsStartY = y;
      doc.setFillColor(...PRIMARY);
      doc.roundedRect(mx, y, cw, 8, 2, 2, "F");
      doc.rect(mx, y + 5, cw, 3, "F");
      doc.setTextColor(...WHITE);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("OBSERVAÇÕES GERAIS", mx + 4, y + 5.5);
      y += 11;

      doc.setTextColor(...DARK);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      if (obsText) {
        const obsLines = doc.splitTextToSize(obsText, cw - 8);
        for (const line of obsLines) {
          checkPage(6);
          doc.text(line, mx + 4, y);
          y += 5;
        }
      } else {
        // Empty lines for manual fill
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.15);
        for (let i = 0; i < 5; i++) {
          doc.line(mx + 4, y + 3, pw - mx - 4, y + 3);
          y += 7;
        }
      }
      y += 2;

      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.4);
      doc.roundedRect(mx, obsStartY, cw, y - obsStartY, 2, 2, "S");
      y += 8;

      // ══════════════════ IMAGENS DOS AMBIENTES ══════════════════
      // Convert uploaded File objects to data URLs and render 3 per page
      const imgH = 75; // image height in mm
      const imgGap = 6;
      const imgContentW = cw;

      for (const env of environments) {
        const files = envImages[env.id] || [];
        if (files.length === 0) continue;

        // Load all images as data URLs
        const dataUrls: string[] = [];
        for (const file of files) {
          if (!file.type.startsWith("image/")) continue;
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          dataUrls.push(dataUrl);
        }

        if (dataUrls.length === 0) continue;

        let imgCount = 0;
        for (const dataUrl of dataUrls) {
          // Check if we need a new page (3 images per page)
          if (imgCount % 3 === 0 || y + imgH + 20 > ph - 18) {
            doc.addPage();
            y = 14;
            imgCount = 0;

            // Section title on each new image page
            doc.setFillColor(...PRIMARY);
            doc.roundedRect(mx, y, cw, 8, 2, 2, "F");
            doc.rect(mx, y + 5, cw, 3, "F");
            doc.setTextColor(...WHITE);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(`FOTOS — ${env.name}`, mx + 4, y + 5.5);
            y += 12;
          }

          // Draw image with border
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.3);
          try {
            // Load image to get aspect ratio
            const tempImg = new window.Image();
            await new Promise<void>((resolve) => {
              tempImg.onload = () => resolve();
              tempImg.onerror = () => resolve();
              tempImg.src = dataUrl;
            });

            const aspect = tempImg.width / tempImg.height;
            let drawW = imgContentW;
            let drawH = drawW / aspect;
            if (drawH > imgH) {
              drawH = imgH;
              drawW = drawH * aspect;
            }
            const drawX = mx + (imgContentW - drawW) / 2;

            doc.addImage(dataUrl, "JPEG", drawX, y, drawW, drawH);
            doc.roundedRect(drawX, y, drawW, drawH, 1, 1, "S");
            y += drawH + imgGap;
          } catch {
            // Skip failed image
            doc.setTextColor(...GRAY);
            doc.setFontSize(8);
            doc.text("(Imagem não carregada)", mx + 4, y + 10);
            y += 16;
          }

          imgCount++;
        }
      }

      // ══════════════════ FOOTER ══════════════════
      const addFooter = () => {
        const totalPages = (doc as any).internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          const footerY = ph - 10;
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.3);
          doc.line(mx, footerY - 3, pw - mx, footerY - 3);
          doc.setTextColor(...GRAY);
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.text(
            `${storeData.name || "Empresa"} — Solicitação de Medida gerada automaticamente pelo sistema.`,
            pw / 2, footerY, { align: "center" }
          );
          doc.text(`Página ${p} de ${totalPages}`, pw - mx, footerY, { align: "right" });
        }
      };
      addFooter();

      return doc;
  }, [addressForm, client, editableFields, environments, envImages, storeData, totalValorAvista, tracking.numero_contrato, observacoes]);

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
      for (const env of environments) {
        const files = envImages[env.id] || [];
        const urls: string[] = [];
        for (const file of files) {
          const path = `measurement-requests/${client.id}/${env.id}/${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("company-assets")
            .upload(path, file);
          if (uploadError) {
            console.error("Upload error:", uploadError);
            urls.push(""); // placeholder
          } else {
            const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
            urls.push(urlData.publicUrl);
          }
        }
        uploadedImages[env.id] = urls;
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
                  const images = envImages[env.id] || [];
                  const hasMinImages = images.length >= 1;
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
                          Imagens iniciais (mín. 1) * — {images.length} enviada(s)
                        </Label>

                        {/* Upload progress */}
                        {uploadProgress[env.id] !== undefined && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <Progress value={uploadProgress[env.id]} className="h-2 flex-1" />
                            <span className="text-[10px] text-muted-foreground">{Math.round(uploadProgress[env.id])}%</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {images.map((file, idx) => {
                            const preview = (envImagePreviews[env.id] || [])[idx];
                            return (
                              <div key={idx} className="relative group">
                                <div className="h-20 w-20 rounded-lg border-2 border-border bg-muted flex items-center justify-center overflow-hidden shadow-sm">
                                  {preview ? (
                                    <img
                                      src={preview}
                                      alt={file.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                  )}
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate w-20 mt-0.5 text-center">{file.name}</p>
                                <button
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
                              onChange={(e) => handleFileChange(env.id, e.target.files)}
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
        <DialogHeader className="px-6 pt-4 pb-2">
          <DialogTitle>Pré-visualização do PDF</DialogTitle>
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
