import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Handshake, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { SimulatorPanel } from "@/components/SimulatorPanel";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface Props {
  trackingId: string;
  clientName: string;
  tenantId: string | null;
  userId?: string;
  onProposalSent?: (url: string | null) => void;
}

export function CloseDealButton({ trackingId, clientName, tenantId, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    if (!open || !trackingId) return;

    // Fetch client data from tracking
    const loadClient = async () => {
      const { data: tracking } = await supabase
        .from("client_tracking")
        .select("client_id")
        .eq("id", trackingId)
        .maybeSingle();

      if (tracking?.client_id) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("*")
          .eq("id", tracking.client_id)
          .maybeSingle();

        if (clientData) setClient(clientData);
      }
    };

    loadClient();
  }, [open, trackingId]);

  return (
    <>
      <Button
        variant="default"
        size="sm"
        className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={() => setOpen(true)}
      >
        <Handshake className="h-3.5 w-3.5" />
        Fechar Pedido
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-border bg-card">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" />
              Fechar Pedido — {clientName}
            </h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-4">
            <SimulatorPanel
              client={client}
              onBack={() => setOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
