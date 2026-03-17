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
import { maskCpfCnpj, maskPhone, unmask, isCnpj, validateCpfCnpj } from "@/lib/masks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

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
  const { usuarios } = useUsuarios();
  const activeUsuarios = usuarios.filter(u => u.ativo);
  const { activeIndicadores } = useIndicadores();

  const cpfValue = watch("cpf") || "";
  const [cpfError, setCpfError] = useState("");
  const isDocCnpj = isCnpj(cpfValue);

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
        indicador_id: (client as any).indicador_id || "",
      });
    } else {
      reset({
        nome: "", cpf: "", quantidade_ambientes: 0, descricao_ambientes: "",
        telefone1: "", telefone2: "", email: "", vendedor: "", indicador_id: "",
      });
    }
    setCpfError("");
  }, [client, open, reset]);

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
    // Validate CPF/CNPJ before saving
    if (data.cpf) {
      const validation = validateCpfCnpj(data.cpf);
      if (!validation.valid) {
        setCpfError(validation.message || "Documento inválido");
        return;
      }
    }
    onSave(data);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            {client ? "Editar Cliente" : "Novo Cliente"}
          </SheetTitle>
        </SheetHeader>

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
                    {activeUsuarios.map((u) => (
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
      </SheetContent>
    </Sheet>
  );
}
