/**
 * Email Panel — Compose emails with attachments and contact memorization.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Send, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Plus, Loader2, Inbox, Paperclip, X, FileText, Image, Upload, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const CONTACTS_KEY = "email-saved-contacts";

interface EmailRecord {
  id: string;
  to_email: string;
  cc_email?: string;
  subject: string;
  body_html?: string;
  status: string;
  created_at: string;
  sent_by?: string;
}

interface AttachmentFile {
  file: File;
  previewUrl: string;
  kind: "image" | "pdf" | "other";
}

type ComposeStep = "to" | "cc" | "subject" | "body" | "review";

function getSavedContacts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveContact(email: string) {
  const contacts = getSavedContacts();
  const normalized = email.trim().toLowerCase();
  if (!normalized || contacts.includes(normalized)) return;
  const updated = [normalized, ...contacts].slice(0, 50);
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
}

function getFileKind(file: File): "image" | "pdf" | "other" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "pdf";
  return "other";
}

export function EmailPanel() {
  const [tab, setTab] = useState("compose");

  // Compose state
  const [step, setStep] = useState<ComposeStep>("to");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [savedContacts, setSavedContacts] = useState<string[]>(getSavedContacts);
  const [showContactSuggestions, setShowContactSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History state
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const loadHistory = useCallback(async (p: number) => {
    setLoadingHistory(true);
    try {
      const tenantId = await getResolvedTenantId();
      const from = (p - 1) * PAGE_SIZE;
      const toRange = from + PAGE_SIZE - 1;

      const { data, count, error } = await (supabase as any)
        .from("mia_email_history")
        .select("id, to_email, cc_email, subject, body_html, status, created_at, sent_by", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(from, toRange);

      if (!error) {
        setEmails((data || []) as EmailRecord[]);
        setTotalCount(count || 0);
      }
    } catch { /* silent */ }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory(page);
  }, [tab, page, loadHistory]);

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSending(true);
    try {
      const tenantId = await getResolvedTenantId();
      const currentUserId = localStorage.getItem("current_user_id");

      let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">`;
      htmlBody += `<div style="white-space:pre-wrap;line-height:1.6;">${body.replace(/\n/g, "<br>")}</div>`;

      // Add attachment info to email body
      if (attachments.length > 0) {
        htmlBody += `<hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0;">`;
        htmlBody += `<p style="font-size:12px;color:#64748b;">📎 ${attachments.length} anexo(s) incluído(s)</p>`;
        htmlBody += `<div style="display:flex;flex-wrap:wrap;gap:8px;">`;
        for (const att of attachments) {
          if (att.kind === "image") {
            // Upload to storage and include link
            const path = `email-attachments/${tenantId}/${Date.now()}-${att.file.name}`;
            const { data: uploadData } = await supabase.storage
              .from("attachments")
              .upload(path, att.file, { upsert: true });
            if (uploadData) {
              const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
              htmlBody += `<a href="${urlData.publicUrl}" target="_blank" style="display:inline-block;margin:4px;">`;
              htmlBody += `<img src="${urlData.publicUrl}" alt="${att.file.name}" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid #e2e8f0;">`;
              htmlBody += `</a>`;
            }
          } else {
            htmlBody += `<p style="font-size:12px;">📄 ${att.file.name} (${(att.file.size / 1024).toFixed(1)} KB)</p>`;
          }
        }
        htmlBody += `</div>`;
      }

      htmlBody += `</div>`;

      const { data, error } = await supabase.functions.invoke("resend-email", {
        body: {
          action: "send",
          tenant_id: tenantId,
          to,
          cc: cc || undefined,
          subject,
          html: htmlBody,
          sent_by: currentUserId,
        },
      });

      if (error || !data?.success) {
        toast.error("Erro ao enviar: " + (data?.error || error?.message || "Erro desconhecido"));
      } else {
        // Save contacts
        saveContact(to);
        if (cc) saveContact(cc);
        setSavedContacts(getSavedContacts());

        toast.success("✅ Email enviado com sucesso!");
        resetCompose();
        setTab("history");
        loadHistory(1);
        setPage(1);
      }
    } catch (err: any) {
      toast.error("Falha ao enviar: " + (err.message || "Erro desconhecido"));
    }
    setSending(false);
  };

  const resetCompose = () => {
    setStep("to");
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
    // Revoke preview URLs
    attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  const canAdvance = () => {
    if (step === "to") return /\S+@\S+\.\S+/.test(to);
    if (step === "cc") return true;
    if (step === "subject") return subject.trim().length > 0;
    if (step === "body") return body.trim().length > 0;
    return true;
  };

  const nextStep = () => {
    const steps: ComposeStep[] = ["to", "cc", "subject", "body", "review"];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const steps: ComposeStep[] = ["to", "cc", "subject", "body", "review"];
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    const newAttachments: AttachmentFile[] = Array.from(files).map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
      kind: getFileKind(file),
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const selectContact = (email: string) => {
    setTo(email);
    setShowContactSuggestions(false);
  };

  const removeContact = (email: string) => {
    const updated = savedContacts.filter(c => c !== email);
    setSavedContacts(updated);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
  };

  const filteredContacts = savedContacts.filter(c =>
    !to || c.toLowerCase().includes(to.toLowerCase())
  );

  const stepNumber = ["to", "cc", "subject", "body", "review"].indexOf(step) + 1;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose" className="gap-2">
            <Plus className="h-4 w-4" /> Compor Email
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Inbox className="h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-5 w-5 text-primary" />
                Compor Email — Etapa {stepNumber} de 5
              </CardTitle>
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4, 5].map(s => (
                  <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= stepNumber ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === "to" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">📧 Para quem deseja enviar?</Label>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="destinatario@email.com"
                      value={to}
                      onChange={e => { setTo(e.target.value); setShowContactSuggestions(true); }}
                      onFocus={() => setShowContactSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowContactSuggestions(false), 200)}
                      autoFocus
                    />
                    {showContactSuggestions && filteredContacts.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        <div className="p-2">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-2 pb-1 flex items-center gap-1">
                            <Users className="h-3 w-3" /> Contatos Salvos
                          </p>
                          {filteredContacts.map(contact => (
                            <div
                              key={contact}
                              className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
                            >
                              <button
                                type="button"
                                className="flex-1 text-left text-sm"
                                onMouseDown={(e) => { e.preventDefault(); selectContact(contact); }}
                              >
                                {contact}
                              </button>
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                onMouseDown={(e) => { e.preventDefault(); removeContact(contact); }}
                                title="Remover contato"
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe o email do destinatário principal.
                    {savedContacts.length > 0 && ` • ${savedContacts.length} contato(s) memorizado(s)`}
                  </p>
                </div>
              )}

              {step === "cc" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">📋 Deseja adicionar alguém em cópia (CC)?</Label>
                  <Input
                    type="email"
                    placeholder="copia@email.com (opcional)"
                    value={cc}
                    onChange={e => setCc(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">Opcional — deixe em branco para pular.</p>
                </div>
              )}

              {step === "subject" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">📝 Qual o assunto do email?</Label>
                  <Input
                    placeholder="Ex: Proposta comercial - Projeto Cozinha"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              {step === "body" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">✏️ Escreva o corpo do email</Label>
                    <Textarea
                      placeholder="Escreva aqui o conteúdo do email..."
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      rows={8}
                      className="resize-y"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">Dica: Quebre linhas para melhor formatação.</p>
                  </div>

                  {/* Attachments Section */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Anexos ({attachments.length})
                    </Label>

                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((att, idx) => (
                          <div key={`${att.file.name}-${idx}`} className="relative group">
                            <div className="h-20 w-20 rounded-lg border-2 border-border bg-muted flex items-center justify-center overflow-hidden shadow-sm">
                              {att.kind === "image" ? (
                                <img
                                  src={att.previewUrl}
                                  alt={att.file.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : att.kind === "pdf" ? (
                                <div className="flex flex-col items-center gap-1">
                                  <FileText className="h-6 w-6 text-destructive" />
                                  <span className="text-[8px] font-bold text-muted-foreground">PDF</span>
                                </div>
                              ) : (
                                <FileText className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate w-20 mt-0.5 text-center">
                              {att.file.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeAttachment(idx)}
                              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Adicionar anexo</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                        className="hidden"
                        onChange={e => {
                          handleFileAdd(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      Imagens, PDFs e documentos. As imagens aparecerão no corpo do email.
                    </p>
                  </div>
                </div>
              )}

              {step === "review" && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">📧 Confirme antes de enviar:</h4>
                  <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
                    <div><span className="text-muted-foreground">Para:</span> <span className="font-medium">{to}</span></div>
                    {cc && <div><span className="text-muted-foreground">CC:</span> <span className="font-medium">{cc}</span></div>}
                    <div><span className="text-muted-foreground">Assunto:</span> <span className="font-medium">{subject}</span></div>
                    {attachments.length > 0 && (
                      <div><span className="text-muted-foreground">Anexos:</span> <span className="font-medium">{attachments.length} arquivo(s)</span></div>
                    )}
                    <Separator />
                    <div className="whitespace-pre-wrap text-foreground">{body}</div>
                    {attachments.length > 0 && (
                      <>
                        <Separator />
                        <div className="flex flex-wrap gap-2">
                          {attachments.map((att, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 bg-background rounded-md px-2 py-1 border text-xs">
                              {att.kind === "image" ? <Image className="h-3 w-3 text-primary" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                              <span className="truncate max-w-[120px]">{att.file.name}</span>
                              <span className="text-muted-foreground">({(att.file.size / 1024).toFixed(0)} KB)</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={step === "to" ? resetCompose : prevStep} disabled={sending}>
                  {step === "to" ? "Limpar" : "Voltar"}
                </Button>
                {step === "review" ? (
                  <Button onClick={handleSend} disabled={sending} className="gap-2">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {sending ? "Enviando..." : "Enviar Email"}
                  </Button>
                ) : (
                  <Button onClick={nextStep} disabled={!canAdvance()}>
                    Próximo →
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base">
                  <Inbox className="h-5 w-5 text-primary" />
                  Emails Enviados
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {totalCount} email(s) • Página {page}/{totalPages}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : emails.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhum email enviado ainda.</p>
                  <Button variant="link" onClick={() => setTab("compose")} className="mt-2">
                    Compor primeiro email →
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-[60vh]">
                  <div className="space-y-2">
                    {emails.map(email => {
                      const date = new Date(email.created_at);
                      const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
                      const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      const statusIcon = email.status === "sent" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : email.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Clock className="h-4 w-4 text-warning" />
                      );
                      return (
                        <div key={email.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                          <div className="mt-1">{statusIcon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{email.subject || "(sem assunto)"}</span>
                              <Badge variant="outline" className="text-[9px] shrink-0">
                                {email.status === "sent" ? "Enviado" : email.status === "failed" ? "Falhou" : "Pendente"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              Para: {email.to_email}
                              {email.cc_email ? ` • CC: ${email.cc_email}` : ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {dateStr} às {timeStr}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
