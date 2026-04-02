import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock } from "lucide-react";
import { UpgradePlanDialog } from "@/components/shared/UpgradePlanDialog";
import { LoadSimulationModal } from "@/components/simulator/LoadSimulationModal";
import { ContractEditorDialog } from "@/components/ContractEditorDialog";
import { CloseSaleModal } from "@/components/CloseSaleModal";
import { ProductPickerForSimulator } from "@/components/simulator/ProductPickerForSimulator";
import type { ImportedEnvironment } from "@/components/simulator/SimulatorEnvironmentsTable";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface SimulatorDialogsProps {
  // Password dialog
  passwordDialogOpen: boolean;
  setPasswordDialogOpen: (v: boolean) => void;
  passwordDialogTitle: string;
  passwordInput: string;
  setPasswordInput: (v: string) => void;
  onPasswordConfirm: () => void;
  // Close sale modal
  closeSaleModalOpen: boolean;
  setCloseSaleModalOpen: (v: boolean) => void;
  onCloseSaleConfirm: (formData: any, items: any[], itemDetails: any[]) => void;
  client: Client | null;
  closingSale: boolean;
  simulationData: {
    valorFinal: number;
    valorEntrada: number;
    parcelas: number;
    valorParcela: number;
    formaPagamento: string;
    vendedor: string;
    numeroOrcamento: string;
    ambientes: any[];
  };
  // Contract editor
  contractEditorOpen: boolean;
  setContractEditorOpen: (v: boolean) => void;
  contractHtml: string;
  onContractConfirm: (html: string) => Promise<void>;
  pendingSimId: string | null;
  setPendingSimId: (v: string | null) => void;
  pendingTemplateId: string | null;
  setPendingTemplateId: (v: string | null) => void;
  // Upgrade
  upgradeOpen: boolean;
  setUpgradeOpen: (v: boolean) => void;
  upgradeMsg: string;
  // Load simulation
  loadSimModalOpen: boolean;
  setLoadSimModalOpen: (v: boolean) => void;
  onLoadSimulation: (sim: any) => void;
  // Product picker
  productPickerOpen: boolean;
  setProductPickerOpen: (v: boolean) => void;
  onProductPickerConfirm: (items: any[], total: number) => void;
  resolvedTenantId: string | null;
}

export const SimulatorDialogs = React.memo(function SimulatorDialogs(props: SimulatorDialogsProps) {
  return (
    <>
      <Dialog open={props.passwordDialogOpen} onOpenChange={(open) => {
        if (!open) props.setPasswordInput("");
        props.setPasswordDialogOpen(open);
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />{props.passwordDialogTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); props.onPasswordConfirm(); }} autoComplete="off" data-form-type="other" data-lpignore="true">
            <div>
              <Label>Informe a senha para desbloquear</Label>
              <Input
                type="password"
                value={props.passwordInput}
                onChange={(e) => props.setPasswordInput(e.target.value)}
                className="mt-1"
                placeholder="Senha"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-protonpass-ignore="true"
                data-form-type="other"
                name={`unlock-${Date.now()}`}
                id={`unlock-${Date.now()}`}
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => { props.setPasswordInput(""); props.setPasswordDialogOpen(false); }}>Cancelar</Button>
              <Button type="submit">Confirmar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CloseSaleModal
        open={props.closeSaleModalOpen}
        onClose={() => props.setCloseSaleModalOpen(false)}
        onConfirm={props.onCloseSaleConfirm}
        client={props.client}
        simulationData={props.simulationData}
        saving={props.closingSale}
      />

      {props.client && (
        <ContractEditorDialog
          open={props.contractEditorOpen}
          onClose={() => { props.setContractEditorOpen(false); props.setPendingSimId(null); props.setPendingTemplateId(null); }}
          initialHtml={props.contractHtml}
          clientName={props.client.nome}
          onConfirm={props.onContractConfirm}
          saving={props.closingSale}
        />
      )}

      <UpgradePlanDialog open={props.upgradeOpen} onOpenChange={props.setUpgradeOpen} message={props.upgradeMsg} />

      <LoadSimulationModal
        open={props.loadSimModalOpen}
        onClose={() => props.setLoadSimModalOpen(false)}
        onSelect={props.onLoadSimulation}
      />

      <ProductPickerForSimulator
        tenantId={props.resolvedTenantId}
        open={props.productPickerOpen}
        onOpenChange={props.setProductPickerOpen}
        onConfirm={props.onProductPickerConfirm}
      />
    </>
  );
});
