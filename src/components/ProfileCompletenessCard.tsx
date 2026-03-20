import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, User, Building2 } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useAuth } from "@/contexts/AuthContext";

interface FieldCheck {
  label: string;
  filled: boolean;
  category: "usuario" | "loja";
}

export function ProfileCompletenessCard({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const { user } = useAuth();
  const { settings } = useCompanySettings();

  const isAdmin = user?.cargo_nome?.toUpperCase().includes("ADMIN") ?? false;

  const fields = useMemo<FieldCheck[]>(() => {
    const userFields: FieldCheck[] = [
      { label: "Nome completo", filled: !!user?.nome_completo, category: "usuario" },
      { label: "Email", filled: !!user?.email, category: "usuario" },
      { label: "Telefone", filled: !!user?.telefone, category: "usuario" },
      { label: "Foto de perfil", filled: !!user?.foto_url, category: "usuario" },
      { label: "Apelido", filled: !!user?.apelido, category: "usuario" },
    ];

    if (!isAdmin) return userFields;

    const storeFields: FieldCheck[] = [
      { label: "Nome da empresa", filled: !!settings.company_name && settings.company_name !== "OrçaMóvel PRO", category: "loja" },
      { label: "CNPJ", filled: !!settings.cnpj_loja, category: "loja" },
      { label: "Endereço", filled: !!settings.endereco_loja, category: "loja" },
      { label: "Cidade", filled: !!settings.cidade_loja, category: "loja" },
      { label: "UF", filled: !!settings.uf_loja, category: "loja" },
      { label: "CEP", filled: !!settings.cep_loja, category: "loja" },
      { label: "Telefone da loja", filled: !!settings.telefone_loja, category: "loja" },
      { label: "Email da loja", filled: !!settings.email_loja, category: "loja" },
      { label: "Logo", filled: !!settings.logo_url, category: "loja" },
    ];

    return [...userFields, ...storeFields];
  }, [user, settings, isAdmin]);

  const filledCount = fields.filter((f) => f.filled).length;
  const totalCount = fields.length;
  const percentage = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
  const missingFields = fields.filter((f) => !f.filled);

  if (percentage === 100) return null;

  const userMissing = missingFields.filter((f) => f.category === "usuario");
  const storeMissing = missingFields.filter((f) => f.category === "loja");

  return (
    <Card className="border-primary/20 bg-primary/5 mb-4">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {percentage >= 70 ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">
                Perfil {percentage}% completo
              </span>
              <span className="text-xs text-muted-foreground">
                {filledCount}/{totalCount} campos
              </span>
            </div>

            <Progress value={percentage} className="h-2 mb-2" />

            {missingFields.length > 0 && (
              <div className="space-y-1.5">
                {userMissing.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Seu perfil:</span>{" "}
                      {userMissing.map((f) => f.label).join(", ")}
                    </p>
                  </div>
                )}
                {storeMissing.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Dados da loja:</span>{" "}
                      {storeMissing.map((f) => f.label).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
