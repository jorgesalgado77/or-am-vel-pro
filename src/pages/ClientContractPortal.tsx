import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, CheckCircle, FileSignature, ShieldCheck, Loader2, ExternalLink } from "lucide-react";
import { ContractSignaturePad } from "@/components/contract/ContractSignaturePad";
import { ContractDocumentUpload } from "@/components/contract/ContractDocumentUpload";
import { buildContractDocumentHtml, openContractPrintWindow } from "@/lib/contractDocument";
import { EXTERNAL_SUPABASE_URL } from "@/lib/supabaseClient";
import { toast } from "sonner";

const FUNCTION_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/public-contract`;

interface ContractData {
  id: string;
  html: string;
  status: string;
  created_at: string;
  client_name: string;
  company_name: string;
}

export default function ClientContractPortal() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [documentoFile, setDocumentoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!token) { setError("Link inválido"); setLoading(false); return; }
    fetch(`${FUNCTION_URL}?action=get&token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setContract(data);
        if (data.status === "assinado") setSigned(true);
      })
      .catch(() => setError("Erro ao carregar contrato"))
      .finally(() => setLoading(false));
  }, [token]);

  const previewHtml = useMemo(
    () => contract ? buildContractDocumentHtml(contract.html, `Contrato - ${contract.client_name}`) : "",
    [contract],
  );

  const handlePrint = () => {
    if (!contract) return;
    openContractPrintWindow(contract.html, `Contrato - ${contract.client_name}`);
  };

  const handleDownloadPdf = () => {
    if (!contract) return;
    // Open print dialog which allows "Save as PDF"
    openContractPrintWindow(contract.html, `Contrato - ${contract.client_name}`);
    toast.info("Na janela de impressão, selecione 'Salvar como PDF'");
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmitSignature = async () => {
    if (!token || !signatureDataUrl) {
      toast.error("Por favor, assine o contrato antes de enviar");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        action: "sign",
        token,
        assinatura_base64: signatureDataUrl,
        assinado_via: "manual",
      };
      if (selfieFile) body.selfie_base64 = await fileToBase64(selfieFile);
      if (documentoFile) body.documento_base64 = await fileToBase64(documentoFile);

      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setSigned(true);
      toast.success("Contrato assinado com sucesso!");
    } catch {
      toast.error("Erro ao enviar assinatura");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGovBr = () => {
    window.open("https://assinador.iti.br/assinatura/index.xhtml", "_blank", "noopener");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-lg font-semibold text-destructive">{error || "Contrato não encontrado"}</p>
            <p className="text-sm text-muted-foreground">Verifique o link e tente novamente.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-emerald-500" />
            <h2 className="text-xl font-bold text-foreground">Contrato Assinado!</h2>
            <p className="text-sm text-muted-foreground">
              Sua assinatura foi registrada com sucesso. {contract.company_name && `A empresa ${contract.company_name} foi notificada.`}
            </p>
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir cópia
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-lg font-bold text-foreground">
            {contract.company_name || "Contrato"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Contrato de {contract.client_name}
          </p>
          <Badge variant="outline" className="mt-1">
            {contract.status === "enviado" ? "Aguardando assinatura" : contract.status}
          </Badge>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 mt-6 space-y-6">
        {/* Preview */}
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg">
            <iframe
              title="Preview do contrato"
              className="w-full h-[60vh] md:h-[70vh]"
              srcDoc={previewHtml}
            />
          </CardContent>
        </Card>

        {/* Actions: Print / PDF */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handlePrint} className="gap-2 flex-1">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} className="gap-2 flex-1">
            <Download className="h-4 w-4" /> Salvar PDF
          </Button>
        </div>

        {/* Signature Section */}
        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Assinatura Digital</h2>
            </div>

            <ContractSignaturePad
              onSignatureReady={setSignatureDataUrl}
              disabled={submitting}
            />

            {signatureDataUrl && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Assinatura capturada
              </p>
            )}
          </CardContent>
        </Card>

        {/* Document Uploads */}
        <Card>
          <CardContent className="p-5 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Validação de Identidade</h2>

            <ContractDocumentUpload
              label="Selfie"
              description="Tire uma selfie segurando o documento de identidade"
              onFileReady={setSelfieFile}
              disabled={submitting}
            />

            <ContractDocumentUpload
              label="Documento de Identidade"
              description="Fotografe a frente do seu RG ou CNH"
              onFileReady={setDocumentoFile}
              disabled={submitting}
            />
          </CardContent>
        </Card>

        {/* Gov.br option */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Assinatura Gov.br</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Você também pode assinar usando sua conta Gov.br para validação oficial.
            </p>
            <Button variant="outline" onClick={handleGovBr} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Assinar via Gov.br
            </Button>
          </CardContent>
        </Card>

        {/* Submit button */}
        <Button
          className="w-full gap-2 h-12 text-base"
          onClick={handleSubmitSignature}
          disabled={!signatureDataUrl || submitting}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
          {submitting ? "Enviando..." : "Confirmar e Enviar Assinatura"}
        </Button>
      </div>
    </div>
  );
}
