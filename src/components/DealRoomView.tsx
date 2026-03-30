import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DealRoomStoreWidget } from "@/components/DealRoomStoreWidget";
import { DealRoomInterestForm } from "@/components/dealroom/DealRoomInterestForm";
import { useDealRoomAccess } from "@/hooks/useDealRoomAccess";

interface DealRoomViewProps {
  tenantId: string | null;
  onBack: () => void;
}

export function DealRoomView({ tenantId, onBack }: DealRoomViewProps) {
  const { access, loading } = useDealRoomAccess(tenantId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Verificando acesso...
      </div>
    );
  }

  if (!access?.allowed) {
    return <DealRoomInterestForm onBack={onBack} />;
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="gap-2 mb-4" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <DealRoomStoreWidget tenantId={tenantId!} />
    </div>
  );
}
