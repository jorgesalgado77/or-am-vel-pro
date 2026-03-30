import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Users, Trash2, KeyRound, RefreshCw, Search, Plus, Pencil } from "lucide-react";

interface StoreUser {
  id: string;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  ativo: boolean;
  tipo_regime: string | null;
  salario_fixo: number;
  comissao_percentual: number;
}

interface Cargo {
  id: string;
  nome: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  tenantName: string;
  codigoLoja: string | null;
}

const emptyForm = {
  nome_completo: "",
  email: "",
  telefone: "",
  cargo_id: "",
  tipo_regime: "",
  salario_fixo: 0,
  comissao_percentual: 0,
  ativo: true,
};

export function AdminStoreUsersModal({ open, onOpenChange, tenantId, tenantName, codigoLoja }: Props) {
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StoreUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Reset password
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<StoreUser | null>(null);
  const [resetPassword, setResetPassword] = useState("123456");
  const [resetting, setResetting] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<StoreUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_list_store_users", { p_tenant_id: tenantId });
      if (error) throw error;
      const parsed: StoreUser[] = (data || []).map((u: any) => ({
        id: u.id,
        nome_completo: u.nome_completo,
        email: u.email,
        telefone: u.telefone,
        cargo_id: u.cargo_id,
        cargo_nome: u.cargo_nome,
        ativo: u.ativo,
        tipo_regime: u.tipo_regime,
        salario_fixo: Number(u.salario_fixo) || 0,
        comissao_percentual: Number(u.comissao_percentual) || 0,
      }));
      setUsers(parsed);
    } catch (err: any) {
      console.error("Erro ao carregar usuários:", err);
      // Fallback: direct query (may fail with RLS)
      const { data } = await supabase
        .from("usuarios")
        .select("id, nome_completo, email, telefone, cargo_id, ativo, tipo_regime, salario_fixo, comissao_percentual")
        .eq("tenant_id", tenantId)
        .order("ativo", { ascending: false })
        .order("nome_completo");

      if (data) {
        const cargoIds = [...new Set(data.filter(u => u.cargo_id).map(u => u.cargo_id!))];
        let cargoMap: Record<string, string> = {};
        if (cargoIds.length > 0) {
          const { data: cargosData } = await supabase.from("cargos").select("id, nome").in("id", cargoIds);
          if (cargosData) cargosData.forEach(c => { cargoMap[c.id] = c.nome; });
        }
        setUsers(data.map(u => ({
          id: u.id,
          nome_completo: u.nome_completo,
          email: u.email,
          telefone: u.telefone,
          cargo_id: u.cargo_id,
          cargo_nome: u.cargo_id ? cargoMap[u.cargo_id] || null : null,
          ativo: u.ativo,
          tipo_regime: u.tipo_regime,
          salario_fixo: Number(u.salario_fixo) || 0,
          comissao_percentual: Number(u.comissao_percentual) || 0,
        })));
      }
    }
    setLoading(false);
  }, [tenantId]);

  const loadCargos = useCallback(async () => {
    try {
      const { data } = await (supabase as any).rpc("admin_list_store_cargos", { p_tenant_id: tenantId });
      if (data) setCargos(data);
    } catch {
      const { data } = await supabase.from("cargos").select("id, nome").eq("tenant_id", tenantId).order("nome");
      if (data) setCargos(data);
    }
  }, [tenantId]);

  useEffect(() => {
    if (open) {
      loadUsers();
      loadCargos();
    }
  }, [open, tenantId, loadUsers, loadCargos]);

  // Toggle active
  const toggleUserActive = async (user: StoreUser) => {
    const newAtivo = !user.ativo;
    try {
      await (supabase as any).rpc("admin_toggle_store_user", { p_user_id: user.id, p_ativo: newAtivo });
    } catch {
      await supabase.from("usuarios").update({ ativo: newAtivo } as any).eq("id", user.id);
    }
    toast.success(`${user.nome_completo} ${newAtivo ? "ativado" : "desativado"}`);
    loadUsers();
  };

  // Open create form
  const openCreateForm = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  // Open edit form
  const openEditForm = (user: StoreUser) => {
    setEditingUser(user);
    setForm({
      nome_completo: user.nome_completo,
      email: user.email || "",
      telefone: user.telefone || "",
      cargo_id: user.cargo_id || "",
      tipo_regime: user.tipo_regime || "",
      salario_fixo: user.salario_fixo,
      comissao_percentual: user.comissao_percentual,
      ativo: user.ativo,
    });
    setFormOpen(true);
  };

  // Save user (create or update)
  const handleSaveUser = async () => {
    if (!form.nome_completo.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await (supabase as any).rpc("admin_upsert_store_user", {
        p_tenant_id: tenantId,
        p_user_id: editingUser?.id || null,
        p_nome_completo: form.nome_completo.trim(),
        p_email: form.email.trim() || null,
        p_telefone: form.telefone.trim() || null,
        p_cargo_id: form.cargo_id || null,
        p_tipo_regime: form.tipo_regime || null,
        p_salario_fixo: form.salario_fixo,
        p_comissao_percentual: form.comissao_percentual,
        p_ativo: form.ativo,
      });
      toast.success(editingUser ? "Usuário atualizado!" : "Usuário criado! Senha padrão: 123456");
      setFormOpen(false);
      loadUsers();
    } catch (err: any) {
      // Fallback direct
      try {
        if (editingUser) {
          await supabase.from("usuarios").update({
            nome_completo: form.nome_completo.trim(),
            email: form.email.trim() || null,
            telefone: form.telefone.trim() || null,
            cargo_id: form.cargo_id || null,
            tipo_regime: form.tipo_regime || null,
            salario_fixo: form.salario_fixo,
            comissao_percentual: form.comissao_percentual,
            ativo: form.ativo,
          } as any).eq("id", editingUser.id);
          toast.success("Usuário atualizado!");
        } else {
          const { data: hashedSenha } = await supabase.rpc("hash_password", { plain_text: "123456" }) as any;
          await supabase.from("usuarios").insert({
            tenant_id: tenantId,
            nome_completo: form.nome_completo.trim(),
            email: form.email.trim() || null,
            telefone: form.telefone.trim() || null,
            cargo_id: form.cargo_id || null,
            tipo_regime: form.tipo_regime || null,
            salario_fixo: form.salario_fixo,
            comissao_percentual: form.comissao_percentual,
            ativo: form.ativo,
            senha: hashedSenha || "123456",
            primeiro_login: true,
          } as any);
          toast.success("Usuário criado! Senha padrão: 123456");
        }
        setFormOpen(false);
        loadUsers();
      } catch (e2: any) {
        toast.error("Erro: " + (e2?.message || err?.message || "desconhecido"));
      }
    } finally {
      setSaving(false);
    }
  };

  // Reset password
  const openResetPassword = (user: StoreUser) => {
    setResetUser(user);
    setResetPassword("123456");
    setResetDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (resetPassword.trim().length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setResetting(true);
    try {
      await (supabase as any).rpc("admin_reset_store_user_password", {
        p_user_id: resetUser.id,
        p_new_password: resetPassword.trim(),
      } as any);
      toast.success(`Senha de ${resetUser.nome_completo} resetada! O usuário deverá trocar no próximo login.`);
      setResetDialogOpen(false);
    } catch {
      // Fallback
      try {
        const { data: hashedSenha } = await supabase.rpc("hash_password", { plain_text: resetPassword.trim() }) as any;
        await supabase.from("usuarios").update({ senha: hashedSenha || resetPassword.trim(), primeiro_login: true } as any).eq("id", resetUser.id);
        toast.success(`Senha de ${resetUser.nome_completo} resetada!`);
        setResetDialogOpen(false);
      } catch (err: any) {
        toast.error("Erro: " + (err?.message || "desconhecido"));
      }
    } finally {
      setResetting(false);
    }
  };

  // Delete user
  const openDeleteUser = (user: StoreUser) => {
    setDeleteUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      await (supabase as any).rpc("admin_delete_store_user", {
        p_user_id: deleteUser.id,
        p_tenant_id: tenantId,
      } as any);
      toast.success(`${deleteUser.nome_completo} excluído com sucesso.`);
    } catch {
      try {
        await supabase.from("usuarios").delete().eq("id", deleteUser.id);
        toast.success(`${deleteUser.nome_completo} excluído com sucesso.`);
      } catch (err: any) {
        toast.error("Erro: " + (err?.message || "desconhecido"));
      }
    }
    setDeleteDialogOpen(false);
    setDeleteUser(null);
    setDeleting(false);
    loadUsers();
  };

  const filtered = users.filter(u =>
    !search ||
    u.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.cargo_nome || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Usuários — {tenantName}
              {codigoLoja && (
                <Badge variant="outline" className="font-mono text-xs ml-2">{codigoLoja}</Badge>
              )}
              <Badge variant="secondary" className="ml-2">{users.length} usuário(s)</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou cargo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openCreateForm} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Usuário
            </Button>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado</p>
          ) : (
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Ativo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Regime</TableHead>
                    <TableHead className="w-28 text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(u => (
                    <TableRow key={u.id} className={!u.ativo ? "opacity-50" : ""}>
                      <TableCell>
                        <Switch checked={u.ativo} onCheckedChange={() => toggleUserActive(u)} />
                      </TableCell>
                      <TableCell className="font-medium">{u.nome_completo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {u.cargo_nome || "Sem cargo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.telefone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.tipo_regime === "CLT" ? "default" : u.tipo_regime === "MEI" ? "secondary" : "outline"} className="text-xs">
                          {u.tipo_regime || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(u)} title="Editar usuário">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openResetPassword(u)} title="Resetar senha">
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => openDeleteUser(u)} title="Excluir usuário">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={loadUsers} className="gap-2">
              <RefreshCw className="h-3 w-3" /> Atualizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create / Edit User Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome Completo *</Label>
              <Input value={form.nome_completo} onChange={e => setForm(f => ({ ...f, nome_completo: e.target.value }))} placeholder="Nome do usuário" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" type="email" />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Cargo</Label>
                <Select value={form.cargo_id} onValueChange={v => setForm(f => ({ ...f, cargo_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cargos.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Regime</Label>
                <Select value={form.tipo_regime} onValueChange={v => setForm(f => ({ ...f, tipo_regime: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLT">CLT</SelectItem>
                    <SelectItem value="MEI">MEI</SelectItem>
                    <SelectItem value="PJ">PJ</SelectItem>
                    <SelectItem value="Freelancer">Freelancer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Salário Fixo (R$)</Label>
                <Input type="number" value={form.salario_fixo} onChange={e => setForm(f => ({ ...f, salario_fixo: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Comissão (%)</Label>
                <Input type="number" value={form.comissao_percentual} onChange={e => setForm(f => ({ ...f, comissao_percentual: Number(e.target.value) }))} />
              </div>
            </div>
            {!editingUser && (
              <p className="text-xs text-muted-foreground">Senha padrão: <strong>123456</strong> — o usuário deverá trocar no primeiro login.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving ? "Salvando..." : editingUser ? "Salvar Alterações" : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resetar Senha</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Resetar senha de <strong>{resetUser?.nome_completo}</strong>
          </p>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={resetting}>
              {resetting ? "Resetando..." : "Confirmar Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteUser?.nome_completo}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
