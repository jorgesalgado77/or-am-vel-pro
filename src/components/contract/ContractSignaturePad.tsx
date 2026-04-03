import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check } from "lucide-react";

interface ContractSignaturePadProps {
  onSignatureReady: (dataUrl: string) => void;
  disabled?: boolean;
}

export function ContractSignaturePad({ onSignatureReady, disabled }: ContractSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;
  const getRect = () => canvasRef.current?.getBoundingClientRect();

  const startDraw = useCallback((x: number, y: number) => {
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    setHasSigned(true);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((x: number, y: number) => {
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing]);

  const stopDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = getRect();
    if (!rect) return;
    startDraw(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = getRect();
    if (!rect) return;
    draw(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = getRect();
    if (!rect) return;
    const t = e.touches[0];
    startDraw(t.clientX - rect.left, t.clientY - rect.top);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = getRect();
    if (!rect) return;
    const t = e.touches[0];
    draw(t.clientX - rect.left, t.clientY - rect.top);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const confirmSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSigned) return;
    onSignatureReady(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Assine no campo abaixo</p>
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg bg-white p-1">
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          className="w-full cursor-crosshair touch-none rounded"
          style={{ background: "#fff" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={stopDraw}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clearCanvas} className="gap-1.5 flex-1" disabled={disabled}>
          <RotateCcw className="h-3.5 w-3.5" /> Limpar
        </Button>
        <Button size="sm" onClick={confirmSignature} disabled={!hasSigned || disabled} className="gap-1.5 flex-1">
          <Check className="h-3.5 w-3.5" /> Confirmar Assinatura
        </Button>
      </div>
    </div>
  );
}
