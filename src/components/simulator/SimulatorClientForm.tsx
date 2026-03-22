import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Save } from "lucide-react";
import { maskCpfCnpj, maskPhone, isCnpj, validateCpfCnpj } from "@/lib/masks";

interface NewClientData {
  nome: string;
  cpf: string;
  telefone1: string;
  telefone2: string;
  email: string;
  vendedor: string;
  quantidade_ambientes: number;
  descricao_ambientes: string;
  indicador_id: string;
}

interface Props {
  newClient: NewClientData;
  onChange: (updater: (prev: NewClientData) => NewClientData) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  projetistas: Array<{ id: string; nome_completo: string; apelido: string | null }>;
  indicadores: Array<{ id: string; nome: string; comissao_percentual: number }>;
}

export function SimulatorClientForm({ newClient, onChange, onCancel, onSave, saving, projetistas, indicadores }: Props) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Cadastrar Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Nome *</Label>
          <Input value={newClient.nome} onChange={(e) => onChange(p => ({ ...p, nome: e.target.value }))} className="mt-1" placeholder="Nome completo" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{isCnpj(newClient.cpf) ? "CNPJ" : "CPF"}</Label>
            <Input
              value={newClient.cpf}
              onChange={(e) => onChange(p => ({ ...p, cpf: maskCpfCnpj(e.target.value) }))}
              className="mt-1"
              placeholder={isCnpj(newClient.cpf) ? "00.000.000/0000-00" : "000.000.000-00"}
            />
            {newClient.cpf && !validateCpfCnpj(newClient.cpf).valid && (
              <p className="text-xs text-destructive mt-1">{validateCpfCnpj(newClient.cpf).message}</p>
            )}
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={newClient.email} onChange={(e) => onChange(p => ({ ...p, email: e.target.value }))} className="mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefone 1</Label>
            <Input
              value={newClient.telefone1}
              onChange={(e) => onChange(p => ({ ...p, telefone1: maskPhone(e.target.value) }))}
              className="mt-1"
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <Label>Telefone 2</Label>
            <Input
              value={newClient.telefone2}
              onChange={(e) => onChange(p => ({ ...p, telefone2: maskPhone(e.target.value) }))}
              className="mt-1"
              placeholder="(00) 00000-0000"
            />
          </div>
        </div>
        <div>
          <Label>Projetista Responsável</Label>
          <Select value={newClient.vendedor} onValueChange={(v) => onChange(p => ({ ...p, vendedor: v }))}>
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
          <Select value={newClient.indicador_id || "_none"} onValueChange={(v) => onChange(p => ({ ...p, indicador_id: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Nenhum</SelectItem>
              {indicadores.map((ind) => (
                <SelectItem key={ind.id} value={ind.id}>
                  {ind.nome} ({ind.comissao_percentual}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Qtd. Ambientes</Label>
            <Input type="number" min={0} value={newClient.quantidade_ambientes} onChange={(e) => onChange(p => ({ ...p, quantidade_ambientes: Number(e.target.value) }))} className="mt-1" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={newClient.descricao_ambientes} onChange={(e) => onChange(p => ({ ...p, descricao_ambientes: e.target.value }))} className="mt-1" placeholder="Ex: Cozinha, Quarto..." />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-1" onClick={onSave} disabled={saving}>
            <Save className="h-3 w-3" />
            {saving ? "Salvando..." : "Cadastrar e Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
