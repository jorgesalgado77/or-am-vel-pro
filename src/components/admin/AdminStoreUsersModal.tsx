import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Users, Trash2, KeyRound, RefreshCw, Search } from "lucide-react";

interface StoreUser {
  id: string;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  cargo_nome: string | null;
  cargo_id: string | null;
  ativo: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  tenantName: string;
  codigoLoja: string | null;
}

export function AdminStoreUsersModal({ open, onOpenChange, tenantId, tenantName, codigoLoja }: Props) {
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<StoreUser | null>(null);
  const [resetPassword, setResetPassword] = useState("123456");
  const [resetting, setResetting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<StoreUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) loadUsers();
  }, [open, tenantId]);

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("id, nome_completo, email, telefone, cargo_id, ativo")
      .eq("tenant_id", tenantId)
      .order("ativo", { ascending: false })
      .order("nome_completo");

    if (!data) { setLoading(false); return; }

    const cargoIds = [...new Set(data.filter(u => u.cargo_id).map(u => u.cargo_id!))];
    let cargoMap: Record<string, string> = {};
    if (cargoIds.length > 0) {
      const { data: cargos } = await supabase.from("cargos").select("id, nome").in("id", cargoIds);
      if (cargos) cargos.forEach(c => { cargoMap[c.id] = c.nome; });
    }

    setUsers(data.map(u => ({
      id: u.id,
      nome_completo: u.nome_completo,
      email: u.email,
      telefone: u.telefone,
      cargo_id: u.cargo_id,
      cargo_nome: u.cargo_id ? cargoMap[u.cargo_id] || null : null,
      ativo: u.ativo,
    })));
    setLoading(false);
  };

  const toggleUserActive = async (user: StoreUser) => {
    const newAtivo = !user.ativo;
    const { error } = await supabase
      .from("usuarios")
      .update({ ativo: newAtivo } as any)
      .eq("id", user.id);

    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
      return;
    }
    toast.success(`${user.nome_completo} ${newAtivo ? "ativado" : "desativado"}`);
    loadUsers();
  };

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
      const { data: hashedSenha } = await supabase.rpc("hash_password", { plain_text: resetPassword.trim() }) as any;
      if (!hashedSenha) {
        toast.error("Erro ao gerar hash da senha.");
        return;
      }

      // Update password in usuarios table and set primeiro_login
      const { error } = await supabase
        .from("usuarios")
        .update({ senha: hashedSenha, primeiro_login: true } as any)
        .eq("id", resetUser.id);

      if (error) {
        toast.error("Erro ao resetar senha: " + error.message);
        return;
      }

      // Also try updating via admin RPC for Supabase Auth sync
      try {
        await (supabase as any).rpc("admin_update_user_password", {
          target_user_id: resetUser.id,
          new_password: resetPassword.trim(),
        });
      } catch {
        // RPC may not exist, password was updated in usuarios table
      }

      toast.success(`Senha de ${resetUser.nome_completo} resetada com sucesso. O usuário deverá trocar no próximo login.`);
      setResetDialogOpen(false);
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setResetting(false);
    }
  };

  const openDeleteUser = (user: StoreUser) => {
    setDeleteUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("usuarios")
        .delete()
        .eq("id", deleteUser.id);

      if (error) {
        toast.error("Erro ao excluir usuário: " + error.message);
        return;
      }
      toast.success(`${deleteUser.nome_completo} excluído com sucesso.`);
      setDeleteDialogOpen(false);
      setDeleteUser(null);
      loadUsers();
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setDeleting(false);
    }
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Usuários — {tenantName}
              {codigoLoja && (
                <Badge variant="outline" className="font-mono text-xs ml-2">{codigoLoja}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou cargo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
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
                    <TableHead>Ativo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="w-24 text-center">Ações</TableHead>
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
                        <div className="flex gap-1 justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openResetPassword(u)}
                            title="Resetar senha"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => openDeleteUser(u)}
                            title="Excluir usuário"
                          >
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
            <Input
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
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
