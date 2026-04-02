import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { miaGenerateResponse } from "@/services/mia";
import { useTenant } from "@/contexts/TenantContext";

export function CampaignAIGenerator() {
  const [ambiente, setAmbiente] = useState("cozinha");
  const [plataforma, setPlataforma] = useState("instagram");
  const [objetivo, setObjetivo] = useState("captar leads");
  const [diferencial, setDiferencial] = useState("");
  const [tom, setTom] = useState("profissional");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ headline: string; copy: string; cta: string; hashtags: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          mensagem_cliente: `Crie uma campanha de anúncio para ${plataforma} sobre ${ambiente}. Objetivo: ${objetivo}. Tom: ${tom}. ${diferencial ? `Diferencial: ${diferencial}` : ""}`,
          nome_cliente: "Lojista",
          tipo_copy: "campanha_trafego",
          tom,
          status_negociacao: "novo",
          prompt_sistema: `Você é um especialista em marketing digital para lojas de móveis planejados. Crie uma campanha completa no formato JSON com os campos: headline, copy, cta, hashtags (array). A campanha deve ser para ${plataforma}, focada em ${ambiente}, com objetivo de ${objetivo}. Tom ${tom}. Retorne APENAS o JSON válido, sem markdown.`,
        },
      });

      if (error) throw error;

      const resposta = data?.resposta || "";
      try {
        // Try to parse JSON from the response
        const jsonMatch = resposta.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setResult({
            headline: parsed.headline || "Headline gerada",
            copy: parsed.copy || resposta,
            cta: parsed.cta || "Saiba Mais",
            hashtags: parsed.hashtags || [],
          });
        } else {
          setResult({
            headline: `Campanha ${ambiente} — ${plataforma}`,
            copy: resposta,
            cta: "Saiba Mais",
            hashtags: [],
          });
        }
      } catch {
        setResult({
          headline: `Campanha ${ambiente} — ${plataforma}`,
          copy: resposta,
          cta: "Saiba Mais",
          hashtags: [],
        });
      }
      toast.success("Campanha gerada com IA!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar campanha. Verifique se o VendaZap AI está configurado.");
    }
    setLoading(false);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copiado!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyFull = () => {
    if (!result) return;
    const full = `HEADLINE: ${result.headline}\n\nCOPY:\n${result.copy}\n\nCTA: ${result.cta}${result.hashtags.length ? `\n\nHASHTAGS: ${result.hashtags.join(" ")}` : ""}`;
    copyText(full, "Campanha completa");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Criar Campanha com IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Ambiente</Label>
            <Select value={ambiente} onValueChange={setAmbiente}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cozinha">Cozinha</SelectItem>
                <SelectItem value="quarto">Quarto</SelectItem>
                <SelectItem value="sala">Sala</SelectItem>
                <SelectItem value="banheiro">Banheiro</SelectItem>
                <SelectItem value="escritorio">Escritório</SelectItem>
                <SelectItem value="todos">Todos os Ambientes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Plataforma</Label>
            <Select value={plataforma} onValueChange={setPlataforma}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
                <SelectItem value="whatsapp">WhatsApp Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tom da Mensagem</Label>
            <Select value={tom} onValueChange={setTom}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="amigavel">Amigável</SelectItem>
                <SelectItem value="urgente">Urgente/Promoção</SelectItem>
                <SelectItem value="luxo">Luxo/Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Objetivo da Campanha</Label>
          <Input value={objetivo} onChange={e => setObjetivo(e.target.value)} placeholder="Ex: captar leads, vender promoção, remarketing..." className="mt-1 h-9" />
        </div>

        <div>
          <Label className="text-xs">Diferencial (opcional)</Label>
          <Textarea value={diferencial} onChange={e => setDiferencial(e.target.value)} placeholder="Ex: 20% de desconto, entrega grátis, promoção do mês..." className="mt-1 min-h-[60px]" />
        </div>

        <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando com IA...</> : <><Sparkles className="h-4 w-4" /> Gerar Campanha</>}
        </Button>

        {result && (
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Headline</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(result.headline, "Headline")}>
                  {copied === "Headline" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} Copiar
                </Button>
              </div>
              <p className="text-sm font-medium bg-muted/50 rounded-lg px-3 py-2">{result.headline}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Copy do Anúncio</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(result.copy, "Copy")}>
                  {copied === "Copy" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} Copiar
                </Button>
              </div>
              <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg px-3 py-2 font-sans leading-relaxed max-h-48 overflow-y-auto">{result.copy}</pre>
            </div>

            <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
              <span className="text-sm font-medium">CTA: <span className="text-primary">{result.cta}</span></span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyText(result.cta, "CTA")}>
                {copied === "CTA" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>

            {result.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.hashtags.map(h => (
                  <Badge key={h} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10" onClick={() => copyText(h, h)}>{h}</Badge>
                ))}
              </div>
            )}

            <Button onClick={copyFull} className="w-full gap-2" variant={copied === "Campanha completa" ? "secondary" : "default"}>
              {copied === "Campanha completa" ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar Campanha Completa</>}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
