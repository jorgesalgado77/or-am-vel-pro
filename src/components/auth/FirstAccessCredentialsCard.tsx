import { ArrowRight, KeyRound, Mail, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}: {
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white/80">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
          <p className="truncate text-base font-semibold text-white md:text-lg">{value}</p>
        </div>
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
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
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
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
          <p className="text-sm font-semibold text-white">Atenção</p>
          <p className="mt-1 text-sm leading-relaxed text-white/65">
            Você é o administrador da nova loja e terá acesso exclusivo às configurações do sistema.
          </p>
        </div>

        <div className="space-y-3">
          <CredentialRow icon={Store} label="Código da loja" value={codigoLoja} />
          <CredentialRow icon={Mail} label="Login" value={email} />
          <CredentialRow icon={KeyRound} label="Senha" value={password} />
        </div>
      </div>

      <Button onClick={onContinue} className="h-12 w-full gap-2 rounded-xl text-base font-semibold">
        Ir para configuração da loja
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
