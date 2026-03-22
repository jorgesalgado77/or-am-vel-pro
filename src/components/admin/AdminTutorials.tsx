import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Film, Upload, Link, GripVertical } from "lucide-react";

interface Tutorial {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string;
  video_url: string;
  thumbnail_url: string | null;
  duracao_segundos: number | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

const CATEGORIES = [
  "Início", "Clientes", "Simulador", "Financeiro", "Configurações",
  "VendaZap", "Campanhas", "Indicações", "Deal Room", "Contratos", "Outros",
];

const EMPTY_FORM = {
  titulo: "",
  descricao: "",
  categoria: "Início",
  video_url: "",
  thumbnail_url: "",
  duracao_segundos: "",
  ordem: "0",
  ativo: true,
};

export function AdminTutorials() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchTutorials();
  }, []);

  const fetchTutorials = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tutorials" as any)
      .select("*")
      .order("ordem", { ascending: true });
    setTutorials((data as any[]) || []);
    setLoading(false);
  };

  const handleAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ordem: String(tutorials.length) });
    setDialogOpen(true);
  };

  const handleEdit = (t: Tutorial) => {
    setEditingId(t.id);
    setForm({
      titulo: t.titulo,
      descricao: t.descricao || "",
      categoria: t.categoria,
      video_url: t.video_url,
      thumbnail_url: t.thumbnail_url || "",
      duracao_segundos: t.duracao_segundos ? String(t.duracao_segundos) : "",
      ordem: String(t.ordem),
      ativo: t.ativo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.video_url.trim()) {
      toast.error("Título e URL do vídeo são obrigatórios");
      return;
    }

    const payload: any = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      categoria: form.categoria,
      video_url: form.video_url.trim(),
      thumbnail_url: form.thumbnail_url.trim() || null,
      duracao_segundos: form.duracao_segundos ? parseInt(form.duracao_segundos) : null,
      ordem: parseInt(form.ordem) || 0,
      ativo: form.ativo,
    };

    if (editingId) {
      const { error } = await supabase.from("tutorials" as any).update(payload).eq("id", editingId);
      if (error) toast.error("Erro ao atualizar: " + error.message);
      else toast.success("Tutorial atualizado!");
    } else {
      const { error } = await supabase.from("tutorials" as any).insert(payload);
      if (error) toast.error("Erro ao criar: " + error.message);
      else toast.success("Tutorial criado!");
    }
    setDialogOpen(false);
    fetchTutorials();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este tutorial?")) return;
    await supabase.from("tutorials" as any).delete().eq("id", id);
    toast.success("Tutorial excluído");
    fetchTutorials();
  };

  const handleToggleActive = async (t: Tutorial) => {
    await supabase.from("tutorials" as any).update({ ativo: !t.ativo }).eq("id", t.id);
    fetchTutorials();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "video" | "thumbnail") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = type === "video" ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Máximo: ${type === "video" ? "100MB" : "5MB"}`);
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `tutorials/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    setUploading(false);

    if (error) {
      toast.error("Erro ao enviar arquivo: " + error.message);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("company-assets").getPublicUrl(path);

    if (type === "video") {
      setForm((f) => ({ ...f, video_url: publicUrl }));
    } else {
      setForm((f) => ({ ...f, thumbnail_url: publicUrl }));
    }
    toast.success("Arquivo enviado com sucesso!");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Tutoriais ({tutorials.length})</CardTitle>
        </div>
        <Button size="sm" onClick={handleAdd} className="gap-1">
          <Plus className="h-4 w-4" /> Novo Tutorial
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-20">Ativo</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tutorials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum tutorial cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                tutorials.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">{t.ordem}</TableCell>
                    <TableCell className="font-medium">{t.titulo}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.categoria}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={t.ativo} onCheckedChange={() => handleToggleActive(t)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Tutorial" : "Novo Tutorial"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Como cadastrar um cliente" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Breve descrição do conteúdo" rows={2} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Video URL / Upload */}
            <div className="space-y-2">
              <Label>Vídeo *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.video_url}
                  onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                  placeholder="Cole o link do vídeo ou faça upload"
                  className="flex-1"
                />
                <Button variant="outline" size="icon" className="shrink-0" asChild disabled={uploading}>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, "video")} />
                  </label>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Aceita links externos (YouTube, Vimeo embed) ou upload direto (máx. 100MB)</p>
            </div>

            {/* Thumbnail */}
            <div className="space-y-2">
              <Label>Thumbnail (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.thumbnail_url}
                  onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
                  placeholder="URL da imagem de capa"
                  className="flex-1"
                />
                <Button variant="outline" size="icon" className="shrink-0" asChild disabled={uploading}>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "thumbnail")} />
                  </label>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duração (segundos)</Label>
                <Input type="number" value={form.duracao_segundos} onChange={(e) => setForm((f) => ({ ...f, duracao_segundos: e.target.value }))} placeholder="120" />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={form.ordem} onChange={(e) => setForm((f) => ({ ...f, ordem: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
              <Label>Tutorial ativo (visível para usuários)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={uploading}>
              {uploading ? "Enviando..." : editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
