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
import { Upload, FileText, Image, AlertTriangle, CheckCircle2, Ruler, X, Eye, Pencil, Search, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { formatCurrency } from "@/lib/financing";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import type { Client, LastSimInfo } from "./kanbanTypes";
import type { ClientTrackingRecord } from "@/hooks/useClientTracking";

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
  const [saving, setSaving] = useState(false);
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

  // Init editable fields from client
  useEffect(() => {
    if (!open) return;
    const c = client as any;
    setEditableFields({
      telefone: client.telefone1 || "",
      email: client.email || "",
      cpf: client.cpf || tracking.cpf_cnpj || "",
    });
    setAddressForm({
      cep: c.delivery_address_zip || c.cep || "",
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
      const [companyRes, gerenteRes] = await Promise.all([
        (supabase as any).from("company_settings").select("company_name, cnpj, logo_url, codigo_loja").eq("tenant_id", tenantId).maybeSingle(),
        (supabase as any).from("usuarios").select("nome_completo, cargo_nome").eq("tenant_id", tenantId).eq("ativo", true),
      ]);
      const gerente = ((gerenteRes.data || []) as any[]).find((u: any) => {
        const cargo = (u.cargo_nome || "").toLowerCase();
        return cargo.includes("gerente") || cargo.includes("administrador");
      });
      setStoreData({
        name: companyRes.data?.company_name || settings.company_name || "",
        cnpj: companyRes.data?.cnpj || "",
        logo_url: companyRes.data?.logo_url || settings.logo_url || "",
        codigo_loja: companyRes.data?.codigo_loja || settings.codigo_loja || "",
        gerente_nome: gerente?.nome_completo || "",
      });
    };
    load();
  }, [open]);

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
    setEnvImages(prev => ({
      ...prev,
      [envId]: [...(prev[envId] || []), ...validFiles],
    }));
  };

  const removeImage = (envId: string, index: number) => {
    setEnvImages(prev => ({
      ...prev,
      [envId]: (prev[envId] || []).filter((_, i) => i !== index),
    }));
  };

  const allEnvsHaveImages = environments.length > 0 &&
    environments.every(env => (envImages[env.id] || []).length >= 1);

  const totalValorAvista = environments.reduce((sum, e) => sum + e.value, 0);

  const generatePdfPreview = useCallback(async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const c = client as any;

    doc.setFontSize(16);
    doc.text("Solicitação de Medida", 20, 20);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 20, 28);

    doc.setFontSize(12);
    doc.text("Dados do Cliente", 20, 40);
    doc.setFontSize(10);
    const info = [
      `Nome: ${client.nome}`,
      `CPF/CNPJ: ${client.cpf || tracking.cpf_cnpj || "—"}`,
      `Telefone: ${client.telefone1 || "—"}`,
      `Email: ${client.email || "—"}`,
      `Nº Contrato: ${tracking.numero_contrato || "—"}`,
      `Vendedor: ${client.vendedor || "—"}`,
    ];
    const fullAddr = c.delivery_address_street
      ? [c.delivery_address_street, c.delivery_address_number, c.delivery_address_complement,
         c.delivery_address_district,
         c.delivery_address_city && c.delivery_address_state ? `${c.delivery_address_city} - ${c.delivery_address_state}` : c.delivery_address_city || c.delivery_address_state,
         c.delivery_address_zip].filter(Boolean).join(", ")
      : c.endereco_entrega || c.endereco || "Não informado";
    info.push(`Endereço de Entrega: ${fullAddr}`);

    let y = 48;
    for (const line of info) {
      const lines = doc.splitTextToSize(line, 170);
      doc.text(lines, 20, y);
      y += lines.length * 6;
    }

    y += 6;
    doc.setFontSize(12);
    doc.text(`Valor Total à Vista: ${formatCurrency(totalValorAvista)}`, 20, y);
    y += 10;

    doc.text(`Ambientes Vendidos (${environments.length})`, 20, y);
    y += 8;
    doc.setFontSize(10);
    for (const env of environments) {
      doc.text(`• ${env.name} — ${formatCurrency(env.value)}`, 24, y);
      y += 6;
      if (env.fileName) {
        doc.text(`  Arquivo: ${env.fileName}`, 28, y);
        y += 6;
      }
      const imgs = envImages[env.id] || [];
      doc.text(`  Imagens anexadas: ${imgs.length}`, 28, y);
      y += 8;
      if (y > 270) { doc.addPage(); y = 20; }
    }

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [client, tracking, environments, envImages, totalValorAvista]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            Solicitação de Medida
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-2" style={{ maxHeight: "calc(90vh - 140px)" }}>
          <div className="space-y-4 py-4">
            {/* Client Info */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Dados do Cliente
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="ml-2 font-medium">{client.nome}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">CPF/CNPJ:</span>
                  <span className="ml-2 font-medium">{client.cpf || tracking.cpf_cnpj || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="ml-2 font-medium">{client.telefone1 || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <span className="ml-2 font-medium">{client.email || "—"}</span>
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
              {/* Endereço de Entrega — always show */}
              <div className="mt-2 pt-2 border-t border-emerald-500/20">
                <span className="text-muted-foreground text-xs">📍 Endereço de Entrega:</span>
                <p className="text-sm font-medium mt-0.5">
                  {(() => {
                    const c = client as any;
                    const fullAddress = c.delivery_address_street
                      ? [
                          c.delivery_address_street,
                          c.delivery_address_number,
                          c.delivery_address_complement,
                          c.delivery_address_district,
                          c.delivery_address_city && c.delivery_address_state
                            ? `${c.delivery_address_city} - ${c.delivery_address_state}`
                            : c.delivery_address_city || c.delivery_address_state,
                          c.delivery_address_zip,
                        ].filter(Boolean).join(", ")
                      : c.endereco_entrega || c.endereco || "";
                    return fullAddress || "Endereço não informado";
                  })()}
                </p>
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
                          Imagens iniciais (mín. 1) *
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {images.map((file, idx) => (
                            <div key={idx} className="relative group">
                              <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
                                {file.type.startsWith("image/") ? (
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <FileText className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                              <button
                                onClick={() => removeImage(env.id, idx)}
                                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <label className="h-16 w-16 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                            <Upload className="h-5 w-5 text-muted-foreground" />
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
  );
}
