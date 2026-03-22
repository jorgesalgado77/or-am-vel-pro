import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { maskCpfCnpj, maskPhone, isCnpj, validateCpfCnpj } from "@/lib/masks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIndicadores } from "@/hooks/useIndicadores";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { FileText, Eye, Pencil, Printer, Clock, MessageSquare, Pause, Play, CheckCircle2, Send } from "lucide-react";
import { ContractEditorDialog } from "@/components/ContractEditorDialog";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { openContractPrintWindow } from "@/lib/contractDocument";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface ClientContract {
  id: string;
  conteudo_html: string;
  created_at: string;
  simulation_id: string | null;
}

const clientSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().max(18).optional().or(z.literal("")),
  quantidade_ambientes: z.coerce.number().int().min(0).optional(),
  descricao_ambientes: z.string().max(2000).optional().or(z.literal("")),
  telefone1: z.string().max(20).optional().or(z.literal("")),
  telefone2: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  vendedor: z.string().max(200).optional().or(z.literal("")),
  indicador_id: z.string().optional().or(z.literal("")),
});

type ClientForm = z.infer<typeof clientSchema>;

interface ClientDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ClientForm) => void;
  client?: Client | null;
  saving?: boolean;
}

export function ClientDrawer({ open, onClose, onSave, client, saving }: ClientDrawerProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
  });
  const { projetistas } = useUsuarios();
  const { activeIndicadores } = useIndicadores();

  const cpfValue = watch("cpf") || "";
  const [cpfError, setCpfError] = useState("");
  const isDocCnpj = isCnpj(cpfValue);
  const [activeTab, setActiveTab] = useState("dados");

  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [viewingContract, setViewingContract] = useState<ClientContract | null>(null);
  const [editingContract, setEditingContract] = useState<ClientContract | null>(null);
  const [savingContract, setSavingContract] = useState(false);

  // Follow-up history
  interface FollowUpRecord {
    id: string;
    stage: string;
    status: string;
    message: string | null;
    scheduled_for: string;
    sent_at: string | null;
    created_at: string;
  }
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);

  useEffect(() => {
    if (client) {
      reset({
        nome: client.nome,
        cpf: client.cpf ? maskCpfCnpj(client.cpf) : "",
        quantidade_ambientes: client.quantidade_ambientes || 0,
        descricao_ambientes: client.descricao_ambientes || "",
        telefone1: client.telefone1 ? maskPhone(client.telefone1) : "",
        telefone2: client.telefone2 ? maskPhone(client.telefone2) : "",
        email: client.email || "",
        vendedor: client.vendedor || "",
        indicador_id: client.indicador_id || "",
      });
    } else {
      reset({
        nome: "", cpf: "", quantidade_ambientes: 0, descricao_ambientes: "",
        telefone1: "", telefone2: "", email: "", vendedor: "", indicador_id: "",
      });
    }
    setCpfError("");
    setActiveTab("dados");
  }, [client, open, reset]);

  useEffect(() => {
    if (!open || !client) return;
    const fetchContracts = async () => {
      setLoadingContracts(true);
      const { data, error } = await supabase
        .from("client_contracts")
        .select("id, conteudo_html, created_at, simulation_id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar contratos do cliente");
      } else {
        setContracts((data as ClientContract[]) || []);
      }
      setLoadingContracts(false);
    };

    fetchContracts();

    // Fetch follow-ups
    const fetchFollowUps = async () => {
      setLoadingFollowUps(true);
      const { data } = await supabase
        .from("followup_schedules" as any)
        .select("id, stage, status, message, scheduled_for, sent_at, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setFollowUps((data as unknown as FollowUpRecord[]) || []);
      setLoadingFollowUps(false);
    };
    fetchFollowUps();
  }, [open, client]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCpfCnpj(e.target.value);
    setValue("cpf", masked);
    const validation = validateCpfCnpj(masked);
    setCpfError(validation.valid ? "" : validation.message || "");
  };

  const handlePhoneChange = (field: "telefone1" | "telefone2") => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(field, maskPhone(e.target.value));
  };

  const onSubmit = (data: ClientForm) => {
    if (data.cpf) {
      const validation = validateCpfCnpj(data.cpf);
      if (!validation.valid) {
        setCpfError(validation.message || "Documento inválido");
        return;
      }
    }
    onSave(data);
  };

  const handlePrintContract = (html: string) => {
    openContractPrintWindow(html, `Contrato - ${client?.nome || "Cliente"}`);
  };

  const handleSaveContractEdit = async (finalHtml: string) => {
    if (!editingContract) return;
    setSavingContract(true);
    const { error } = await supabase
      .from("client_contracts")
      .update({ conteudo_html: finalHtml } as any)
      .eq("id", editingContract.id);

    setSavingContract(false);
    if (error) {
      toast.error("Erro ao salvar contrato");
      return;
    }

    toast.success("Contrato atualizado!");
    setContracts(prev => prev.map(c => c.id === editingContract.id ? { ...c, conteudo_html: finalHtml } : c));
    setEditingContract(null);
    handlePrintContract(finalHtml);
  };

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Informações Básicas
        </h3>
        <div className="space-y-3">
          <div>
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" {...register("nome")} className="mt-1" />
            {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome.message}</p>}
          </div>
          <div>
            <Label htmlFor="cpf">{isDocCnpj ? "CNPJ" : "CPF"}</Label>
            <Input
              id="cpf"
              value={cpfValue}
              onChange={handleCpfChange}
              placeholder={isDocCnpj ? "00.000.000/0000-00" : "000.000.000-00"}
              className="mt-1"
            />
            {cpfError && <p className="text-xs text-destructive mt-1">{cpfError}</p>}
          </div>
          <div>
            <Label htmlFor="vendedor">Projetista Responsável</Label>
            <Select value={watch("vendedor") || ""} onValueChange={(v) => setValue("vendedor", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {projetistas.map((u) => (
                  <SelectItem key={u.id} value={u.apelido || u.nome_completo}>
                    {u.apelido || u.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Indicador do Cliente</Label>
            <Select value={watch("indicador_id") || ""} onValueChange={(v) => setValue("indicador_id", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhum</SelectItem>
                {activeIndicadores.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.nome} ({ind.comissao_percentual}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Contato
        </h3>
        <div className="space-y-3">
          <div>
            <Label htmlFor="telefone1">Telefone 1</Label>
            <Input
              id="telefone1"
              value={watch("telefone1") || ""}
              onChange={handlePhoneChange("telefone1")}
              placeholder="(00) 00000-0000"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="telefone2">Telefone 2</Label>
            <Input
              id="telefone2"
              value={watch("telefone2") || ""}
              onChange={handlePhoneChange("telefone2")}
              placeholder="(00) 00000-0000"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} className="mt-1" />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Projeto
        </h3>
        <div className="space-y-3">
          <div>
            <Label htmlFor="quantidade_ambientes">Quantidade de Ambientes</Label>
            <Input id="quantidade_ambientes" type="number" min={0} {...register("quantidade_ambientes")} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="descricao_ambientes">Descrição dos Ambientes</Label>
            <Textarea
              id="descricao_ambientes"
              {...register("descricao_ambientes")}
              placeholder="Ex: Cozinha planejada, quarto casal, closet..."
              rows={4}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            {client ? "Editar Cliente" : "Novo Cliente"}
          </SheetTitle>
        </SheetHeader>

        {client ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6 space-y-4">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="contratos">Contratos</TabsTrigger>
              <TabsTrigger value="followups">Follow-ups</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="mt-0">
              {formContent}
            </TabsContent>

            <TabsContent value="contratos" className="mt-0 space-y-3">
              {loadingContracts ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando contratos...</p>
              ) : contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato gerado para este cliente</p>
              ) : (
                contracts.map((contract) => (
                  <div
                    key={contract.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {format(new Date(contract.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contract.simulation_id ? "Vinculado à simulação" : "Contrato avulso"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingContract(contract)} title="Visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingContract(contract)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handlePrintContract(contract.conteudo_html)} title="Imprimir">
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="followups" className="mt-0 space-y-3">
              {loadingFollowUps ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando follow-ups...</p>
              ) : followUps.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">Nenhum follow-up registrado</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
                  <div className="space-y-4">
                    {followUps.map((fu) => {
                      const stageLabel = fu.stage === "1h" ? "1 hora" : fu.stage === "24h" ? "24 horas" : "3 dias";
                      const isPending = fu.status === "pending";
                      const isSent = fu.status === "sent";
                      const isPaused = fu.status === "paused";
                      const isCancelled = fu.status === "cancelled";

                      const StatusIcon = isPending ? Clock : isSent ? Send : isPaused ? Pause : CheckCircle2;
                      const statusColor = isPending
                        ? "text-amber-500"
                        : isSent
                        ? "text-emerald-500"
                        : isPaused
                        ? "text-muted-foreground"
                        : "text-sky-500";
                      const statusLabel = isPending ? "Pendente" : isSent ? "Enviado" : isPaused ? "Pausado" : "Respondeu";
                      const badgeVariant = isPending ? "outline" : isSent ? "default" : "secondary";

                      return (
                        <div key={fu.id} className="relative pl-10">
                          <div className={`absolute left-[9px] top-1 h-3 w-3 rounded-full border-2 border-background ${
                            isPending ? "bg-amber-500" : isSent ? "bg-emerald-500" : isPaused ? "bg-muted-foreground" : "bg-sky-500"
                          }`} />
                          <div className="p-3 rounded-lg border border-border bg-card space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <StatusIcon className={`h-3.5 w-3.5 ${statusColor}`} />
                                <span className="text-xs font-medium text-foreground">{statusLabel}</span>
                              </div>
                              <Badge variant={badgeVariant as any} className="text-[10px] px-1.5 py-0">
                                {stageLabel}
                              </Badge>
                            </div>
                            {fu.message && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                <MessageSquare className="h-3 w-3 inline mr-1 -mt-0.5" />
                                {fu.message}
                              </p>
                            )}
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Agendado: {format(new Date(fu.scheduled_for), "dd/MM HH:mm")}</span>
                              {fu.sent_at && <span>Enviado: {format(new Date(fu.sent_at), "dd/MM HH:mm")}</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground/60">
                              {formatDistanceToNow(new Date(fu.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          formContent
        )}

        {viewingContract && (
          <ContractEditorDialog
            open={!!viewingContract}
            onClose={() => setViewingContract(null)}
            initialHtml={viewingContract.conteudo_html}
            clientName={client?.nome || "Cliente"}
            onConfirm={(html) => {
              handlePrintContract(html);
              setViewingContract(null);
            }}
          />
        )}

        {editingContract && (
          <ContractEditorDialog
            open={!!editingContract}
            onClose={() => setEditingContract(null)}
            initialHtml={editingContract.conteudo_html}
            clientName={client?.nome || "Cliente"}
            onConfirm={handleSaveContractEdit}
            saving={savingContract}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
