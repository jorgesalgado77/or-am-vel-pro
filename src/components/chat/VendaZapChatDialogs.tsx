/**
 * VendaZapChatDialogs — Alert dialogs and modals extracted from VendaZapChat.
 */
import React from "react";
import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CloseSaleModal } from "@/components/CloseSaleModal";
import type { ChatConversation } from "./types";
import type { CloseSaleData } from "./AICloserBanner";
import type { ComponentProps } from "react";

interface VendaZapChatDialogsProps {
  // Lead creation
  pendingLeadConv: ChatConversation | null;
  setPendingLeadConv: (v: ChatConversation | null) => void;
  onCreateLead: () => void;
  // Delete conversation
  deleteTarget: ChatConversation | null;
  setDeleteTarget: (v: ChatConversation | null) => void;
  confirmDelete: () => void;
  deleting: boolean;
  // Close sale
  closeSaleOpen: boolean;
  setCloseSaleOpen: (v: boolean) => void;
  closeSaleClient: ComponentProps<typeof CloseSaleModal>["client"];
  closeSaleSimData: CloseSaleData | undefined;
  closeSaleSaving: boolean;
  onCloseSaleConfirm: (formData: any, items: any[], itemDetails: any[]) => void;
}

export const VendaZapChatDialogs = React.memo(function VendaZapChatDialogs(props: VendaZapChatDialogsProps) {
  return (
    <>
      {/* Lead Creation Confirmation Dialog */}
      <AlertDialog open={!!props.pendingLeadConv} onOpenChange={(open) => !open && props.setPendingLeadConv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar novo lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja criar um novo lead para <strong>{props.pendingLeadConv?.nome_cliente}</strong>?
              {props.pendingLeadConv?.phone && <> (Tel: {props.pendingLeadConv.phone})</>}
              <br />
              O lead será adicionado na coluna <strong>&quot;Novo&quot;</strong> com origem <strong>&quot;CHAT DE VENDAS&quot;</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={props.onCreateLead}>Criar Lead</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Conversation Confirmation Dialog */}
      <AlertDialog open={!!props.deleteTarget} onOpenChange={(open) => !open && props.setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir conversa permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Tem certeza que deseja excluir a conversa com <strong className="text-foreground">{props.deleteTarget?.nome_cliente}</strong>?
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-medium text-destructive">⚠️ Esta ação é irreversível:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                    <li>Todas as mensagens serão apagadas</li>
                    <li>O registro de acompanhamento será removido</li>
                    <li>Não será possível recuperar o histórico</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={props.confirmDelete}
              disabled={props.deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {props.deleting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Excluindo...</>
              ) : (
                "Excluir permanentemente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close Sale Modal — triggered by AI Closer Banner */}
      <CloseSaleModal
        open={props.closeSaleOpen}
        onClose={() => props.setCloseSaleOpen(false)}
        onConfirm={props.onCloseSaleConfirm as any}
        client={props.closeSaleClient}
        simulationData={props.closeSaleSimData}
        saving={props.closeSaleSaving}
      />
    </>
  );
});
