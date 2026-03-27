import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import {
  Smartphone, Plus, QrCode, Wifi, WifiOff, Trash2, RefreshCw, Loader2, Unplug
} from "lucide-react";

interface Props {
  tenantId: string | null;
}

export function WhatsAppInstanceManager({ tenantId }: Props) {
  const {
    instances, loading, actionLoading,
    createInstance, connectInstance, checkStatus, disconnectInstance, deleteInstance,
  } = useWhatsAppInstances(tenantId);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [qrCodeDialog, setQrCodeDialog] = useState<{ name: string; qr: string } | null>(null);

  const handleCreate = async () => {
    const ok = await createInstance(newInstanceName);
    if (ok) {
      setShowCreateDialog(false);
      setNewInstanceName("");
    }
  };

  const handleConnect = async (name: string) => {
    const qr = await connectInstance(name);
    if (qr) {
      setQrCodeDialog({ name, qr });
    }
  };

  const handleRefreshQR = async (name: string) => {
    const qr = await connectInstance(name);
    if (qr) {
      setQrCodeDialog({ name, qr });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-4">Carregando instâncias...</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Instâncias WhatsApp
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Instância
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Gerencie suas conexões WhatsApp via Evolution API. Cada instância representa um número conectado.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {instances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <QrCode className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma instância criada</p>
              <p className="text-xs mt-1">Crie uma instância e escaneie o QR Code para conectar seu WhatsApp</p>
            </div>
          ) : (
            instances.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                    inst.connected ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
                  }`}>
                    {inst.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{inst.instance_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant={inst.connected ? "default" : inst.status === "connecting" ? "outline" : "secondary"}
                        className={`text-[10px] h-4 px-1.5 ${inst.connected ? "bg-green-600 text-white" : ""}`}
                      >
                        {inst.connected ? "Conectado" : inst.status === "connecting" ? "Aguardando QR" : "Desconectado"}
                      </Badge>
                      {inst.phone_number && (
                        <span className="text-[10px] text-muted-foreground">{inst.phone_number}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!inst.connected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs h-7"
                      disabled={actionLoading === inst.instance_name}
                      onClick={() => handleConnect(inst.instance_name)}
                    >
                      {actionLoading === inst.instance_name ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <QrCode className="h-3 w-3" />
                      )}
                      QR Code
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!!actionLoading}
                    onClick={() => checkStatus(inst.instance_name)}
                    title="Verificar status"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {inst.connected && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-amber-500 hover:text-amber-600"
                      disabled={!!actionLoading}
                      onClick={() => disconnectInstance(inst.instance_name)}
                      title="Desconectar"
                    >
                      <Unplug className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={!!actionLoading}
                    onClick={() => deleteInstance(inst.instance_name)}
                    title="Excluir instância"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Create Instance Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Nova Instância</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da Instância</Label>
              <Input
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                placeholder="minha-loja-principal"
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Apenas letras, números, hífens e underscores</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={!newInstanceName.trim() || actionLoading === "create"}
              className="gap-1.5"
            >
              {actionLoading === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrCodeDialog} onOpenChange={() => setQrCodeDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Conectar WhatsApp
            </DialogTitle>
          </DialogHeader>
          {qrCodeDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Abra o WhatsApp no seu celular → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> → Escaneie o código abaixo
              </p>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={qrCodeDialog.qr.startsWith("data:") ? qrCodeDialog.qr : `data:image/png;base64,${qrCodeDialog.qr}`}
                  alt="QR Code WhatsApp"
                  className="w-56 h-56 object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Instância: <strong>{qrCodeDialog.name}</strong>
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleRefreshQR(qrCodeDialog.name)}
                  disabled={!!actionLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Atualizar QR
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    const connected = await checkStatus(qrCodeDialog.name);
                    if (connected) setQrCodeDialog(null);
                  }}
                  disabled={!!actionLoading}
                >
                  <Wifi className="h-3.5 w-3.5" /> Verificar Conexão
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
