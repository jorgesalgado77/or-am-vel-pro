import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Clock, Loader2, History, MapPin, RefreshCw, Navigation, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabaseClient";
import { useGoogleMapsKey, calculateRoundTripKm } from "@/hooks/useGoogleMapsKey";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export interface MeasurementScheduleData {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  observations: string;
  rescheduleReason?: string;
  roundTripKm?: number | null;
}

export interface ScheduleHistoryEntry {
  id: string;
  date: string;
  time: string;
  observations: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

interface Props {
  open: boolean;
  clientName: string;
  clientId?: string;
  tenantId?: string;
  isReschedule?: boolean;
  clientAddress?: string | null;
  technicianAddress?: string | null;
  onConfirm: (data: MeasurementScheduleData) => Promise<void>;
  onCancel: () => void;
}

/** Build a single-line address from parts */
function buildAddress(parts: (string | null | undefined)[]): string | null {
  const cleaned = parts.filter(Boolean).join(", ");
  return cleaned || null;
}

export function MeasurementScheduleDialog({ open, clientName, clientId, tenantId, isReschedule, clientAddress: clientAddressProp, technicianAddress: technicianAddressProp, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [observations, setObservations] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [kmResult, setKmResult] = useState<{ km: number; duration: string } | null>(null);
  const [kmLoading, setKmLoading] = useState(false);
  const [kmError, setKmError] = useState<string | null>(null);

  // Resolved addresses (from props or fetched from DB)
  const [resolvedClientAddr, setResolvedClientAddr] = useState<string | null>(null);
  const [resolvedTechAddr, setResolvedTechAddr] = useState<string | null>(null);
  const [addrLoading, setAddrLoading] = useState(false);

  const { currentUser } = useCurrentUser();
  const { googleMapsKey } = useGoogleMapsKey(tenantId || null);

  // Fetch addresses from DB when dialog opens
  useEffect(() => {
    if (!open) return;

    // Technician address: try prop first, then currentUser context, then fetch from DB
    if (technicianAddressProp) {
      setResolvedTechAddr(technicianAddressProp);
    } else {
      // Try from currentUser context first
      const fromCtx = (() => {
        if (!currentUser) return null;
        const u = currentUser;
        if (!u.endereco && !u.cidade) return null;
        return buildAddress([u.endereco, u.numero, u.complemento, u.bairro, u.cidade, u.uf, u.cep]);
      })();

      if (fromCtx) {
        setResolvedTechAddr(fromCtx);
      } else if (currentUser?.id) {
        // Fetch directly from DB as fallback (RPC may not return address fields)
        (async () => {
          try {
            const { data } = await (supabase as any)
              .from("usuarios")
              .select("cep, endereco, numero, complemento, bairro, cidade, uf")
              .eq("id", currentUser.id)
              .single();
            if (data) {
              const addr = buildAddress([data.endereco, data.numero, data.complemento, data.bairro, data.cidade, data.uf, data.cep]);
              setResolvedTechAddr(addr);
            }
          } catch (e) {
            console.warn("[MeasurementSchedule] Failed to fetch tech address:", e);
          }
        })();
      }
    }

    // Client address
    if (clientAddressProp) {
      setResolvedClientAddr(clientAddressProp);
      return;
    }

    if (!clientId || !tenantId) {
      setResolvedClientAddr(null);
      return;
    }

    // Fetch client address from measurement_requests.delivery_address or contract HTML
    setAddrLoading(true);
    (async () => {
      try {
        const { data: mrData } = await (supabase as any)
          .from("measurement_requests")
          .select("delivery_address, client_snapshot, created_at")
          .eq("client_id", clientId)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1);

        const mr = Array.isArray(mrData) ? mrData[0] : mrData;
        const deliveryAddress = mr?.delivery_address || {};
        const snapshot = mr?.client_snapshot || {};

        const addrFromRequest = buildAddress([
          deliveryAddress.street || snapshot.delivery_address_street || snapshot.endereco_entrega || snapshot.endereco,
          deliveryAddress.number || snapshot.delivery_address_number || snapshot.numero_entrega || snapshot.numero,
          deliveryAddress.complement || snapshot.delivery_address_complement || snapshot.complemento_entrega || snapshot.complemento,
          deliveryAddress.district || snapshot.delivery_address_district || snapshot.bairro_entrega || snapshot.bairro,
          deliveryAddress.city || snapshot.delivery_address_city || snapshot.cidade_entrega || snapshot.cidade,
          deliveryAddress.state || snapshot.delivery_address_state || snapshot.uf_entrega || snapshot.estado || snapshot.uf,
          deliveryAddress.cep || snapshot.delivery_address_zip || snapshot.cep_entrega || snapshot.cep,
        ]);

        if (addrFromRequest) {
          setResolvedClientAddr(addrFromRequest);
          setAddrLoading(false);
          return;
        }

        const { data: contractData } = await (supabase as any)
          .from("client_contracts")
          .select("conteudo_html, snapshot")
          .eq("client_id", clientId)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1);

        const contract = Array.isArray(contractData) ? contractData[0] : contractData;
        const contractSnapshot = contract?.snapshot || {};
        const addrFromSnapshot = buildAddress([
          contractSnapshot.delivery_address_street || contractSnapshot.endereco_entrega || contractSnapshot.endereco,
          contractSnapshot.delivery_address_number || contractSnapshot.numero_entrega || contractSnapshot.numero,
          contractSnapshot.delivery_address_complement || contractSnapshot.complemento_entrega || contractSnapshot.complemento,
          contractSnapshot.delivery_address_district || contractSnapshot.bairro_entrega || contractSnapshot.bairro,
          contractSnapshot.delivery_address_city || contractSnapshot.cidade_entrega || contractSnapshot.cidade,
          contractSnapshot.delivery_address_state || contractSnapshot.uf_entrega || contractSnapshot.estado || contractSnapshot.uf,
          contractSnapshot.delivery_address_zip || contractSnapshot.cep_entrega || contractSnapshot.cep,
        ]);

        if (addrFromSnapshot) {
          setResolvedClientAddr(addrFromSnapshot);
          setAddrLoading(false);
          return;
        }

        const html = String(contract?.conteudo_html || "");
        const match = html.match(/<strong>Endereço de entrega:\/strong>\s*([^<]+)\.?/i) || html.match(/<strong>Endereço:<\/strong>\s*([^<]+)\.?/i);
        setResolvedClientAddr(match?.[1]?.trim() || null);
      } catch (err) {
        console.warn("[MeasurementSchedule] Failed to fetch client address:", err);
        setResolvedClientAddr(null);
      } finally {
        setAddrLoading(false);
      }
    })();
  }, [open, clientId, tenantId, clientAddressProp, technicianAddressProp, currentUser]);

