import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/financing";
import type { Usuario } from "@/hooks/useUsuarios";
import type { Cargo } from "@/hooks/useCargos";

export interface EmployeeDeduction {
  usuario_id: string;
  mes_referencia: string;
  faltas: number;
  horas_extras: number;
  adiantamento: number;
  outros_descontos: number;
  descricao_outros: string;
  bonus: number;
  descricao_bonus: string;
}

interface Props {
  usuarios: Usuario[];
  cargos: Cargo[];
  mesReferencia: string;
  getRegimeEfetivo: (u: Usuario) => string | null;
}

export function PayrollDeductions({ usuarios, cargos, mesReferencia, getRegimeEfetivo }: Props) {
  const [deductions, setDeductions] = useState<Record<string, EmployeeDeduction>>({});
  const [saving, setSaving] = useState(false);

  const activeUsers = usuarios.filter(u => u.ativo);

  useEffect(() => {
    loadDeductions();
  }, [mesReferencia, usuarios]);

  const loadDeductions = async () => {
    const { data } = await supabase
      .from("payroll_deductions" as any)
      .select("*")
      .eq("mes_referencia", mesReferencia);

    const map: Record<string, EmployeeDeduction> = {};
    activeUsers.forEach(u => {
      const existing = (data as any[] || []).find((d: any) => d.usuario_id === u.id);
      map[u.id] = existing || {
        usuario_id: u.id,
        mes_referencia: mesReferencia,
        faltas: 0,
        horas_extras: 0,
        adiantamento: 0,
        outros_descontos: 0,
        descricao_outros: "",
        bonus: 0,
        descricao_bonus: "",
      };
    });
    setDeductions(map);
  };

  const updateDeduction = (userId: string, field: keyof EmployeeDeduction, value: any) => {
    setDeductions(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const records = Object.values(deductions).map(d => ({
      ...d,
      mes_referencia: mesReferencia,
    }));

    for (const record of records) {
      const { data: existing } = await supabase
        .from("payroll_deductions" as any)
        .select("id")
        .eq("usuario_id", record.usuario_id)
        .eq("mes_referencia", record.mes_referencia)
        .maybeSingle();

      if (existing) {
        await supabase.from("payroll_deductions" as any).update(record as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("payroll_deductions" as any).insert(record as any);
      }
    }

    toast.success("Descontos salvos!");
    setSaving(false);
  };

  const getSalarioEfetivo = (u: Usuario) => {
    const cargo = u.cargo_id ? cargos.find(c => c.id === u.cargo_id) : null;
    return u.salario_fixo || (cargo as any)?.salario_base || 0;
  };

  const getDescontoFaltas = (u: Usuario, faltas: number) => {
    const salario = getSalarioEfetivo(u);
    const diasUteis = 22;
    return (salario / diasUteis) * faltas;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Faltas e Descontos — {mesReferencia}</span>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead className="text-center w-20">Faltas</TableHead>
                <TableHead className="text-center w-20">H. Extras</TableHead>
                <TableHead className="text-right w-28">Adiantamento</TableHead>
                <TableHead className="text-right w-28">Outros Desc.</TableHead>
                <TableHead className="w-36">Descrição</TableHead>
                <TableHead className="text-right w-28">Bônus</TableHead>
                <TableHead className="w-36">Desc. Bônus</TableHead>
                <TableHead className="text-right">Desc. Faltas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeUsers.map(u => {
                const d = deductions[u.id];
                if (!d) return null;
                const regime = getRegimeEfetivo(u);
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-sm">{u.apelido || u.nome_completo}</TableCell>
                    <TableCell>
                      {regime ? (
                        <Badge variant="outline" className={
                          regime === "CLT" ? "border-emerald-500/50 text-emerald-700 text-[10px]"
                          : regime === "MEI" ? "border-blue-500/50 text-blue-700 text-[10px]"
                          : "border-amber-500/50 text-amber-700 text-[10px]"
                        }>{regime}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={d.faltas} onChange={e => updateDeduction(u.id, "faltas", parseInt(e.target.value) || 0)} className="h-7 text-xs text-center w-16" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step={0.5} value={d.horas_extras} onChange={e => updateDeduction(u.id, "horas_extras", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-center w-16" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step={0.01} value={d.adiantamento} onChange={e => updateDeduction(u.id, "adiantamento", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-24" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step={0.01} value={d.outros_descontos} onChange={e => updateDeduction(u.id, "outros_descontos", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-24" />
                    </TableCell>
                    <TableCell>
                      <Input value={d.descricao_outros} onChange={e => updateDeduction(u.id, "descricao_outros", e.target.value)} className="h-7 text-xs w-32" placeholder="Motivo" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step={0.01} value={d.bonus} onChange={e => updateDeduction(u.id, "bonus", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-24" />
                    </TableCell>
                    <TableCell>
                      <Input value={d.descricao_bonus} onChange={e => updateDeduction(u.id, "descricao_bonus", e.target.value)} className="h-7 text-xs w-32" placeholder="Motivo" />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-destructive">
                      {d.faltas > 0 ? `- ${formatCurrency(getDescontoFaltas(u, d.faltas))}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
