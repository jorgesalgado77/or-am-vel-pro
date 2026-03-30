import React from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface SimulatorClientPickerProps {
  clientSearch: string;
  setClientSearch: (v: string) => void;
  searchingClients: boolean;
  clientResults: Client[];
  onLinkClient: (client: Client) => void;
}

export const SimulatorClientPicker = React.memo(function SimulatorClientPicker({
  clientSearch, setClientSearch, searchingClients, clientResults, onLinkClient,
}: SimulatorClientPickerProps) {
  return (
    <Card className="border-dashed border-primary/30 bg-primary/5">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <UserPlus className="h-4 w-4 text-primary" />
          Vincular Cliente Existente
        </div>
        <p className="text-xs text-muted-foreground">
          Vincule um cliente para habilitar a geração de PDF e o fechamento de venda.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Buscar por nome do cliente..."
            className="pl-9"
          />
        </div>
        {searchingClients && (
          <p className="text-xs text-muted-foreground">Buscando...</p>
        )}
        {clientResults.length > 0 && (
          <div className="border rounded-md divide-y max-h-40 overflow-y-auto bg-background">
            {clientResults.map((c) => (
              <button
                key={c.id}
                className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm"
                onClick={() => {
                  onLinkClient(c);
                  toast.success(`Cliente "${c.nome}" vinculado ao simulador`);
                }}
              >
                <span className="font-medium">{c.nome}</span>
                {c.email && <span className="text-xs text-muted-foreground ml-2">{c.email}</span>}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

interface LinkedClientBadgeProps {
  client: Client;
  onUnlink: () => void;
}

export const LinkedClientBadge = React.memo(function LinkedClientBadge({ client, onUnlink }: LinkedClientBadgeProps) {
  return (
    <div className="flex items-center gap-2 text-sm bg-primary/10 rounded-lg px-3 py-2">
      <UserPlus className="h-4 w-4 text-primary" />
      <span className="font-medium">{client.nome}</span>
      <Badge variant="secondary" className="text-[10px]">vinculado</Badge>
      <button onClick={onUnlink} className="ml-auto text-muted-foreground hover:text-destructive">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});
