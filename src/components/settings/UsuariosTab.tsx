import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Trash2, Pencil, Camera, KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useCargos } from "@/hooks/useCargos";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { maskPhone, maskCurrency, unmaskCurrency } from "@/lib/masks";

const EMPTY_FORM = {
  nome_completo: "",
  apelido: "",
  telefone: "",
  email: "",
  cargo_id: "",
  foto_url: "",
  senha: "",
  tipo_regime: "",
  comissao_percentual: "",
  salario_fixo: "",
};

const REGIME_OPTIONS = [
  { value: "CLT", label: "CLT" },
  { value: "MEI", label: "MEI" },
  { value: "Freelancer", label: "Freelancer" },
];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function formatCurrencyDisplay(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function UsuariosTab() {
  const { usuarios, refresh } = useUsuarios();
  const { cargos } = useCargos();
  const { settings } = useCompanySettings();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState({ open: false, userId: "", userName: "" });
  const [resetSenha, setResetSenha] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (file: File, userId?: string): Promise<string | null> => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `usuarios/${userId || crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.error("Erro ao enviar foto");
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from("company-assets").getPublicUrl(path);
    return publicUrl;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadPhoto(file, isEdit ? editingId || undefined : undefined);
    if (url) setForm((f) => ({ ...f, foto_url: url }));
  };

  const handleAdd = async () => {
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!form.nome_completo.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }

    if (!normalizedEmail) {
      toast.error("Email é obrigatório para novos usuários");
      return;
    }

    if (!form.senha.trim()) {
      toast.error("Senha é obrigatória para novos usuários");
      return;
    }

    if (form.senha.trim().length < 4) {
      toast.error("A senha deve ter pelo menos 4 caracteres");
      return;
    }

    // Hash password before storing
    const { data: hashedSenha } = await supabase.rpc("hash_password", { plain_text: form.senha }) as any;
    const { error } = await supabase.from("usuarios").insert({
      nome_completo: form.nome_completo.trim(),
      apelido: form.apelido.trim() || null,
      telefone: form.telefone.trim() || null,
      email: normalizedEmail || null,
      cargo_id: form.cargo_id || null,
      foto_url: form.foto_url || null,
      senha: hashedSenha,
      primeiro_login: true,
      tipo_regime: form.tipo_regime || null,
      comissao_percentual: form.comissao_percentual ? parseFloat(form.comissao_percentual) : 0,
      salario_fixo: form.salario_fixo ? unmaskCurrency(form.salario_fixo) : 0,
    } as any);

    if (error) {
      toast.error("Erro ao adicionar usuário: " + error.message);
    } else {
      toast.success(
        `Usuário adicionado! Vinculado ao código da loja ${settings.codigo_loja || "atual"}.`
      );
      setForm(EMPTY_FORM);
      refresh();
    }
  };

  const handleEdit = (u: typeof usuarios[0]) => {
    setEditingId(u.id);
    setForm({
      nome_completo: u.nome_completo,
      apelido: u.apelido || "",
      telefone: u.telefone || "",
      email: u.email || "",
      cargo_id: u.cargo_id || "",
      foto_url: u.foto_url || "",
      senha: "",
      tipo_regime: (u as any).tipo_regime || "",
      comissao_percentual: String((u as any).comissao_percentual || ""),
      salario_fixo: (u as any).salario_fixo ? formatCurrencyDisplay((u as any).salario_fixo) : "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingId || !form.nome_completo.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }
    const updateData: any = {
      nome_completo: form.nome_completo.trim(),
      apelido: form.apelido.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim().toLowerCase() || null,
      cargo_id: form.cargo_id || null,
      foto_url: form.foto_url || null,
      tipo_regime: form.tipo_regime || null,
      comissao_percentual: form.comissao_percentual ? parseFloat(form.comissao_percentual) : 0,
      salario_fixo: form.salario_fixo ? unmaskCurrency(form.salario_fixo) : 0,
    };
    const { error } = await supabase.from("usuarios").update(updateData).eq("id", editingId);
    if (error) toast.error("Erro ao atualizar");
    else {
      toast.success("Usuário atualizado!");
      setEditDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      refresh();
    }
  };

  const handleResetPassword = async () => {
    if (resetSenha.length < 4) {
      toast.error("A senha deve ter pelo menos 4 caracteres");
      return;
    }
    const { data: hashedSenha } = await supabase.rpc("hash_password", { plain_text: resetSenha }) as any;
    const { error } = await supabase
      .from("usuarios")
      .update({ senha: hashedSenha, primeiro_login: true } as any)
      .eq("id", resetPasswordDialog.userId);
    if (error) toast.error("Erro ao resetar senha");
    else {
      toast.success("Senha resetada! O usuário deverá alterá-la no próximo login.");
      setResetPasswordDialog({ open: false, userId: "", userName: "" });
      setResetSenha("");
    }
  };

  const handleToggleAtivo = async (id: string, currentAtivo: boolean) => {
    const { error } = await supabase.from("usuarios").update({ ativo: !currentAtivo } as any).eq("id", id);
    if (error) toast.error("Erro ao alterar status");
    else refresh();
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir usuário "${nome}"?`)) return;
    const { error } = await supabase.from("usuarios").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Excluído!");
      refresh();
    }
  };

  const getCargoNome = (cargoId: string | null) => {
    if (!cargoId) return "—";
    return cargos.find((c) => c.id === cargoId)?.nome || "—";
  };

  const renderPhotoUpload = (inputRef: React.RefObject<HTMLInputElement | null>, isEdit = false) => (
    <div className="flex items-center gap-3">
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
        <Avatar className="h-14 w-14">
          {form.foto_url ? <AvatarImage src={form.foto_url} alt="Foto" /> : null}
          <AvatarFallback className="bg-muted text-muted-foreground text-lg">
            {form.nome_completo ? getInitials(form.nome_completo) : <Camera className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="h-4 w-4 text-white" />
        </div>
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Enviando..." : "Escolher Foto"}
        </Button>
        {form.foto_url && (
          <Button type="button" variant="ghost" size="sm" className="ml-1 text-destructive" onClick={() => setForm((f) => ({ ...f, foto_url: "" }))}>
            Remover
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, isEdit)} />
    </div>
  );

  const renderForm = (isDialog = false) => (
    <div className="space-y-4">
      {renderPhotoUpload(isDialog ? editFileInputRef : fileInputRef, isDialog)}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Nome Completo *</Label>
          <Input value={form.nome_completo} onChange={(e) => setForm((f) => ({ ...f, nome_completo: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Apelido</Label>
          <Input value={form.apelido} onChange={(e) => setForm((f) => ({ ...f, apelido: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: maskPhone(e.target.value) }))} className="mt-1" placeholder="(00) 00000-0000" />
        </div>
        <div>
          <Label>Email{!isDialog ? " *" : ""}</Label>
          <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Cargo</Label>
          <Select value={form.cargo_id} onValueChange={(v) => setForm((f) => ({ ...f, cargo_id: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um cargo" /></SelectTrigger>
            <SelectContent>
              {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo de Regime</Label>
          <Select value={form.tipo_regime} onValueChange={(v) => setForm((f) => ({ ...f, tipo_regime: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o regime" /></SelectTrigger>
            <SelectContent>
              {REGIME_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Comissão (%)</Label>
          <Input
            value={form.comissao_percentual}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
              setForm((f) => ({ ...f, comissao_percentual: val }));
            }}
            className="mt-1"
            placeholder="Ex: 5.00"
          />
        </div>
        <div>
          <Label>Salário Fixo</Label>
          <Input
            value={form.salario_fixo}
            onChange={(e) => setForm((f) => ({ ...f, salario_fixo: maskCurrency(e.target.value) }))}
            className="mt-1"
            placeholder="R$ 0,00"
          />
        </div>
        {!isDialog && (
          <div>
            <Label>Senha Inicial *</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={form.senha}
                onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Usuários vinculados automaticamente à loja</p>
              <p className="text-sm text-muted-foreground">
                Novos usuários criados aqui entram sempre vinculados ao código da loja <strong>{settings.codigo_loja || "atual"}</strong>.
                As configurações do sistema ficam reservadas ao usuário administrador.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar Usuário</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {renderForm()}
          <div className="flex justify-end">
            <Button onClick={handleAdd} className="gap-2"><Plus className="h-4 w-4" />Adicionar Usuário</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Usuários Cadastrados</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead className="w-14"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Apelido</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Salário</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhum usuário cadastrado</TableCell></TableRow>
                )}
                {usuarios.map((u) => (
                  <TableRow key={u.id} className={!u.ativo ? "opacity-50" : ""}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        {u.foto_url ? <AvatarImage src={u.foto_url} alt={u.nome_completo} /> : null}
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(u.nome_completo)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{u.nome_completo}</TableCell>
                    <TableCell>{u.apelido || "—"}</TableCell>
                    <TableCell>{u.telefone || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{getCargoNome(u.cargo_id)}</TableCell>
                    <TableCell>{u.tipo_regime || "—"}</TableCell>
                    <TableCell className="text-right">{u.comissao_percentual ? `${u.comissao_percentual}%` : "—"}</TableCell>
                    <TableCell className="text-right">{u.salario_fixo ? formatCurrencyDisplay(u.salario_fixo) : "—"}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={u.ativo} onCheckedChange={() => handleToggleAtivo(u.id, u.ativo)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(u)} title="Editar">
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setResetPasswordDialog({ open: true, userId: u.id, userName: u.apelido || u.nome_completo })} title="Resetar Senha">
                          <KeyRound className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(u.id, u.nome_completo)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          {renderForm(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPasswordDialog.open} onOpenChange={(o) => { if (!o) setResetPasswordDialog({ open: false, userId: "", userName: "" }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resetar Senha</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Definir nova senha para <strong>{resetPasswordDialog.userName}</strong>. O usuário será obrigado a alterá-la no próximo login.
            </p>
          </DialogHeader>
          <div>
            <Label>Nova Senha</Label>
            <div className="relative mt-1">
              <Input
                type={showResetPwd ? "text" : "password"}
                value={resetSenha}
                onChange={(e) => setResetSenha(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowResetPwd(!showResetPwd)}
                tabIndex={-1}
              >
                {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialog({ open: false, userId: "", userName: "" })}>Cancelar</Button>
            <Button onClick={handleResetPassword}>Resetar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
