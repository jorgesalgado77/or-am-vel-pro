import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendedorNome: string;
  onClientCreated: (client: Client) => void;
}

export function QuickClientModal({ open, onOpenChange, vendedorNome, onClientCreated }: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [dataOrcamento, setDataOrcamento] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do cliente"); return; }
    setSaving(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { toast.error("Tenant não identificado"); setSaving(false); return; }

    const now = new Date();
    const numero = `ORC-${format(now, "yyyyMMdd-HHmmss")}`;

    const { data, error } = await supabase.from("clients").insert({
      tenant_id: tenantId,
      nome: nome.trim(),
      telefone1: telefone.trim() || null,
      email: email.trim() || null,
      vendedor: vendedorNome || null,
      numero_orcamento: numero,
      data_orcamento: dataOrcamento,
      status: "novo",
    }).select().single();

    if (error) { toast.error("Erro ao criar cliente: " + error.message); setSaving(false); return; }
    toast.success(`Cliente "${nome}" criado — Orçamento ${numero}`);
    onClientCreated(data as Client);
    onOpenChange(false);
    setNome(""); setTelefone(""); setEmail("");
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Cliente — Dados Mínimos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Nome do cliente" /></div>
          <div><Label className="text-xs">WhatsApp</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} className="mt-1" placeholder="(00) 00000-0000" /></div>
          <div><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" placeholder="email@exemplo.com" /></div>
          <div><Label className="text-xs">Data do Orçamento</Label><Input type="date" value={dataOrcamento} onChange={e => setDataOrcamento(e.target.value)} className="mt-1" /></div>
          <div className="bg-muted/50 rounded-md p-2">
            <span className="text-xs text-muted-foreground">Nº Orçamento: </span>
            <span className="text-xs font-mono font-semibold">Gerado automaticamente ao salvar</span>
          </div>
          {vendedorNome && (
            <div className="bg-muted/50 rounded-md p-2">
              <span className="text-xs text-muted-foreground">Responsável: </span>
              <span className="text-xs font-semibold">{vendedorNome}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Criar Cliente"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}