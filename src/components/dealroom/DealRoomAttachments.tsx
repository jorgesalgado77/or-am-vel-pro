import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, Download, FileText, Image, File, Trash2, Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface Attachment {
  id: string;
  session_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  sender: string;
  created_at: string;
}

interface DealRoomAttachmentsProps {
  sessionId: string;
  tenantId: string;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DealRoomAttachments({ sessionId, tenantId }: DealRoomAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadAttachments();
  }, [sessionId]);

  const loadAttachments = async () => {
    const { data } = await supabase
      .from("dealroom_attachments" as any)
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (data) setAttachments(data as unknown as Attachment[]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      const filePath = `${tenantId}/${sessionId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("dealroom-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast.error(`Erro ao enviar ${file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("dealroom-attachments")
        .getPublicUrl(filePath);

      await supabase.from("dealroom_attachments" as any).insert({
        session_id: sessionId,
        tenant_id: tenantId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        sender: "projetista",
      });
    }
    setUploading(false);
    toast.success("Arquivo(s) enviado(s)!");
    loadAttachments();
    e.target.value = "";
  };

  const handleDelete = async (att: Attachment) => {
    await supabase.from("dealroom_attachments" as any).delete().eq("id", att.id);
    toast.success("Arquivo removido");
    loadAttachments();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Anexos</h4>
        <label className="cursor-pointer">
          <input type="file" multiple className="hidden" onChange={handleUpload} />
          <Button variant="outline" size="sm" className="gap-1 text-xs pointer-events-none" asChild>
            <span>
              <Upload className="h-3.5 w-3.5" /> {uploading ? "Enviando..." : "Enviar Arquivo"}
            </span>
          </Button>
        </label>
      </div>

      <ScrollArea className="max-h-[400px]">
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhum anexo enviado.</p>
        ) : (
          <div className="space-y-2">
            {attachments.map(att => (
              <Card key={att.id} className="overflow-hidden">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    {/* Thumbnail */}
                    {att.file_type.startsWith("image/") ? (
                      <img
                        src={att.file_url}
                        alt={att.file_name}
                        className="h-10 w-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        {getFileIcon(att.file_type)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{att.file_name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{formatSize(att.file_size)}</span>
                        <Badge variant="outline" className="text-[9px] h-4">
                          {att.sender === "projetista" ? "Você" : "Cliente"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => window.open(att.file_url, "_blank")}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = att.file_url;
                          a.download = att.file_name;
                          a.click();
                        }}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(att)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
