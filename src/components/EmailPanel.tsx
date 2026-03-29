/**
 * Email Panel — Rich text compose with attachments, contact memorization, drag & drop, resend/forward.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Send, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Plus, Loader2, Inbox, Paperclip, X, FileText, Image, Upload, Users,
  RefreshCw, Forward, Bold, Italic, Underline, AlignLeft, AlignCenter,
  AlignRight, Type, Palette, Highlighter,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PAGE_SIZE = 20;
const CONTACTS_KEY = "email-saved-contacts";

const EMAIL_TEMPLATES = [
  {
    name: "Proposta Comercial",
    icon: "💼",
    subject: "Proposta Comercial - [Nome do Projeto]",
    body: `<p>Prezado(a) <strong>[Nome do Cliente]</strong>,</p>
<p>Conforme nosso contato, segue abaixo a proposta comercial para o projeto <strong>[Nome do Projeto]</strong>.</p>
<p><strong>Detalhes da proposta:</strong></p>
<ul>
<li>Ambientes: [Listar ambientes]</li>
<li>Valor total: R$ [Valor]</li>
<li>Prazo de entrega: [Prazo]</li>
<li>Condições de pagamento: [Condições]</li>
</ul>
<p>Estou à disposição para esclarecer qualquer dúvida.</p>
<p>Atenciosamente,<br/>[Seu Nome]</p>`,
  },
  {
    name: "Follow-up",
    icon: "🔄",
    subject: "Follow-up - Proposta [Nome do Projeto]",
    body: `<p>Olá <strong>[Nome do Cliente]</strong>,</p>
<p>Tudo bem? Gostaria de retomar nosso contato referente à proposta enviada para o projeto <strong>[Nome do Projeto]</strong>.</p>
<p>Gostaria de saber se teve a oportunidade de analisar os detalhes e se posso ajudar com alguma dúvida.</p>
<p>Lembro que as condições especiais que oferecemos continuam válidas por tempo limitado.</p>
<p>Fico no aguardo do seu retorno!</p>
<p>Abraços,<br/>[Seu Nome]</p>`,
  },
  {
    name: "Agradecimento",
    icon: "🙏",
    subject: "Agradecemos a preferência!",
    body: `<p>Prezado(a) <strong>[Nome do Cliente]</strong>,</p>
<p>Gostaríamos de agradecer pela confiança em nosso trabalho!</p>
<p>Seu projeto está sendo tratado com todo cuidado e dedicação. Em breve entraremos em contato com atualizações sobre o andamento.</p>
<p>Caso precise de algo, não hesite em nos contatar.</p>
<p>Muito obrigado(a)!</p>
<p>Atenciosamente,<br/>[Seu Nome]</p>`,
  },
  {
    name: "Confirmação de Medição",
    icon: "📐",
    subject: "Confirmação de Agendamento - Medição",
    body: `<p>Olá <strong>[Nome do Cliente]</strong>,</p>
<p>Confirmamos o agendamento da medição para:</p>
<ul>
<li><strong>Data:</strong> [Data]</li>
<li><strong>Horário:</strong> [Horário]</li>
<li><strong>Endereço:</strong> [Endereço completo]</li>
</ul>
<p>Nosso técnico estará no local no horário combinado. Por favor, garanta que os ambientes estejam acessíveis.</p>
<p>Qualquer necessidade de reagendamento, entre em contato com antecedência.</p>
<p>Atenciosamente,<br/>[Seu Nome]</p>`,
  },
  {
    name: "Entrega Agendada",
    icon: "🚚",
    subject: "Agendamento de Entrega - [Nome do Projeto]",
    body: `<p>Prezado(a) <strong>[Nome do Cliente]</strong>,</p>
<p>Temos o prazer de informar que sua entrega foi agendada!</p>
<ul>
<li><strong>Data prevista:</strong> [Data]</li>
<li><strong>Período:</strong> [Manhã/Tarde]</li>
<li><strong>Endereço:</strong> [Endereço]</li>
</ul>
<p>Nossa equipe entrará em contato no dia para confirmar o horário exato.</p>
<p>Agradecemos a preferência!</p>
<p>Atenciosamente,<br/>[Seu Nome]</p>`,
  },
  {
    name: "Pós-venda",
    icon: "⭐",
    subject: "Como foi sua experiência?",
    body: `<p>Olá <strong>[Nome do Cliente]</strong>,</p>
<p>Esperamos que esteja satisfeito(a) com seu projeto!</p>
<p>Gostaríamos de saber como foi sua experiência conosco. Sua opinião é muito importante para continuarmos melhorando nossos serviços.</p>
<p>Caso tenha alguma observação ou precise de suporte, estamos à disposição.</p>
<p>Obrigado(a) por escolher nossos serviços!</p>
<p>Abraços,<br/>[Seu Nome]</p>`,
  },
];

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

const FONT_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
const FONT_FAMILIES = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New", "Trebuchet MS"];
const TEXT_COLORS = [
  "#000000", "#333333", "#555555", "#1a73e8", "#d93025", "#188038",
  "#e37400", "#9334e6", "#c2185b", "#ffffff",
];
const HIGHLIGHT_COLORS = [
  "transparent", "#ffff00", "#00ff00", "#00ffff", "#ff69b4", "#ffa500",
  "#add8e6", "#dda0dd", "#90ee90", "#ffd700",
];

function RichTextToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement> }) {
  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 rounded-t-lg">
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("bold")} title="Negrito">
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("italic")} title="Itálico">
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("underline")} title="Sublinhado">
        <Underline className="h-3.5 w-3.5" />
      </Button>
      <Separator orientation="vertical" className="h-5 mx-0.5" />
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("justifyLeft")} title="Alinhar à esquerda">
        <AlignLeft className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("justifyCenter")} title="Centralizar">
        <AlignCenter className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("justifyRight")} title="Alinhar à direita">
        <AlignRight className="h-3.5 w-3.5" />
      </Button>
      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Font size */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Tamanho da fonte">
            <Type className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1" align="start">
          <div className="flex flex-col gap-0.5">
            {FONT_SIZES.map(s => (
              <Button key={s} variant="ghost" size="sm" className="h-6 text-xs justify-start" onClick={() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  const span = document.createElement("span");
                  span.style.fontSize = s;
                  try { range.surroundContents(span); } catch {}
                }
                editorRef.current?.focus();
              }}>
                {s}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Font family */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] px-1.5" title="Fonte">
            Fonte
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1" align="start">
          <div className="flex flex-col gap-0.5">
            {FONT_FAMILIES.map(f => (
              <Button key={f} variant="ghost" size="sm" className="h-6 text-xs justify-start" style={{ fontFamily: f }} onClick={() => exec("fontName", f)}>
                {f}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Text color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Cor do texto">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <p className="text-[10px] text-muted-foreground mb-1">Cor do texto</p>
          <div className="grid grid-cols-5 gap-1">
            {TEXT_COLORS.map(c => (
              <button key={c} type="button" className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform" style={{ backgroundColor: c }} onClick={() => exec("foreColor", c)} />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Highlight */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Destaque">
            <Highlighter className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <p className="text-[10px] text-muted-foreground mb-1">Cor de destaque</p>
          <div className="grid grid-cols-5 gap-1">
            {HIGHLIGHT_COLORS.map(c => (
              <button key={c} type="button" className={`h-6 w-6 rounded border border-border hover:scale-110 transition-transform ${c === "transparent" ? "bg-background" : ""}`} style={c !== "transparent" ? { backgroundColor: c } : {}} onClick={() => exec("hiliteColor", c)} title={c === "transparent" ? "Sem destaque" : c} />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AttachmentThumbnail({ att, onRemove, size = "md" }: { att: AttachmentFile; onRemove?: () => void; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-16 w-16" : "h-20 w-20";
  const textSize = size === "sm" ? "text-[7px]" : "text-[9px]";
  const nameWidth = size === "sm" ? "w-16" : "w-20";

  return (
    <div className="relative group flex flex-col items-center">
      <div className={`${dim} rounded-lg border-2 border-border bg-muted flex items-center justify-center overflow-hidden shadow-sm`}>
        {att.kind === "image" ? (
          <img src={att.previewUrl} alt={att.file.name} className="h-full w-full object-cover" />
        ) : att.kind === "pdf" ? (
          <div className="flex flex-col items-center gap-0.5 p-1">
            <FileText className="h-5 w-5 text-destructive" />
            <span className="text-[7px] font-bold text-muted-foreground uppercase">PDF</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5 p-1">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="text-[7px] font-medium text-muted-foreground uppercase truncate max-w-[50px]">
              {att.file.name.split('.').pop()}
            </span>
          </div>
        )}
      </div>
      <p className={`${textSize} text-muted-foreground truncate ${nameWidth} mt-0.5 text-center`}>
        {att.file.name}
      </p>
      <p className={`${textSize} text-muted-foreground/70`}>
        {(att.file.size / 1024).toFixed(0)} KB
      </p>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function EmailPanel() {
  const [tab, setTab] = useState("compose");

  // Compose state
  const [step, setStep] = useState<ComposeStep>("to");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [savedContacts, setSavedContacts] = useState<string[]>(getSavedContacts);
  const [showContactSuggestions, setShowContactSuggestions] = useState(false);
  const [showCcContactSuggestions, setShowCcContactSuggestions] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [contactsTab, setContactsTab] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

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

  // Load history on tab switch + realtime subscription
  useEffect(() => {
    if (tab === "history") loadHistory(page);
  }, [tab, page, loadHistory]);

  // Realtime subscription for email history
  useEffect(() => {
    let channel: any = null;
    const setup = async () => {
      try {
        const tenantId = await getResolvedTenantId();
        channel = supabase
          .channel("email-history-realtime")
          .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "mia_email_history",
            filter: `tenant_id=eq.${tenantId}`,
          }, () => {
            loadHistory(page);
          })
          .subscribe();
      } catch {}
    };
    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [page, loadHistory]);

  const handleSend = async () => {
    if (!to || !subject) {
      toast.error("Preencha destinatário e assunto");
      return;
    }
    const htmlContent = editorRef.current?.innerHTML || bodyHtml || "";
    if (!htmlContent.replace(/<[^>]*>/g, "").trim()) {
      toast.error("Escreva o corpo do email");
      return;
    }
    setSending(true);
    try {
      const tenantId = await getResolvedTenantId();
      const currentUserId = localStorage.getItem("current_user_id");

      let finalHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">`;
      finalHtml += `<div style="line-height:1.6;">${htmlContent}</div>`;

      if (attachments.length > 0) {
        finalHtml += `<hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0;">`;
        finalHtml += `<p style="font-size:12px;color:#64748b;">📎 ${attachments.length} anexo(s) incluído(s)</p>`;
        finalHtml += `<div style="display:flex;flex-wrap:wrap;gap:8px;">`;
        for (const att of attachments) {
          if (att.kind === "image") {
            const path = `email-attachments/${tenantId}/${Date.now()}-${att.file.name}`;
            const { data: uploadData } = await supabase.storage
              .from("attachments")
              .upload(path, att.file, { upsert: true });
            if (uploadData) {
              const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
              finalHtml += `<a href="${urlData.publicUrl}" target="_blank" style="display:inline-block;margin:4px;">`;
              finalHtml += `<img src="${urlData.publicUrl}" alt="${att.file.name}" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid #e2e8f0;">`;
              finalHtml += `</a>`;
            }
          } else {
            finalHtml += `<p style="font-size:12px;">📄 ${att.file.name} (${(att.file.size / 1024).toFixed(1)} KB)</p>`;
          }
        }
        finalHtml += `</div>`;
      }
      finalHtml += `</div>`;

      // Save contacts
      saveContact(to);
      if (cc) saveContact(cc);
      setSavedContacts(getSavedContacts());

      const { data, error } = await supabase.functions.invoke("resend-email", {
        body: {
          action: "send",
          tenant_id: tenantId,
          to,
          cc: cc || undefined,
          subject,
          html: finalHtml,
          sent_by: currentUserId,
        },
      });

      if (error || !data?.success) {
        toast.error("Erro ao enviar: " + (data?.error || error?.message || "Erro desconhecido"));
      } else {
        toast.success("✅ Email enviado com sucesso!");
        resetCompose();
        setTab("history");
        setPage(1);
        // Realtime will catch the new record, but also force load
        setTimeout(() => loadHistory(1), 500);
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
    setBodyHtml("");
    if (editorRef.current) editorRef.current.innerHTML = "";
    attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  const canAdvance = () => {
    if (step === "to") return /\S+@\S+\.\S+/.test(to);
    if (step === "cc") return true;
    if (step === "subject") return subject.trim().length > 0;
    if (step === "body") {
      const html = editorRef.current?.innerHTML || bodyHtml || "";
      return html.replace(/<[^>]*>/g, "").trim().length > 0;
    }
    return true;
  };

  const nextStep = () => {
    const steps: ComposeStep[] = ["to", "cc", "subject", "body", "review"];
    const idx = steps.indexOf(step);
    if (step === "body" && editorRef.current) {
      setBodyHtml(editorRef.current.innerHTML);
    }
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const steps: ComposeStep[] = ["to", "cc", "subject", "body", "review"];
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  // Restore editor content when going back to body step
  useEffect(() => {
    if (step === "body" && editorRef.current && bodyHtml) {
      editorRef.current.innerHTML = bodyHtml;
    }
  }, [step]);

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

  const selectCcContact = (email: string) => {
    setCc(email);
    setShowCcContactSuggestions(false);
  };

  const removeContact = (email: string) => {
    const updated = savedContacts.filter(c => c !== email);
    setSavedContacts(updated);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
  };

  const filteredContacts = savedContacts.filter(c =>
    !to || c.toLowerCase().includes(to.toLowerCase())
  );

  const filteredCcContacts = savedContacts.filter(c =>
    !cc || c.toLowerCase().includes(cc.toLowerCase())
  );

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); handleFileAdd(e.dataTransfer.files); };

  const handleResend = (email: EmailRecord) => {
    setTo(email.to_email);
    setCc(email.cc_email || "");
    setSubject(email.subject);
    setBodyHtml(email.body_html || "");
    setStep("review");
    setTab("compose");
  };

  const handleForward = (email: EmailRecord) => {
    setTo("");
    setCc("");
    setSubject(`Fwd: ${email.subject}`);
    const tmp = document.createElement("div");
    tmp.innerHTML = email.body_html || "";
    const originalBody = tmp.textContent || tmp.innerText || "";
    setBodyHtml(`<br><br>---------- Email Encaminhado ----------<br>De: ${email.to_email}<br>Assunto: ${email.subject}<br><br>${originalBody}`);
    setStep("to");
    setTab("compose");
  };

  const stepNumber = ["to", "cc", "subject", "body", "review"].indexOf(step) + 1;

  const renderContactSuggestions = (
    contacts: string[],
    onSelect: (email: string) => void,
    show: boolean,
  ) => {
    if (!show || contacts.length === 0) return null;
    return (
      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
        <div className="p-2">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-2 pb-1 flex items-center gap-1">
            <Users className="h-3 w-3" /> Contatos Salvos
          </p>
          {contacts.map(contact => (
            <div
              key={contact}
              className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
            >
              <button
                type="button"
                className="flex-1 text-left text-sm"
                onMouseDown={(e) => { e.preventDefault(); onSelect(contact); }}
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
    );
  };

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
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" /> Contatos ({savedContacts.length})
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
              {/* Email Templates - show on step "to" */}
              {step === "to" && !to && !subject && !bodyHtml && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">📋 Templates Prontos</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {EMAIL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.name}
                        type="button"
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-primary/5 hover:border-primary/40 transition-colors text-left group"
                        onClick={() => {
                          setSubject(tpl.subject);
                          setBodyHtml(tpl.body);
                          if (editorRef.current) editorRef.current.innerHTML = tpl.body;
                          toast.success(`Template "${tpl.name}" carregado!`);
                        }}
                      >
                        <span className="text-lg">{tpl.icon}</span>
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{tpl.name}</span>
                      </button>
                    ))}
                  </div>
                  <Separator />
                </div>
              )}
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
                    {renderContactSuggestions(filteredContacts, selectContact, showContactSuggestions)}
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
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="copia@email.com (opcional)"
                      value={cc}
                      onChange={e => { setCc(e.target.value); setShowCcContactSuggestions(true); }}
                      onFocus={() => setShowCcContactSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCcContactSuggestions(false), 200)}
                      autoFocus
                    />
                    {renderContactSuggestions(filteredCcContacts, selectCcContact, showCcContactSuggestions)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Opcional — deixe em branco para pular.
                  </p>
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
                    <div className="border border-border rounded-lg overflow-hidden">
                      <RichTextToolbar editorRef={editorRef as React.RefObject<HTMLDivElement>} />
                      <div
                        ref={editorRef}
                        contentEditable
                        className="min-h-[200px] max-h-[400px] overflow-y-auto p-3 text-sm text-foreground bg-background focus:outline-none"
                        style={{ lineHeight: 1.6 }}
                        onInput={() => {
                          if (editorRef.current) setBodyHtml(editorRef.current.innerHTML);
                        }}
                        data-placeholder="Escreva aqui o conteúdo do email..."
                        suppressContentEditableWarning
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Use a barra de ferramentas para formatar o texto.</p>
                  </div>

                  {/* Attachments Section */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Anexos ({attachments.length})
                    </Label>

                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {attachments.map((att, idx) => (
                          <AttachmentThumbnail key={`${att.file.name}-${idx}`} att={att} onRemove={() => removeAttachment(idx)} />
                        ))}
                      </div>
                    )}

                    <div
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
                        isDraggingOver
                          ? "border-primary bg-primary/10"
                          : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className={`h-6 w-6 ${isDraggingOver ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm ${isDraggingOver ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        {isDraggingOver ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para anexar"}
                      </span>
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
                    </div>
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
                    <Separator />
                    <div
                      className="text-foreground prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                    {attachments.length > 0 && (
                      <>
                        <Separator />
                        <p className="text-xs text-muted-foreground font-semibold">📎 Anexos ({attachments.length})</p>
                        <div className="flex flex-wrap gap-3">
                          {attachments.map((att, idx) => (
                            <AttachmentThumbnail key={idx} att={att} size="sm" />
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
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => loadHistory(page)} className="h-7 gap-1 text-xs">
                    <RefreshCw className="h-3 w-3" /> Atualizar
                  </Button>
                  <span className="text-xs text-muted-foreground font-normal">
                    {totalCount} email(s) • Pág {page}/{totalPages}
                  </span>
                </div>
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
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : email.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-500" />
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
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResend(email)} title="Reenviar">
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleForward(email)} title="Encaminhar">
                              <Forward className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-primary" />
                Contatos Salvos ({savedContacts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {savedContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum contato salvo.</p>
                  <p className="text-xs mt-1">Contatos são salvos automaticamente ao enviar emails.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-1">
                    {savedContacts.map(contact => (
                      <div key={contact} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{contact}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setTo(contact); setTab("compose"); setStep("to"); }}>
                            Usar
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeContact(contact)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
