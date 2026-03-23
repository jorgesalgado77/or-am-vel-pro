import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSignature, RotateCcw, Download, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/financing";

interface DealRoomSignatureProps {
  tenantId: string;
  sessionId: string;
  clientName?: string;
  proposalValue?: number;
}

export function DealRoomSignature({ tenantId, sessionId, clientName, proposalValue }: DealRoomSignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [saved, setSaved] = useState(false);
  const [contractFields, setContractFields] = useState({
    cpf: "",
    rg: "",
    endereco: "",
  });

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasSigned(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  // Touch support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasSigned(true);
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.beginPath();
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    ctx.stroke();
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSigned) {
      toast.error("Por favor, assine antes de salvar");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    const blob = await fetch(dataUrl).then(r => r.blob());
    const filePath = `${tenantId}/signatures/${sessionId}-${Date.now()}.png`;

    const { error } = await supabase.storage
      .from("dealroom-attachments")
      .upload(filePath, blob, { contentType: "image/png" });

    if (error) {
      toast.error("Erro ao salvar assinatura");
      return;
    }

    const { data: urlData } = supabase.storage
      .from("dealroom-attachments")
      .getPublicUrl(filePath);

    // Save signature reference
    await supabase.from("dealroom_attachments" as any).insert({
      session_id: sessionId,
      tenant_id: tenantId,
      file_name: "assinatura-digital.png",
      file_url: urlData.publicUrl,
      file_type: "image/png",
      file_size: blob.size,
      sender: "cliente",
    });

    setSaved(true);
    toast.success("Assinatura salva com sucesso!");
  };

  if (saved) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
          <h4 className="font-semibold text-foreground">Contrato Assinado!</h4>
          <p className="text-sm text-muted-foreground">
            A assinatura digital foi salva com sucesso.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileSignature className="h-4 w-4 text-primary" /> Assinatura Digital
      </h4>

      {/* Contract summary */}
      <Card>
        <CardContent className="p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Resumo do contrato</p>
          <p className="text-sm font-medium text-foreground">
            Cliente: {clientName || "—"}
          </p>
          <p className="text-sm font-medium text-foreground">
            Valor: {formatCurrency(proposalValue || 0)}
          </p>
        </CardContent>
      </Card>

      {/* Contract fields */}
      <div className="space-y-2">
        <div>
          <Label className="text-xs">CPF</Label>
          <Input className="h-8 text-sm" placeholder="000.000.000-00"
            value={contractFields.cpf}
            onChange={e => setContractFields(p => ({ ...p, cpf: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">RG</Label>
          <Input className="h-8 text-sm" placeholder="00.000.000-0"
            value={contractFields.rg}
            onChange={e => setContractFields(p => ({ ...p, rg: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Endereço</Label>
          <Input className="h-8 text-sm" placeholder="Endereço completo"
            value={contractFields.endereco}
            onChange={e => setContractFields(p => ({ ...p, endereco: e.target.value }))} />
        </div>
      </div>

      {/* Signature canvas */}
      <div className="space-y-2">
        <Label className="text-xs">Assine abaixo</Label>
        <div className="border rounded-lg bg-background p-1">
          <canvas
            ref={canvasRef}
            width={320}
            height={150}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={stopDraw}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={clearCanvas}>
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
          </Button>
          <Button size="sm" className="gap-1 flex-1" onClick={saveSignature} disabled={!hasSigned}>
            <Download className="h-3.5 w-3.5" /> Salvar Assinatura
          </Button>
        </div>
      </div>
    </div>
  );
}
