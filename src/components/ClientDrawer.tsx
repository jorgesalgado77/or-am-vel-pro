import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const clientSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().max(14).optional().or(z.literal("")),
  quantidade_ambientes: z.coerce.number().int().min(0).optional(),
  descricao_ambientes: z.string().max(2000).optional().or(z.literal("")),
  telefone1: z.string().max(20).optional().or(z.literal("")),
  telefone2: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  vendedor: z.string().max(200).optional().or(z.literal("")),
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
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
  });

  useEffect(() => {
    if (client) {
      reset({
        nome: client.nome,
        cpf: client.cpf || "",
        quantidade_ambientes: client.quantidade_ambientes || 0,
        descricao_ambientes: client.descricao_ambientes || "",
        telefone1: client.telefone1 || "",
        telefone2: client.telefone2 || "",
        email: client.email || "",
        vendedor: client.vendedor || "",
      });
    } else {
      reset({
        nome: "",
        cpf: "",
        quantidade_ambientes: 0,
        descricao_ambientes: "",
        telefone1: "",
        telefone2: "",
        email: "",
        vendedor: "",
      });
    }
  }, [client, open, reset]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            {client ? "Editar Cliente" : "Novo Cliente"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSave)} className="mt-6 space-y-6">
          {/* Info Básica */}
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
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" {...register("cpf")} placeholder="000.000.000-00" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="vendedor">Vendedor Responsável</Label>
                <Input id="vendedor" {...register("vendedor")} className="mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Contato */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Contato
            </h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="telefone1">Telefone 1</Label>
                <Input id="telefone1" {...register("telefone1")} placeholder="(00) 00000-0000" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="telefone2">Telefone 2</Label>
                <Input id="telefone2" {...register("telefone2")} placeholder="(00) 00000-0000" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} className="mt-1" />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Projeto */}
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
