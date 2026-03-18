import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Eye, Printer, Pencil, ArrowLeft } from "lucide-react";
import { ContractEditorDialog } from "./ContractEditorDialog";
import { openContractPrintWindow } from "@/lib/contractDocument";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface ClientContract {
  id: string;
  conteudo_html: string;
  pdf_url: string | null;
  simulation_id: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ClientContractsProps {
  client: Client;
  onBack: () => void;
}

export function ClientContracts({ client, onBack }: ClientContractsProps) {
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContract, setEditingContract] = useState<ClientContract | null>(null);
  const [viewingContract, setViewingContract] = useState<ClientContract | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_contracts")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar contratos");
    else setContracts((data as ClientContract[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchContracts(); }, [client.id]);

  const handlePrint = (contract: ClientContract) => {
    openContractPrintWindow(contract.conteudo_html, `Contrato - ${client.nome}`);
  };

  const handleSaveEdit = async (finalHtml: string) => {
    if (!editingContract) return;
    setSaving(true);
    const { error } = await supabase
      .from("client_contracts")
      .update({ conteudo_html: finalHtml } as any)
      .eq("id", editingContract.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar contrato"); return; }
    toast.success("Contrato atualizado!");
    setEditingContract(null);
    fetchContracts();
    openContractPrintWindow(finalHtml, `Contrato - ${client.nome}`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div>
          <h3 className="text-sm text-muted-foreground">Contratos</h3>
          <p className="text-base font-semibold text-foreground">{client.nome}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {contracts.length} {contracts.length === 1 ? "contrato" : "contratos"} gerados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : contracts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum contrato gerado para este cliente</p>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <div
                  key={contract.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/30 transition-colors"
                >
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      Contrato de {format(new Date(contract.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {contract.simulation_id ? "Vinculado a simulação" : "Contrato avulso"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewingContract(contract)}
                      title="Visualizar"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingContract(contract)}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={() => handlePrint(contract)}
                      title="Imprimir PDF"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {viewingContract && (
        <ContractEditorDialog
          open={!!viewingContract}
          onClose={() => setViewingContract(null)}
          initialHtml={viewingContract.conteudo_html}
          clientName={client.nome}
          onConfirm={(html) => {
            openContractPrintWindow(html, `Contrato - ${client.nome}`);
            setViewingContract(null);
          }}
        />
      )}

      {editingContract && (
        <ContractEditorDialog
          open={!!editingContract}
          onClose={() => setEditingContract(null)}
          initialHtml={editingContract.conteudo_html}
          clientName={client.nome}
          onConfirm={handleSaveEdit}
          saving={saving}
        />
      )}
    </div>
  );
}
