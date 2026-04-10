/**
 * Modal for sending measurement requests (Solicitação de Medida).
 * Shows client data, sale value, environments, imported files and requires image uploads.
 * PDF generation delegated to measurement/MeasurementPdfBuilder.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Image, AlertTriangle, CheckCircle2, Ruler, X, Eye, Pencil, Search, Building2, Loader2, Download, Clock, Printer } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { formatCurrency } from "@/lib/financing";
import { buildMeasurementPdf } from "./measurement/MeasurementPdfBuilder";
import { parseArquivoNome } from "@/lib/parseArquivoNome";
import { maskCep, maskCodigoLoja, maskCpfCnpj, maskPhone } from "@/lib/masks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import { sendWhatsAppText } from "@/lib/whatsappSender";
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

interface AddressFormState {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

const EMPTY_ADDRESS_FORM: AddressFormState = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

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
  const { currentUser } = useCurrentUser();
  const [environments, setEnvironments] = useState<EnvironmentData[]>([]);
  const [importedFiles, setImportedFiles] = useState<{ name: string; url: string; type: string }[]>([]);
  const [envAttachments, setEnvAttachments] = useState<Record<string, EnvironmentAttachment[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewImages, setPdfPreviewImages] = useState<string[]>([]);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [existingRequestId, setExistingRequestId] = useState<string | null>(null);
  const [lastEditInfo, setLastEditInfo] = useState<{ by: string; cargo: string; at: string } | null>(null);
  const [editHistory, setEditHistory] = useState<Array<{ by: string; cargo: string; at: string; action: string }>>([]);
  const { settings } = useCompanySettings();
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  // Store data
  const [storeData, setStoreData] = useState<{ name: string; cnpj: string; logo_url: string; codigo_loja: string; gerente_nome: string }>({
    name: "", cnpj: "", logo_url: "", codigo_loja: "", gerente_nome: "",
  });

  // Editable client address
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressFormState>(EMPTY_ADDRESS_FORM);
  const addressFormRef = useRef<AddressFormState>(EMPTY_ADDRESS_FORM);
  const addressHydrationLockedRef = useRef(false);
  const modalSessionKeyRef = useRef<string | null>(null);
  const modalSessionKey = useMemo(
    () => (client?.id ? `${client.id}:${tracking?.id || "no-tracking"}` : null),
    [client?.id, tracking?.id],
  );
  const addressDraftStorageKey = useMemo(
    () => (client?.id ? `measurement-request-address:${client.id}:${tracking?.id || "no-tracking"}` : null),
    [client?.id, tracking?.id],
  );
  const sanitizeAddressForm = useCallback((value?: Partial<AddressFormState> | null): AddressFormState => ({
    cep: maskCep(String(value?.cep || "")),
    street: String(value?.street || ""),
    number: String(value?.number || ""),
    complement: String(value?.complement || ""),
    district: String(value?.district || ""),
    city: String(value?.city || ""),
    state: String(value?.state || "").toUpperCase().slice(0, 2),
  }), []);
  const normalizeAddressForm = useCallback((value?: Partial<AddressFormState> | null): AddressFormState => ({
    cep: maskCep(String(value?.cep || "")),
    street: String(value?.street || "").trim(),
    number: String(value?.number || "").trim(),
    complement: String(value?.complement || "").trim(),
    district: String(value?.district || "").trim(),
    city: String(value?.city || "").trim(),
    state: String(value?.state || "").trim().toUpperCase().slice(0, 2),
  }), []);
  const loadAddressDraft = useCallback((): AddressFormState | null => {
    if (!addressDraftStorageKey) return null;

    try {
      const stored = sessionStorage.getItem(addressDraftStorageKey);
      if (!stored) return null;
      return sanitizeAddressForm(JSON.parse(stored));
    } catch {
      return null;
    }
  }, [addressDraftStorageKey, sanitizeAddressForm]);
  const persistAddressDraft = useCallback((value: Partial<AddressFormState>) => {
    if (!addressDraftStorageKey) return;

    try {
      sessionStorage.setItem(addressDraftStorageKey, JSON.stringify(sanitizeAddressForm(value)));
    } catch {
      // ignore storage issues
    }
  }, [addressDraftStorageKey, sanitizeAddressForm]);
  const clearAddressDraft = useCallback(() => {
    if (!addressDraftStorageKey) return;

    try {
      sessionStorage.removeItem(addressDraftStorageKey);
    } catch {
      // ignore storage issues
    }
  }, [addressDraftStorageKey]);
  const getLatestAddressForm = useCallback(() => {
    const persistedDraft = loadAddressDraft();
    return persistedDraft ? normalizeAddressForm(persistedDraft) : normalizeAddressForm(addressFormRef.current);
  }, [loadAddressDraft, normalizeAddressForm]);
  const updateAddressForm = useCallback((updates: Partial<AddressFormState>) => {
    addressHydrationLockedRef.current = true;
    const next = sanitizeAddressForm({ ...addressFormRef.current, ...updates });
    addressFormRef.current = next;
    persistAddressDraft(next);
    setAddressForm(next);
  }, [persistAddressDraft, sanitizeAddressForm]);
  const isAddressComplete = useCallback((value: AddressFormState) => (
    !!(value.cep && value.street && value.city && value.state)
  ), []);
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

  const hasMeaningfulValue = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
    return true;
  };

  const pickFirstFilled = (...values: unknown[]) => values.find(hasMeaningfulValue);

  const parsePersistedValue = useCallback((value: any) => {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (!trimmed) return "";

    const looksLikeJson = (trimmed.startsWith("{") && trimmed.endsWith("}"))
      || (trimmed.startsWith("[") && trimmed.endsWith("]"));

    if (!looksLikeJson) return value;

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }, [persistAddressDraft, sanitizeAddressForm]);

  const toPersistedArray = useCallback((value: any): any[] => {
    const parsed = parsePersistedValue(value);

    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry) => {
        const normalizedEntry = parsePersistedValue(entry);
        return Array.isArray(normalizedEntry)
          ? normalizedEntry
          : normalizedEntry
            ? [normalizedEntry]
            : [];
      });
    }

    return parsed ? [parsed] : [];
  }, [parsePersistedValue]);

  const collectPersistedAttachments = useCallback((value: any): any[] => {
    const parsed = parsePersistedValue(value);

    if (!parsed) return [];

    if (Array.isArray(parsed)) {
      return toPersistedArray(parsed);
    }

    if (typeof parsed !== "object") {
      return toPersistedArray(parsed);
    }

    const candidateGroups = [
      parsed.attachments,
      parsed.images,
      parsed.imagens,
      parsed.photos,
      parsed.fotos,
      parsed.files,
      parsed.arquivos,
      parsed.gallery,
      parsed.galeria,
    ];

    const collected = candidateGroups.flatMap((group) => toPersistedArray(group));

    if (collected.length > 0) return collected;

    if (parsed.url || parsed.publicUrl || parsed.sourceUrl || parsed.path || parsed.file_path) {
      return [parsed];
    }

    return [];
  }, [parsePersistedValue, toPersistedArray]);

  const attachmentMatchesEnvironment = useCallback((value: any, env: EnvironmentData) => {
    const parsed = parsePersistedValue(value);
    if (!parsed || typeof parsed !== "object") return false;

    const idCandidates = [
      parsed.envId,
      parsed.environmentId,
      parsed.environment_id,
      parsed.ambienteId,
      parsed.ambiente_id,
      parsed.requestEnvironmentId,
    ].filter(Boolean).map((item) => String(item));

    if (idCandidates.some((candidate) => candidate === String(env.id))) {
      return true;
    }

    const nameCandidates = [
      parsed.envName,
      parsed.environmentName,
      parsed.environment_name,
      parsed.ambiente,
      parsed.ambienteNome,
      parsed.ambiente_nome,
      parsed.name,
      parsed.environment,
    ]
      .filter(Boolean)
      .map((item) => normalizeText(String(item)));

    return nameCandidates.some((candidate) => candidate === normalizeText(env.name));
  }, [parsePersistedValue]);

  const revokePreviewUrl = useCallback((url?: string) => {
    if (!url || !localPreviewUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    localPreviewUrlsRef.current.delete(url);
  }, []);

  const clearPreviewUrls = useCallback(() => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  const resolveStoredAssetUrl = useCallback((rawAttachment: any) => {
    const normalizedAttachment = parsePersistedValue(rawAttachment);
    if (!normalizedAttachment) return "";

    const attachmentSource = typeof normalizedAttachment === "object" && !Array.isArray(normalizedAttachment)
      ? normalizedAttachment.asset || normalizedAttachment.file || normalizedAttachment.attachment || normalizedAttachment
      : normalizedAttachment;

    const directUrl = typeof attachmentSource === "string"
      ? attachmentSource
      : attachmentSource?.url
        || attachmentSource?.publicUrl
        || attachmentSource?.previewUrl
        || attachmentSource?.sourceUrl
        || attachmentSource?.source_url
        || attachmentSource?.signedUrl
        || attachmentSource?.signed_url
        || "";

    if (typeof directUrl === "string" && /^(https?:|blob:|data:)/i.test(directUrl)) {
      return directUrl;
    }

    const bucket = typeof attachmentSource === "string"
      ? "company-assets"
      : attachmentSource?.bucket || attachmentSource?.bucket_name || attachmentSource?.storageBucket || "company-assets";

    const rawPath = typeof attachmentSource === "string"
      ? attachmentSource
      : attachmentSource?.path
        || attachmentSource?.storagePath
        || attachmentSource?.storage_path
        || attachmentSource?.filePath
        || attachmentSource?.file_path
        || attachmentSource?.fullPath
        || attachmentSource?.full_path
        || "";

    if (!rawPath) return "";

    const normalizedPath = String(rawPath)
      .replace(/^\/+/, "")
      .replace(new RegExp(`^${bucket}/`), "");

    const { data } = supabase.storage.from(bucket).getPublicUrl(normalizedPath);
    return data?.publicUrl || "";
  }, [parsePersistedValue]);

  const loadLatestMeasurementRequest = useCallback(async () => {
    const requestQuery = tracking?.id
      ? supabase
          .from("measurement_requests" as any)
          .select("*")
          .or(`tracking_id.eq.${tracking.id},client_id.eq.${client.id}`)
          .order("created_at", { ascending: false })
          .limit(1)
      : supabase
          .from("measurement_requests" as any)
          .select("*")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .limit(1);

    const { data } = await requestQuery;
    return (Array.isArray(data) ? data[0] : null) as Record<string, any> | null;
  }, [client.id, tracking?.id]);

  const hydrateClientState = useCallback((source: any) => {
    const merged = source || {};
    const nestedClient = [
      merged.client_snapshot,
      merged.clientSnapshot,
      merged.dados_cliente,
      merged.dadosCliente,
      merged.client,
      merged.cliente,
    ]
      .map((value) => parsePersistedValue(value))
      .find((value) => value && typeof value === "object" && !Array.isArray(value)) as Record<string, any> | undefined;

    const deliveryAddressCandidate = [
      nestedClient?.delivery_address,
      nestedClient?.deliveryAddress,
      merged.delivery_address,
      merged.deliveryAddress,
      merged.client_address,
      merged.clientAddress,
      merged.endereco_entrega,
    ]
      .map((value) => parsePersistedValue(value))
      .find((value) => value && typeof value === "object" && !Array.isArray(value)) as Record<string, any> | undefined;

    const plainDeliveryAddress = String(
      pickFirstFilled(
        typeof merged.delivery_address === "string" ? merged.delivery_address : "",
        typeof merged.client_address === "string" ? merged.client_address : "",
        typeof merged.endereco_entrega === "string" ? merged.endereco_entrega : "",
      ) || "",
    );

    const persistedDraft = loadAddressDraft();
    const resolvedAddressForm = {
      cep: maskCep(String(pickFirstFilled(
        deliveryAddressCandidate?.cep,
        nestedClient?.delivery_address_zip,
        nestedClient?.cep_entrega,
        nestedClient?.cep,
        merged.delivery_address_zip,
        merged.cep_entrega,
        merged.cep,
        (client as any)?.delivery_address_zip,
        (client as any)?.cep_entrega,
        (client as any)?.cep,
      ) || "")),
      street: String(pickFirstFilled(
        deliveryAddressCandidate?.street,
        deliveryAddressCandidate?.endereco,
        nestedClient?.delivery_address_street,
        nestedClient?.endereco_entrega,
        nestedClient?.endereco,
        merged.delivery_address_street,
        merged.endereco_entrega,
        plainDeliveryAddress,
        merged.endereco,
        (client as any)?.delivery_address_street,
        (client as any)?.endereco_entrega,
        (client as any)?.endereco,
      ) || ""),
      number: String(pickFirstFilled(
        deliveryAddressCandidate?.number,
        deliveryAddressCandidate?.numero,
        nestedClient?.delivery_address_number,
        nestedClient?.numero_entrega,
        nestedClient?.numero,
        merged.delivery_address_number,
        merged.numero_entrega,
        merged.numero,
        (client as any)?.delivery_address_number,
        (client as any)?.numero_entrega,
        (client as any)?.numero,
      ) || ""),
      complement: String(pickFirstFilled(
        deliveryAddressCandidate?.complement,
        deliveryAddressCandidate?.complemento,
        nestedClient?.delivery_address_complement,
        nestedClient?.complemento_entrega,
        nestedClient?.complemento,
        merged.delivery_address_complement,
        merged.complemento_entrega,
        merged.complemento,
        (client as any)?.delivery_address_complement,
        (client as any)?.complemento_entrega,
        (client as any)?.complemento,
      ) || ""),
      district: String(pickFirstFilled(
        deliveryAddressCandidate?.district,
        deliveryAddressCandidate?.bairro,
        nestedClient?.delivery_address_district,
        nestedClient?.bairro_entrega,
        nestedClient?.bairro,
        merged.delivery_address_district,
        merged.bairro_entrega,
        merged.bairro,
        (client as any)?.delivery_address_district,
        (client as any)?.bairro_entrega,
        (client as any)?.bairro,
      ) || ""),
      city: String(pickFirstFilled(
        deliveryAddressCandidate?.city,
        deliveryAddressCandidate?.cidade,
        nestedClient?.delivery_address_city,
        nestedClient?.cidade_entrega,
        nestedClient?.cidade,
        merged.delivery_address_city,
        merged.cidade_entrega,
        merged.cidade,
        (client as any)?.delivery_address_city,
        (client as any)?.cidade_entrega,
        (client as any)?.cidade,
      ) || ""),
      state: String(pickFirstFilled(
        deliveryAddressCandidate?.state,
        deliveryAddressCandidate?.uf,
        nestedClient?.delivery_address_state,
        nestedClient?.uf_entrega,
        nestedClient?.estado,
        nestedClient?.uf,
        merged.delivery_address_state,
        merged.uf_entrega,
        merged.estado,
        merged.uf,
        (client as any)?.delivery_address_state,
        (client as any)?.uf_entrega,
        (client as any)?.estado,
        (client as any)?.uf,
      ) || ""),
    };
    const nextAddressForm = persistedDraft || resolvedAddressForm;

    setEditableFields({
      telefone: maskPhone(String(pickFirstFilled(
        nestedClient?.telefone1,
        nestedClient?.telefone,
        nestedClient?.telefone_whatsapp,
        merged.telefone1,
        merged.telefone,
        merged.telefone_whatsapp,
        client.telefone1,
      ) || "")),
      email: String(pickFirstFilled(
        nestedClient?.email,
        merged.email,
        client.email,
      ) || ""),
      cpf: maskCpfCnpj(String(pickFirstFilled(
        nestedClient?.cpf,
        nestedClient?.cpf_cnpj,
        merged.cpf,
        merged.cpf_cnpj,
        client.cpf,
        tracking.cpf_cnpj,
      ) || "")),
    });

    if (!addressHydrationLockedRef.current) {
      addressFormRef.current = nextAddressForm;
      setAddressForm(nextAddressForm);

      if (!isAddressComplete(nextAddressForm)) {
        setEditingAddress(true);
        setTimeout(() => toast.warning("⚠️ Endereço de entrega não encontrado. Por favor, preencha o endereço abaixo."), 500);
      } else {
        setEditingAddress(false);
      }
    }

    setEditingField(null);
  }, [client, isAddressComplete, loadAddressDraft, parsePersistedValue, tracking.cpf_cnpj]);

  useEffect(() => {
    if (!open || !client?.id || !modalSessionKey) return;
    let active = true;
    const isFreshSession = modalSessionKeyRef.current !== modalSessionKey;

    if (isFreshSession) {
      modalSessionKeyRef.current = modalSessionKey;
      initialLoadDoneRef.current = false;
      addressHydrationLockedRef.current = false;
      clearPreviewUrls();
      setEnvAttachments({});
      setUploadProgress({});
      setObservacoes("");
      setExistingRequestId(null);
      setLastEditInfo(null);
      setPdfPreviewImages([]);
      setPdfPreviewOpen(false);
      hydrateClientState(client as any);
    }

    const loadFreshClient = async () => {
      const [clientRes, latestRequest] = await Promise.all([
        (supabase as any)
          .from("clients")
          .select("*")
          .eq("id", client.id)
          .maybeSingle(),
        loadLatestMeasurementRequest(),
      ]);

      if (active) {
        hydrateClientState({ ...(clientRes.data as Record<string, any> || {}), ...(latestRequest || {}) });
      }
    };

    if (isFreshSession) {
      void loadFreshClient();
    }

    return () => {
      active = false;
    };
  }, [clearPreviewUrls, client, hydrateClientState, loadLatestMeasurementRequest, modalSessionKey, open]);

  useEffect(() => {
    if (!open) {
      modalSessionKeyRef.current = null;
    }
  }, [open]);

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
        (supabase as any).from("usuarios").select("nome_completo, cargo_id").eq("tenant_id", tenantId).eq("ativo", true),
        (supabase as any).from("cargos").select("id, nome").eq("tenant_id", tenantId),
      ]);

      const company = companyRes.data || {};
      const cargos = (cargosRes.data || []) as any[];
      // Priority: find cargo named "gerente" first, then fallback to "administrador"/"gestor"
      const gerenteCargo = cargos.find((c: any) => normalizeText(c.nome).includes("gerente"))
        || cargos.find((c: any) => {
          const n = normalizeText(c.nome);
          return n.includes("administrador") || n.includes("gestor");
        });

      const usuarios = (gerenteRes.data || []) as any[];
      let gerente = gerenteCargo
        ? usuarios.find((u: any) => u.cargo_id === gerenteCargo.id)
        : null;
      if (!gerente) {
        // Fallback: resolve each user's cargo name from cargos list, prioritize "gerente"
        gerente = usuarios.find((u: any) => {
          const cargoObj = cargos.find((c: any) => c.id === u.cargo_id);
          return cargoObj && normalizeText(cargoObj.nome).includes("gerente");
        }) || usuarios.find((u: any) => {
          const cargoObj = cargos.find((c: any) => c.id === u.cargo_id);
          if (!cargoObj) return false;
          const cargoName = normalizeText(cargoObj.nome);
          return cargoName.includes("administrador") || cargoName.includes("gestor");
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
        addressHydrationLockedRef.current = true;
        const next = sanitizeAddressForm({
          ...addressFormRef.current,
          street: data.logradouro || addressFormRef.current.street,
          district: data.bairro || addressFormRef.current.district,
          city: data.localidade || addressFormRef.current.city,
          state: data.uf || addressFormRef.current.state,
        });
        addressFormRef.current = next;
        persistAddressDraft(next);
        setAddressForm(next);
        toast.success("CEP encontrado! Endereço preenchido automaticamente.");
      } else {
        toast.error("CEP não encontrado.");
      }
    } catch {
      toast.error("Erro ao buscar CEP.");
    }
    setCepLoading(false);
  }, [persistAddressDraft, sanitizeAddressForm]);

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
    const nextAddressForm = getLatestAddressForm();

    addressHydrationLockedRef.current = true;
    addressFormRef.current = nextAddressForm;
    setAddressForm(nextAddressForm);
    persistAddressDraft(nextAddressForm);

    try {
      // Try updating with all possible address column names; ignore errors from non-existent columns
      const updatePayload: Record<string, string> = {};
      // Try common column names — PostgREST will ignore unknown columns silently on some setups
      // We attempt a minimal update first with the most likely columns
      const columnSets = [
        {
          cep_entrega: nextAddressForm.cep,
          endereco_entrega: nextAddressForm.street,
          numero_entrega: nextAddressForm.number,
          complemento_entrega: nextAddressForm.complement,
          bairro_entrega: nextAddressForm.district,
          cidade_entrega: nextAddressForm.city,
          uf_entrega: nextAddressForm.state,
        },
        {
          delivery_address_zip: nextAddressForm.cep,
          delivery_address_street: nextAddressForm.street,
          delivery_address_number: nextAddressForm.number,
          delivery_address_complement: nextAddressForm.complement,
          delivery_address_district: nextAddressForm.district,
          delivery_address_city: nextAddressForm.city,
          delivery_address_state: nextAddressForm.state,
        },
      ];

      let saved = false;
      for (const cols of columnSets) {
        const { error } = await (supabase as any).from("clients").update(cols as any).eq("id", client.id);
        if (!error) { saved = true; break; }
      }

      // Even if DB columns don't exist, the address is kept in local state for the PDF and submission
      toast.success("Endereço salvo!");
      setEditingAddress(false);
    } catch {
      // Address is still preserved in local state even if DB save fails
      toast.success("Endereço salvo localmente!");
      setEditingAddress(false);
    }
  }, [client?.id, getLatestAddressForm, persistAddressDraft]);

  // Load environments from simulations
  useEffect(() => {
    if (!client?.id || !open) return;
    if (initialLoadDoneRef.current) return;
    let active = true;
    setHydrating(true);

    const loadData = async () => {
      const [{ data: sims }, latestRequest] = await Promise.all([
        supabase
          .from("simulations")
          .select("arquivo_nome, valor_tela, desconto1, desconto2, desconto3")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .limit(1),
        loadLatestMeasurementRequest(),
      ]);
      let nextEnvironments: EnvironmentData[] = [];
      let nextImportedFiles: { name: string; url: string; type: string }[] = [];

      if (sims && sims.length > 0) {
        const sim = sims[0];
        try {
          if (sim.arquivo_nome) {
            const parsedData = parseArquivoNome(sim.arquivo_nome);
            const envArray = parsedData.environments;
            nextEnvironments = envArray.map((e: any, i: number) => {
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

            nextImportedFiles = envArray
              .filter((e: any) => e.fileUrl && e.fileName)
              .map((e: any) => ({
                name: e.fileName,
                url: e.fileUrl,
                type: e.fileName.split(".").pop()?.toLowerCase() || "",
              }));
          }
        } catch {
          const vt = Number(sim.valor_tela) || 0;
          const d1 = Number(sim.desconto1) || 0;
          const d2 = Number(sim.desconto2) || 0;
          const d3 = Number(sim.desconto3) || 0;
          const after1 = vt * (1 - d1 / 100);
          const after2 = after1 * (1 - d2 / 100);
          const valorAvista = after2 * (1 - d3 / 100);
          nextEnvironments = [{ id: "env-1", name: "Ambiente 1", value: valorAvista }];
        }
      }

      if (latestRequest?.ambientes?.length && nextEnvironments.length === 0) {
        nextEnvironments = latestRequest.ambientes.map((env: any, index: number) => ({
          id: env.id || `saved-env-${index}`,
          name: env.name || `Ambiente ${index + 1}`,
          value: Number(env.value) || 0,
          fileUrl: env.fileUrl,
          fileName: env.fileName,
        }));
      }

      const attachmentEntries = await Promise.all(nextEnvironments.map(async (env) => {
        const savedEnv = (latestRequest?.ambientes || []).find((item: any) =>
          String(item?.id || "") === String(env.id) || normalizeText(item?.name) === normalizeText(env.name),
        );

        const envLevelAttachments = savedEnv ? collectPersistedAttachments(savedEnv) : [];
        const requestLevelAttachments = collectPersistedAttachments(latestRequest).filter((item) =>
          attachmentMatchesEnvironment(item, env),
        );
        const requestFallbackAttachments = collectPersistedAttachments(latestRequest).filter((item) => {
          const parsed = parsePersistedValue(item);
          if (!parsed || typeof parsed !== "object") return nextEnvironments[0]?.id === env.id;

          const hasEnvironmentRef = Boolean(
            parsed.envId
            || parsed.environmentId
            || parsed.environment_id
            || parsed.ambienteId
            || parsed.ambiente_id
            || parsed.envName
            || parsed.environmentName
            || parsed.environment_name
            || parsed.ambiente
            || parsed.ambienteNome
            || parsed.ambiente_nome,
          );

          return !hasEnvironmentRef && nextEnvironments[0]?.id === env.id;
        });

        const rawAttachments = envLevelAttachments.length > 0
          ? envLevelAttachments
          : requestLevelAttachments.length > 0
            ? requestLevelAttachments
            : requestFallbackAttachments;

        const normalized = (await Promise.all(rawAttachments.map((item: any, index: number) =>
          buildPersistedAttachment(env.id, env.name, item, index),
        ))).filter((attachment): attachment is EnvironmentAttachment => Boolean(attachment));

        return [env.id, normalized] as const;
      }));

      if (!active) return;

      setEnvironments(nextEnvironments);
      setImportedFiles(
        Array.isArray(latestRequest?.imported_files) && latestRequest.imported_files.length > 0
          ? latestRequest.imported_files
          : nextImportedFiles,
      );
      setEnvAttachments(Object.fromEntries(attachmentEntries.filter(([, attachments]) => attachments.length > 0)));
      setObservacoes(latestRequest?.observacoes || "");
      setExistingRequestId(latestRequest?.id || null);
      if (latestRequest?.last_edited_by) {
        setLastEditInfo({
          by: latestRequest.last_edited_by,
          cargo: latestRequest.last_edited_by_cargo || "",
          at: latestRequest.last_edited_at || latestRequest.updated_at || "",
        });
      } else if (latestRequest?.id) {
        setLastEditInfo({
          by: latestRequest.created_by || "Sistema",
          cargo: "",
          at: latestRequest.created_at || "",
        });
      }
      initialLoadDoneRef.current = true;

      // Build edit history from the request
      const history: Array<{ by: string; cargo: string; at: string; action: string }> = [];
      if (latestRequest?.created_by && latestRequest?.created_at) {
        history.push({ by: latestRequest.created_by, cargo: "", at: latestRequest.created_at, action: "Criou a solicitação" });
      }
      if (latestRequest?.last_edited_by && latestRequest?.last_edited_at && latestRequest.last_edited_at !== latestRequest.created_at) {
        history.push({ by: latestRequest.last_edited_by, cargo: latestRequest.last_edited_by_cargo || "", at: latestRequest.last_edited_at, action: "Editou a solicitação" });
      }
      setEditHistory(history);
      setHydrating(false);

      if (latestRequest) {
        hydrateClientState({ ...(client as any), ...(latestRequest as Record<string, any>) });
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [attachmentMatchesEnvironment, client, collectPersistedAttachments, hydrateClientState, loadLatestMeasurementRequest, normalizeText, open, parsePersistedValue]);

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

  async function buildPersistedAttachment(
    envId: string,
    envName: string,
    rawAttachment: any,
    index: number,
  ): Promise<EnvironmentAttachment | null> {
    const normalizedAttachment = parsePersistedValue(rawAttachment);
    const sourceUrl = resolveStoredAssetUrl(normalizedAttachment);

    if (!sourceUrl) return null;

    const name = typeof normalizedAttachment === "string"
      ? `${envName} ${index + 1}`
      : normalizedAttachment?.name || normalizedAttachment?.file_name || `${envName} ${index + 1}`;
    const mimeType = typeof normalizedAttachment === "string"
      ? ""
      : normalizedAttachment?.type || normalizedAttachment?.mimeType || normalizedAttachment?.mime_type || "";
    const inferredKind = typeof normalizedAttachment === "string"
      ? getFileKind({ type: mimeType, name: `${name} ${sourceUrl}` })
      : normalizedAttachment?.kind || getFileKind({ type: mimeType, name: `${name} ${sourceUrl}` });

    if (inferredKind === "other") return null;

    const thumbnailUrl = inferredKind === "pdf"
      ? (await createPdfThumbnail(sourceUrl)) || sourceUrl
      : sourceUrl;

    return {
      id: `${envId}-persisted-${normalizedAttachment?.id || normalizedAttachment?.path || index}`,
      kind: inferredKind,
      mimeType,
      name,
      previewUrl: sourceUrl,
      thumbnailUrl,
      sourceUrl,
    };
  }

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

  const allEnvsHaveAttachments = environments.length > 0 &&
    environments.every(env => (envAttachments[env.id] || []).length >= 1);

  const hasAddress = isAddressComplete(addressForm);

  const totalValorAvista = environments.reduce((sum, e) => sum + e.value, 0);

  const attachmentGalleryEntries = useMemo(() => environments.flatMap((env) =>
    (envAttachments[env.id] || [])
      .map((attachment) => ({
        envId: env.id,
        envName: env.name,
        attachment,
      })),
  ), [environments, envAttachments]);

  const imageGalleryEntries = useMemo(
    () => attachmentGalleryEntries.filter(({ attachment }) => attachment.kind === "image"),
    [attachmentGalleryEntries],
  );

  const persistClientSnapshot = useCallback(async () => {
    const normalizedAddress = getLatestAddressForm();

    addressHydrationLockedRef.current = true;
    addressFormRef.current = normalizedAddress;
    setAddressForm(normalizedAddress);
    persistAddressDraft(normalizedAddress);

    // Update only columns that exist on the clients table
    await (supabase as any).from("clients").update({
      telefone1: editableFields.telefone,
      email: editableFields.email,
      cpf: editableFields.cpf,
    } as any).eq("id", client.id);

    // Try saving address columns (may not exist on all setups)
    try {
      await (supabase as any).from("clients").update({
        cep_entrega: normalizedAddress.cep,
        endereco_entrega: normalizedAddress.street,
        numero_entrega: normalizedAddress.number,
        complemento_entrega: normalizedAddress.complement,
        bairro_entrega: normalizedAddress.district,
        cidade_entrega: normalizedAddress.city,
        uf_entrega: normalizedAddress.state,
      } as any).eq("id", client.id);
    } catch { /* columns may not exist — address is saved in measurement_request payload */ }
  }, [client.id, editableFields, getLatestAddressForm, persistAddressDraft]);

  const buildPdfDoc = useCallback(async () => {
    return buildMeasurementPdf({
      client: { nome: client.nome, vendedor: client.vendedor },
      tracking: { numero_contrato: tracking?.numero_contrato, projetista: tracking?.projetista },
      storeData,
      addressForm,
      editableFields,
      environments,
      attachmentGalleryEntries,
      observacoes,
      totalValorAvista,
    });
  }, [addressForm, client, editableFields, environments, attachmentGalleryEntries, observacoes, storeData, totalValorAvista, tracking]);

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
    const normalizedAddress = getLatestAddressForm();
    addressHydrationLockedRef.current = true;
    addressFormRef.current = normalizedAddress;
    setAddressForm(normalizedAddress);
    persistAddressDraft(normalizedAddress);

    if (!allEnvsHaveAttachments) {
      toast.error("Cada ambiente precisa ter pelo menos 1 arquivo anexado (imagem ou PDF)");
      return;
    }
    if (!isAddressComplete(normalizedAddress)) {
      toast.error("Complete o endereço de entrega antes de enviar a solicitação");
      setEditingAddress(true);
      return;
    }

    setSaving(true);
    try {
      const tenantId = await getResolvedTenantId();
      const userInfo = getAuditUserInfo();

      // Fetch current user's name and cargo for edit tracking
      let userCargoNome = currentUser?.cargo_nome || "";
      let userNomeCompleto = currentUser?.nome_completo || "";
      let sellerNomeResolvido = client.vendedor || tracking?.projetista || "";
      let sellerCargoResolvido = "";
      try {
        // Try multiple strategies to find the current user
        let userRow: any = null;

        // Strategy 1: Use auth_user_id from Supabase Auth session
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (uid && tenantId) {
          const { data } = await (supabase as any)
            .from("usuarios")
            .select("nome_completo, cargo_id")
            .eq("auth_user_id", uid)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          userRow = data;
        }

        // Strategy 2: Fallback to current_user_id from localStorage
        if (!userRow?.nome_completo) {
          const localUserId = localStorage.getItem("current_user_id");
          if (localUserId) {
            const { data } = await (supabase as any)
              .from("usuarios")
              .select("nome_completo, cargo_id")
              .eq("id", localUserId)
              .maybeSingle();
            if (data?.nome_completo) userRow = data;
          }
        }

        userNomeCompleto = userNomeCompleto || userRow?.nome_completo || "";
        if (!userCargoNome && userRow?.cargo_id) {
          const { data: cargoRow } = await (supabase as any)
            .from("cargos")
            .select("nome")
            .eq("id", userRow.cargo_id)
            .maybeSingle();
          userCargoNome = cargoRow?.nome || "";
        }

        if (tenantId && (client as any)?.responsavel_id) {
          const { data: sellerRow } = await (supabase as any)
            .from("usuarios")
            .select("nome_completo, apelido, cargo_id")
            .eq("id", (client as any).responsavel_id)
            .eq("tenant_id", tenantId)
            .maybeSingle();

          sellerNomeResolvido = sellerNomeResolvido || sellerRow?.nome_completo || sellerRow?.apelido || "";

          if (sellerRow?.cargo_id) {
            const { data: sellerCargoRow } = await (supabase as any)
              .from("cargos")
              .select("nome")
              .eq("id", sellerRow.cargo_id)
              .maybeSingle();
            sellerCargoResolvido = sellerCargoRow?.nome || "";
          }
        }
      } catch { /* silent */ }

      await persistClientSnapshot();

      // Upload images to storage
      const uploadedImages: Record<string, string[]> = {};
      const uploadedAttachments: Record<string, Array<{ kind: AttachmentKind; name: string; type: string; url: string }>> = {};
      for (const env of environments) {
        const attachments = envAttachments[env.id] || [];
        const imageUrls: string[] = [];
        const attachmentUrls: Array<{ kind: AttachmentKind; name: string; type: string; url: string }> = [];
        for (const attachment of attachments) {
          if (!attachment.file) {
            const existingUrl = attachment.sourceUrl || attachment.previewUrl;
            if (!existingUrl) continue;
            if (attachment.kind === "image") imageUrls.push(existingUrl);
            attachmentUrls.push({
              kind: attachment.kind,
              name: attachment.name,
              type: attachment.mimeType || attachment.kind,
              url: existingUrl,
            });
            continue;
          }

          const path = `measurement-requests/${client.id}/${env.id}/${Date.now()}-${attachment.name}`;
          const { error: uploadError } = await supabase.storage
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

      // Build the payload
      const payload = {
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
        observacoes,
        client_snapshot: {
          telefone1: editableFields.telefone,
          email: editableFields.email,
          cpf: editableFields.cpf,
          vendedor: sellerNomeResolvido || tracking?.projetista || "",
          projetista: tracking?.projetista || sellerNomeResolvido || "",
          responsavel_id: (client as any)?.responsavel_id || null,
          seller_id: (client as any)?.responsavel_id || null,
          seller_name: sellerNomeResolvido || tracking?.projetista || "",
          vendedor_nome: sellerNomeResolvido || null,
          projetista_nome: tracking?.projetista || sellerNomeResolvido || null,
          seller_cargo: sellerCargoResolvido || "",
          created_by_user_id: currentUser?.id || userInfo.usuario_id || null,
          created_by_user_name: userNomeCompleto || null,
          created_by_user_cargo: userCargoNome || null,
          last_edited_by_user_id: currentUser?.id || userInfo.usuario_id || null,
          last_edited_by_user_name: userNomeCompleto || null,
          last_edited_by_user_cargo: userCargoNome || null,
        },
        delivery_address: {
          cep: normalizedAddress.cep,
          street: normalizedAddress.street,
          number: normalizedAddress.number,
          complement: normalizedAddress.complement,
          district: normalizedAddress.district,
          city: normalizedAddress.city,
          state: normalizedAddress.state,
        },
        updated_at: new Date().toISOString(),
      } as any;

      let error: any = null;

      if (existingRequestId) {
        // UPDATE existing request
        payload.last_edited_by = userNomeCompleto || "Sistema";
        payload.last_edited_by_cargo = userCargoNome;
        payload.last_edited_at = new Date().toISOString();
        const res = await supabase.from("measurement_requests" as any)
          .update(payload)
          .eq("id", existingRequestId);
        error = res.error;
      } else {
        // INSERT new request
        payload.status = "novo";
        payload.created_by = userNomeCompleto || "Sistema";
        payload.last_edited_by = userNomeCompleto || "Sistema";
        payload.last_edited_by_cargo = userCargoNome;
        payload.last_edited_at = new Date().toISOString();
        const res = await supabase.from("measurement_requests" as any).insert(payload);
        error = res.error;
      }

      // Send push notifications to gerentes/técnicos
      try {
        const [{ data: pushUsuarios }, { data: pushCargos }] = await Promise.all([
          supabase.from("usuarios" as any).select("id, nome_completo, cargo_id").eq("tenant_id", tenantId).eq("ativo", true),
          supabase.from("cargos" as any).select("id, nome").eq("tenant_id", tenantId),
        ]);
        const cargoMap = new Map((pushCargos as any[] || []).map((c: any) => [c.id, normalizeText(c.nome)]));
        if (pushUsuarios) {
          for (const g of pushUsuarios as any[]) {
            const cargoName = cargoMap.get(g.cargo_id) || "";
            if (cargoName.includes("gerente") || cargoName.includes("tecnico") || cargoName.includes("técnico")) {
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

      // Send WhatsApp notification to gerentes técnicos
      if (!existingRequestId) {
        try {
          const [{ data: waUsuarios }, { data: waCargos }] = await Promise.all([
            supabase.from("usuarios" as any).select("id, nome_completo, telefone, cargo_id").eq("tenant_id", tenantId).eq("ativo", true),
            supabase.from("cargos" as any).select("id, nome").eq("tenant_id", tenantId),
          ]);
          const waCargoMap = new Map((waCargos as any[] || []).map((c: any) => [c.id, (c.nome || "").toLowerCase()]));
          if (waUsuarios) {
            for (const u of waUsuarios as any[]) {
              const cargoName = waCargoMap.get(u.cargo_id) || "";
              const isGerente = cargoName.includes("gerente") && (cargoName.includes("tecnico") || cargoName.includes("técnico"));
              if (isGerente && u.telefone) {
                const msg = `📐 *Nova Solicitação de Medida*\n\n👤 Cliente: ${client.nome}\n🏠 ${environments.length} ambiente(s)\n💰 Valor: ${formatCurrency(totalValorAvista)}\n📍 ${normalizedAddress.city ? normalizedAddress.city + " - " + normalizedAddress.state : "Sem endereço"}\n\n📋 Acesse o Kanban de Medidas para mais detalhes.`;
                sendWhatsAppText(u.telefone, msg).catch(() => {});
              }
            }
          }
        } catch { /* silent */ }
      }

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

      toast.success(existingRequestId ? "✅ Solicitação atualizada com sucesso!" : "✅ Solicitação de medida enviada com sucesso!", {
        description: existingRequestId ? "Os dados foram salvos e atualizados." : "O gerente técnico receberá a solicitação no Kanban.",
        duration: 6000,
      });

      clearAddressDraft();
      addressFormRef.current = EMPTY_ADDRESS_FORM;
      addressHydrationLockedRef.current = false;
      initialLoadDoneRef.current = false;
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
          {lastEditInfo && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-1.5 mt-2 flex items-center gap-2 text-xs">
              <Pencil className="h-3 w-3 text-amber-600 shrink-0" />
              <span className="text-muted-foreground">
                Última alteração por <span className="font-semibold text-foreground">{lastEditInfo.by}</span>
                {lastEditInfo.cargo && <span className="text-amber-600"> ({lastEditInfo.cargo})</span>}
                {lastEditInfo.at && (
                  <span> em {new Date(lastEditInfo.at).toLocaleDateString("pt-BR")} às {new Date(lastEditInfo.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-2 relative" style={{ maxHeight: "calc(90vh - 140px)" }}>
          {hydrating && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Carregando dados da solicitação...
              </div>
            </div>
          )}
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
            <div className="bg-success/10 border border-success/30 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-success">
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
              <div className="mt-2 pt-2 border-t border-success/20">
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
                              updateAddressForm({ cep: maskedCep });
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
                        <Input className="h-7 text-xs" value={addressForm.street} onChange={e => updateAddressForm({ street: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Nº</Label>
                        <Input className="h-7 text-xs" value={addressForm.number} onChange={e => updateAddressForm({ number: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Complemento</Label>
                        <Input className="h-7 text-xs" value={addressForm.complement} onChange={e => updateAddressForm({ complement: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Bairro</Label>
                        <Input className="h-7 text-xs" value={addressForm.district} onChange={e => updateAddressForm({ district: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-[10px]">Cidade</Label>
                        <Input className="h-7 text-xs" value={addressForm.city} onChange={e => updateAddressForm({ city: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px]">UF</Label>
                        <Input className="h-7 text-xs" maxLength={2} value={addressForm.state} onChange={e => updateAddressForm({ state: e.target.value.toUpperCase() })} />
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
              <span className="text-lg font-bold text-success">{formatCurrency(totalValorAvista)}</span>
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
                  const hasMinAttachments = attachments.length >= 1;
                  return (
                    <div key={env.id} className={cn(
                      "rounded-lg border p-3 space-y-2",
                      hasMinAttachments ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {hasMinAttachments ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-warning" />
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
                      {/* File uploads */}
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Image className="h-3 w-3" />
                          Arquivos enviados (mín. 1) * — {attachments.length} item(ns)
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

            {attachmentGalleryEntries.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  📸 Imagens anexadas à solicitação
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {attachmentGalleryEntries.map(({ envName, attachment }) => {
                    const preview = attachment.thumbnailUrl || attachment.previewUrl || attachment.sourceUrl;
                    if (!preview) return null;

                    return (
                      <div key={`gallery-${attachment.id}`} className="space-y-1 rounded-lg border border-border bg-card p-2">
                        <img
                          src={preview}
                          alt={attachment.name}
                          className="h-28 w-full rounded-md object-cover"
                          loading="lazy"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-medium truncate">{envName || "Ambiente"}</p>
                          {attachment.kind === "pdf" && <Badge variant="outline" className="h-5 px-1.5 text-[9px]">PDF</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{attachment.name}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Edit History */}
            {editHistory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Histórico de Alterações
                </h4>
                <div className="space-y-1.5">
                  {editHistory.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded-md px-3 py-2 border">
                      <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{entry.by}</span>
                        {entry.cargo && <span className="text-primary"> ({entry.cargo})</span>}
                        {" — "}{entry.action}
                        {entry.at && (
                          <span> em {new Date(entry.at).toLocaleDateString("pt-BR")} às {new Date(entry.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-3 border-t">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
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
                disabled={saving || !allEnvsHaveAttachments}
                className="gap-2 bg-success hover:bg-success/90 text-success-foreground shadow-md"
              >
                <Ruler className="h-4 w-4" />
                {saving ? "Salvando..." : existingRequestId ? "💾 Salvar Alterações" : "💾 Salvar e Enviar Solicitação"}
              </Button>
            </div>
          </div>
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
