import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Check } from "lucide-react";

interface ContractDocumentUploadProps {
  label: string;
  description: string;
  onFileReady: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  previewUrl?: string;
}

export function ContractDocumentUpload({
  label,
  description,
  onFileReady,
  accept = "image/*",
  disabled,
  previewUrl,
}: ContractDocumentUploadProps) {
  const [preview, setPreview] = useState<string | null>(previewUrl || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    onFileReady(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleCamera = () => {
    if (!inputRef.current) return;
    inputRef.current.setAttribute("capture", "environment");
    inputRef.current.click();
  };

  const handleUpload = () => {
    if (!inputRef.current) return;
    inputRef.current.removeAttribute("capture");
    inputRef.current.click();
  };

  const handleClear = () => {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />

      {preview ? (
        <div className="relative">
          <img src={preview} alt={label} className="w-full max-h-48 object-contain rounded-lg border" />
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 flex-1" disabled={disabled}>
              <X className="h-3.5 w-3.5" /> Remover
            </Button>
            <div className="flex items-center gap-1.5 text-sm text-green-600 flex-1 justify-center">
              <Check className="h-3.5 w-3.5" /> Enviado
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCamera} disabled={disabled} className="gap-1.5 flex-1">
            <Camera className="h-3.5 w-3.5" /> Câmera
          </Button>
          <Button variant="outline" size="sm" onClick={handleUpload} disabled={disabled} className="gap-1.5 flex-1">
            <Upload className="h-3.5 w-3.5" /> Arquivo
          </Button>
        </div>
      )}
    </div>
  );
}