  // Fetch schedule history
  useEffect(() => {
    if (!open || !clientId || !tenantId) { setHistory([]); return; }
    (async () => {
      const { data } = await supabase
        .from("measurement_schedule_history" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      setHistory((data as any[] || []) as ScheduleHistoryEntry[]);
    })();
  }, [open, clientId, tenantId]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setDate(undefined);
      setTime("09:00");
      setObservations("");
      setRescheduleReason("");
      setShowHistory(false);
      setKmResult(null);
      setKmError(null);
    }
  }, [open]);

  // Calculate KM when addresses are resolved
  useEffect(() => {
    if (!open || !googleMapsKey || addrLoading) return;

    if (!resolvedClientAddr || !resolvedTechAddr) {
      if (!addrLoading) {
        const missing: string[] = [];
        if (!resolvedClientAddr) missing.push("cliente");
        if (!resolvedTechAddr) missing.push("técnico");
        setKmError(`Endereço do ${missing.join(" e ")} não cadastrado`);
      }
      return;
    }

    setKmLoading(true);
    setKmError(null);
    calculateRoundTripKm(googleMapsKey, resolvedTechAddr, resolvedClientAddr)
      .then(result => {
        if (result) {
          setKmResult(result);
        } else {
          setKmError("Não foi possível calcular a distância");
        }
      })
      .finally(() => setKmLoading(false));
  }, [open, googleMapsKey, resolvedClientAddr, resolvedTechAddr, addrLoading]);

  const hasHistory = history.length > 0;
  const effectiveIsReschedule = isReschedule || hasHistory;

  const handleConfirm = async () => {
    if (!date) return;
    if (effectiveIsReschedule && !rescheduleReason.trim()) return;
    setSaving(true);
    try {
      await onConfirm({
        date: format(date, "yyyy-MM-dd"),
        time,
        observations,
        rescheduleReason: effectiveIsReschedule ? rescheduleReason.trim() : undefined,
        roundTripKm: kmResult?.km || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md gap-0 overflow-hidden p-0 sm:w-full">
        <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
            <DialogTitle className="flex items-center gap-2 pr-8 text-base sm:text-lg">
              {effectiveIsReschedule ? <><RefreshCw className="h-5 w-5" /> Reagendar Medição</> : <>📐 Agendar Medição</>}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cliente: <span className="font-semibold text-foreground break-words">{clientName}</span>
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="space-y-4 pb-1">
              <div className="rounded-lg border p-3 space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-start gap-1.5">
                    <Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-xs font-semibold leading-relaxed">Endereço de Entrega — Cliente</span>
                  </div>
                  <p className="break-words pl-5 text-xs text-muted-foreground">
                    {addrLoading ? (
                      <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Buscando endereço...</span>
                    ) : resolvedClientAddr ? (
                      resolvedClientAddr
                    ) : (
                      <span className="italic">Endereço não cadastrado</span>
                    )}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-start gap-1.5">
                    <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="text-xs font-semibold leading-relaxed">Base — Ponto de Partida</span>
                  </div>
                  <p className="break-words pl-5 text-xs text-muted-foreground">
                    {resolvedTechAddr || <span className="italic">Endereço não cadastrado</span>}
                  </p>
                </div>

                <div className="border-t pt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-semibold">Distância (ida e volta)</span>
                  </div>
                  {kmLoading || addrLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando distância...
                    </div>
                  ) : kmResult ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <Badge className="w-fit border-primary/30 bg-primary/15 text-sm font-bold text-primary" variant="outline">
                        🚗 {kmResult.km} km
                      </Badge>
                      <span className="text-xs text-muted-foreground">Tempo estimado (ida): {kmResult.duration}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground break-words">
                      {kmError || (!googleMapsKey ? "Google Maps API não configurada. Configure em Configurações > APIs." : "Aguardando...")}
                    </p>
                  )}
                </div>
              </div>

              {effectiveIsReschedule && (
                <div className="space-y-2">
                  <Label className="text-destructive">Motivo do Reagendamento *</Label>
                  <Textarea
                    placeholder="Descreva o motivo do reagendamento..."
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    rows={2}
                    className="border-destructive/30 focus-visible:ring-destructive/30"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Data da Medição *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-auto min-h-11 w-full justify-start py-3 text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("pointer-events-auto p-3")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Horário *</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-12 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Informações adicionais sobre a medição..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={4}
                  className="min-h-[112px] resize-none"
                />
              </div>

              {hasHistory && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-0 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    <History className="h-3.5 w-3.5" />
                    Histórico ({history.length} agendamento{history.length > 1 ? "s" : ""})
                  </Button>
                  {showHistory && (
                    <ScrollArea className="max-h-40">
                      <div className="space-y-2">
                        {history.map((h, i) => (
                          <div key={h.id || i} className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium break-words">
                                {h.date} às {h.time}
                              </span>
                              {i === 0 && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Último</Badge>}
                            </div>
                            {h.reason && (
                              <p className="text-destructive/80 break-words">
                                <span className="font-medium">Motivo:</span> {h.reason}
                              </p>
                            )}
                            {h.observations && <p className="text-muted-foreground break-words">{h.observations}</p>}
                            <p className="text-muted-foreground/60 break-words">
                              por {h.created_by} em {h.created_at ? format(new Date(h.created_at), "dd/MM/yy HH:mm") : "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={onCancel} disabled={saving} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!date || saving || (effectiveIsReschedule && !rescheduleReason.trim())}
              className="w-full sm:w-auto"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {effectiveIsReschedule ? "Confirmar Reagendamento" : "Confirmar Agendamento"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
