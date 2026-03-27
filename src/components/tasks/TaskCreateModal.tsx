import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_TYPES, type Task } from "./taskTypes";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<any>;
  editingTask?: Task | null;
  currentUserId?: string;
  currentUserName?: string;
  tenantId: string | null;
}

export function TaskCreateModal({ open, onClose, onSave, editingTask, currentUserId, currentUserName, tenantId }: Props) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataTarefa, setDataTarefa] = useState(new Date().toISOString().slice(0, 10));
  const [horario, setHorario] = useState("");
  const [tipo, setTipo] = useState("geral");
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome_completo: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [anexos, setAnexos] = useState<string[]>([]);

  useEffect(() => {
    if (editingTask) {
      setTitulo(editingTask.titulo);
      setDescricao(editingTask.descricao || "");
      setDataTarefa(editingTask.data_tarefa);
      setHorario(editingTask.horario || "");
      setTipo(editingTask.tipo);
      setResponsavelId(editingTask.responsavel_id || "");
      setAnexos(editingTask.anexos || []);
    } else {
      setTitulo("");
      setDescricao("");
      setDataTarefa(new Date().toISOString().slice(0, 10));
      setHorario("");
      setTipo("geral");
      setResponsavelId(currentUserId || "");
      setAnexos([]);
    }
  }, [editingTask, open, currentUserId]);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("usuarios")
      .select("id, nome_completo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .then(({ data }) => {
        if (data) setUsuarios(data);
      });
  }, [tenantId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const path = `tasks/${tenantId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }
    }
    setAnexos(prev => [...prev, ...urls]);
  };

  const handleSubmit = async () => {
    if (!titulo.trim()) { toast.error("Título é obrigatório"); return; }
    if (!dataTarefa) { toast.error("Data é obrigatória"); return; }
    setSaving(true);
    try {
      const responsavelNome = usuarios.find(u => u.id === responsavelId)?.nome_completo || currentUserName || null;
      await onSave({
        ...(editingTask ? { id: editingTask.id } : {}),
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        data_tarefa: dataTarefa,
        horario: horario || null,
        tipo,
        status: editingTask?.status || "nova",
        responsavel_id: responsavelId || currentUserId || null,
        responsavel_nome: responsavelNome,
        criado_por: currentUserId || null,
        anexos: anexos.length > 0 ? anexos : null,
      });
      toast.success(editingTask ? "Tarefa atualizada!" : "Tarefa criada!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar tarefa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Visita técnica no cliente" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={dataTarefa} onChange={e => setDataTarefa(e.target.value)} />
            </div>
            <div>
              <Label>Horário</Label>
              <Input type="time" value={horario} onChange={e => setHorario(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Tipo de Tarefa</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Responsável</Label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {usuarios.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Detalhes da tarefa..." />
          </div>
          <div>
            <Label>Anexos</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <label className="cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  Enviar arquivos
                  <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                </label>
              </Button>
              {anexos.length > 0 && <span className="text-xs text-muted-foreground">{anexos.length} arquivo(s)</span>}
            </div>
            {anexos.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {anexos.map((url, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                    📎 Arquivo {i + 1}
                    <button onClick={() => setAnexos(prev => prev.filter((_, j) => j !== i))} className="ml-1 text-destructive">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingTask ? "Salvar" : "Criar Tarefa"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
