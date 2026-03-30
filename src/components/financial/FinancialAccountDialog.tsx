import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskCurrency } from "@/lib/masks";
import { Save, Receipt } from "lucide-react";

interface FormData {
  name: string;
  description: string;
  amount: string;
  due_date: string;
  status: "pendente" | "pago" | "atrasado";
  is_fixed: boolean;
  recurrence_type: string;
  category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  editing: boolean;
  onSave: () => void;
}

export const FinancialAccountDialog = React.memo(function FinancialAccountDialog({
  open, onOpenChange, form, setForm, editing, onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> {editing ? "Editar Conta" : "Nova Conta a Pagar"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome da Conta</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Aluguel da Loja" className="mt-1" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes adicionais" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: maskCurrency(e.target.value) }))} className="mt-1" placeholder="R$ 0,00" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Aluguel">Aluguel</SelectItem>
                <SelectItem value="Fornecedor">Fornecedor</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Serviços">Serviços</SelectItem>
                <SelectItem value="Impostos">Impostos</SelectItem>
                <SelectItem value="Outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Conta Fixa (recorrente)</Label>
              <p className="text-xs text-muted-foreground">Repete automaticamente todo mês</p>
            </div>
            <Switch checked={form.is_fixed} onCheckedChange={v => setForm(p => ({ ...p, is_fixed: v }))} />
          </div>
          {form.is_fixed && (
            <div>
              <Label>Recorrência</Label>
              <Select value={form.recurrence_type} onValueChange={v => setForm(p => ({ ...p, recurrence_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} className="gap-1.5"><Save className="h-4 w-4" /> {editing ? "Salvar" : "Adicionar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export type { FormData as FinancialFormData };
