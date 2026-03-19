import { ArrowRight, Check, Copy, KeyRound, Mail, Send, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface FirstAccessCredentialsCardProps {
  codigoLoja: string;
  email: string;
  password: string;
  onContinue: () => void;
}

function CredentialRow({
  icon: Icon,
  label,
  value,
  accentClass,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  accentClass: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="group rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>
          <p className="truncate text-base font-bold text-white md:text-lg">{value}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 transition-all hover:bg-white/15 hover:text-white"
          title={`Copiar ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function FirstAccessCredentialsCard({
  codigoLoja,
  email,
  password,
  onContinue,
}: FirstAccessCredentialsCardProps) {
  const [sending, setSending] = useState(false);

  const handleCopyAll = async () => {
    const text = `Código da Loja: ${codigoLoja}\nLogin: ${email}\nSenha: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Todos os dados copiados!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleSendEmail = async () => {
    setSending(true);
    // Simula envio — em produção, chamar endpoint real
    await new Promise((r) => setTimeout(r, 1500));
    toast.success("Credenciais enviadas para " + email);
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Conta criada com sucesso</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Guarde estes dados agora: eles serão obrigatórios no próximo acesso à sua loja.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-left">
          <p className="text-sm font-semibold text-amber-300">⚠ Atenção</p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">
            Você é o administrador da nova loja e terá acesso exclusivo às configurações do sistema.
          </p>
        </div>

        <div className="space-y-3">
          <CredentialRow
            icon={Store}
            label="Código da Loja"
            value={codigoLoja}
            accentClass="bg-sky-500/20 text-sky-400"
          />
          <CredentialRow
            icon={Mail}
            label="Login"
            value={email}
            accentClass="bg-violet-500/20 text-violet-400"
          />
          <CredentialRow
            icon={KeyRound}
            label="Senha"
            value={password}
            accentClass="bg-emerald-500/20 text-emerald-400"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyAll}
            className="flex-1 gap-2 border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar tudo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSendEmail}
            disabled={sending}
            className="flex-1 gap-2 border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "Enviando..." : "Enviar por e-mail"}
          </Button>
        </div>
      </div>

      <Button onClick={onContinue} className="h-12 w-full gap-2 rounded-xl text-base font-semibold">
        Ir para configuração da loja
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
