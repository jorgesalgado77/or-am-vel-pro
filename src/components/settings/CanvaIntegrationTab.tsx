import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";
import { Palette, ExternalLink, CheckCircle2, XCircle, Image, Download, RefreshCw } from "lucide-react";

interface CanvaDesign {
  id: string;
  title: string;
  thumbnail_url: string;
  export_url?: string;
  created_at: string;
}

export function CanvaIntegrationTab() {
  const tenantId = getTenantId();
  const [canvaEnabled, setCanvaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);

  useEffect(() => {
    const checkCanva = async () => {
      // Check if admin enabled Canva globally
      const { data } = await supabase
        .from("admin_canva_settings" as any)
        .select("ativo")
        .limit(1)
        .maybeSingle();
      setCanvaEnabled((data as any)?.ativo || false);
      setLoading(false);
    };
    checkCanva();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;

  if (!canvaEnabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Palette className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold mb-2">Canva Não Disponível</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            A integração com o Canva ainda não foi habilitada pelo administrador do sistema.
            Entre em contato com o suporte para solicitar a ativação.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" /> Integração com Canva
            </CardTitle>
            <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" />Disponível</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium">Como usar o Canva na Biblioteca de Campanhas</h4>
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">1</span>
                <span>Acesse o <a href="https://www.canva.com" target="_blank" rel="noopener" className="text-primary underline">Canva</a> e crie seus designs de campanha</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">2</span>
                <span>Use os templates recomendados: <strong>1080x1080</strong> (Feed), <strong>1080x1920</strong> (Stories), <strong>1200x628</strong> (Facebook Ads)</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">3</span>
                <span>Exporte como PNG e use no <strong>Gerador de Imagens</strong> da Biblioteca de Campanhas</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">4</span>
                <span>Em breve: importação direta de designs do Canva para a biblioteca!</span>
              </li>
            </ol>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-3">Templates Recomendados do Canva</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "Post Instagram/Facebook", size: "1080×1080", link: "https://www.canva.com/design/create?type=TABNpm0yWwE" },
                { name: "Stories/Reels", size: "1080×1920", link: "https://www.canva.com/design/create?type=TABNqFORQCA" },
                { name: "Banner Facebook Ads", size: "1200×628", link: "https://www.canva.com/design/create?type=TAB_cGia2Lg" },
              ].map(t => (
                <a key={t.name} href={t.link} target="_blank" rel="noopener"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group">
                  <Image className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="text-sm font-medium text-center">{t.name}</p>
                  <Badge variant="outline" className="text-[10px]">{t.size}</Badge>
                  <span className="text-[10px] text-primary flex items-center gap-1">Criar no Canva <ExternalLink className="h-2.5 w-2.5" /></span>
                </a>
              ))}
            </div>
          </div>

          <div className="bg-primary/5 rounded-lg p-4 text-center">
            <Palette className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Importação Direta em Breve</p>
            <p className="text-xs text-muted-foreground mt-1">
              Em breve você poderá importar designs diretamente do Canva sem sair do sistema. Aguarde atualizações!
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
