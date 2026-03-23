import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, StoreIcon, Sparkles, Copy, Check, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface InactiveStore {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
  email_contato: string | null;
  telefone_contato: string | null;
  plano: string;
  created_at: string;
  admin_nome: string | null;
  admin_telefone: string | null;
  admin_email: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenants: { id: string; nome_loja: string; codigo_loja: string | null; ativo: boolean; plano: string; email_contato: string | null; telefone_contato: string | null; created_at: string }[];
}

export function AdminInactiveStoresModal({ open, onOpenChange, tenants }: Props) {
  const [stores, setStores] = useState<InactiveStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [aiCampaign, setAiCampaign] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [selectedStore, setSelectedStore] = useState<InactiveStore | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadInactiveStores();
  }, [open]);

  const loadInactiveStores = async () => {
    setLoading(true);
    const inactiveTenants = tenants.filter(t => !t.ativo);

    if (inactiveTenants.length === 0) {
      setStores([]);
      setLoading(false);
      return;
    }

    const tenantIds = inactiveTenants.map(t => t.id);
    const { data: users } = await supabase
      .from("usuarios")
      .select("tenant_id, nome_completo, telefone, email")
      .in("tenant_id", tenantIds);

    const adminMap: Record<string, { nome: string; tel: string | null; email: string | null }> = {};
    if (users) {
      users.forEach(u => {
        if (!adminMap[u.tenant_id]) {
          adminMap[u.tenant_id] = { nome: u.nome_completo, tel: u.telefone, email: u.email };
        }
      });
    }

    const mapped: InactiveStore[] = inactiveTenants.map(t => ({
      id: t.id,
      nome_loja: t.nome_loja,
      codigo_loja: t.codigo_loja,
      email_contato: t.email_contato,
      telefone_contato: t.telefone_contato,
      plano: t.plano,
      created_at: t.created_at,
      admin_nome: adminMap[t.id]?.nome || null,
      admin_telefone: adminMap[t.id]?.tel || t.telefone_contato || null,
      admin_email: adminMap[t.id]?.email || t.email_contato || null,
    }));

    setStores(mapped);
    setLoading(false);
  };

  const generateRecoveryCampaign = (store: InactiveStore) => {
    setSelectedStore(store);
    setGeneratingAi(true);

    // Generate campaign suggestions locally
    setTimeout(() => {
      const nome = store.admin_nome || "Gestor";
      const loja = store.nome_loja;

      const campaign = `🎯 **Campanha de Recuperação - ${loja}**

📱 **Mensagem WhatsApp (Opção 1 - Tom Amigável):**
Olá ${nome}! 👋 Aqui é da equipe OrçaMóvel PRO. Sentimos sua falta! 😊
Notamos que a loja ${loja} está inativa há algum tempo.
Temos novidades incríveis: IA para vendas, Deal Room e muito mais!
Que tal reativar sua conta? Preparamos condições especiais para você! 🚀
Responda "QUERO" e falo mais detalhes!

📱 **Mensagem WhatsApp (Opção 2 - Tom Urgência):**
${nome}, sua loja ${loja} está perdendo vendas! 📉
Enquanto isso, seus concorrentes já estão usando:
✅ Simulador inteligente com IA
✅ Contratos automáticos
✅ Follow-up automático
Reative AGORA com 30% OFF no primeiro mês! ⏰
Link: [inserir link de reativação]

📧 **E-mail de Recuperação:**
Assunto: ${nome}, ${loja} está esperando por você!

Corpo: Olá ${nome}, notamos que a ${loja} não tem acessado o OrçaMóvel PRO ultimamente. Entendemos que imprevistos acontecem, mas queremos garantir que sua equipe tenha as melhores ferramentas disponíveis.

Desde sua última visita, adicionamos:
• VendaZap AI - Assistente de vendas 24h
• Deal Room - Sala de negociação digital
• Campanhas automáticas com IA
• Relatórios financeiros avançados

Como gesto de boas-vindas, oferecemos 30% de desconto na reativação.

💡 **Dicas de abordagem:**
- Ligar em horário comercial (10h-12h ou 14h-16h)
- Perguntar sobre dificuldades que teve
- Oferecer treinamento gratuito de 30min
- Destacar novos recursos desde a última vez que usou`;

      setAiCampaign(campaign);
      setGeneratingAi(false);
    }, 1500);
  };

  const copyToClipboard = () => {
    if (aiCampaign) {
      navigator.clipboard.writeText(aiCampaign);
      setCopied(true);
      toast.success("Campanha copiada!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filtered = stores.filter(s =>
    !search ||
    s.nome_loja.toLowerCase().includes(search.toLowerCase()) ||
    (s.codigo_loja || "").includes(search) ||
    (s.admin_nome || "").toLowerCase().includes(search.toLowerCase())
  );

  const PLAN_LABELS: Record<string, string> = {
    trial: "Teste Grátis",
    basico: "Básico",
    premium: "Premium",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StoreIcon className="h-5 w-5 text-destructive" />
            Lojas Inativas ({stores.length})
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ou administrador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma loja inativa encontrada 🎉</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Administrador</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Último Plano</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-center">Recuperar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.codigo_loja || "—"}</TableCell>
                  <TableCell className="font-medium">{s.nome_loja}</TableCell>
                  <TableCell>{s.admin_nome || "—"}</TableCell>
                  <TableCell className="text-xs">{s.admin_telefone || "—"}</TableCell>
                  <TableCell className="text-xs">{s.admin_email || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{PLAN_LABELS[s.plano] || s.plano}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => generateRecoveryCampaign(s)}
                    >
                      <Sparkles className="h-3 w-3" /> IA
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* AI Campaign Modal */}
        {aiCampaign && (
          <div className="mt-4 border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Campanha de Recuperação - {selectedStore?.nome_loja}
              </h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-1">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAiCampaign(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="bg-background rounded p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
              {generatingAi ? "Gerando campanha com IA..." : aiCampaign}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
