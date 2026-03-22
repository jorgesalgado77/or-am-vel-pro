import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Upload, Trash2} from "lucide-react";
import {formatCurrency} from "@/lib/financing";
import {format} from "date-fns";

export interface ImportedEnvironment {
  id: string;
  fileName: string;
  environmentName: string;
  pieceCount: number;
  totalValue: number;
  importedAt: Date;
  file: File;
}

interface Props {
  environments: ImportedEnvironment[];
  onUpdateName: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  canDelete: boolean;
}

export function SimulatorEnvironmentsTable({ environments, onUpdateName, onRemove, canDelete }: Props) {
  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-4 text-muted-foreground">
        <Upload className="h-5 w-5" />
        <p className="text-xs">Nenhum ambiente importado</p>
        <p className="text-[10px]">Clique no botão acima para importar arquivos TXT ou XML</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30">
          <TableHead className="text-xs py-1.5 h-auto">Ambiente</TableHead>
          <TableHead className="text-xs py-1.5 h-auto text-center">Peças</TableHead>
          <TableHead className="text-xs py-1.5 h-auto text-right">Valor</TableHead>
          <TableHead className="text-xs py-1.5 h-auto text-center">Data</TableHead>
          {canDelete && <TableHead className="text-xs py-1.5 h-auto w-8"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {environments.map((env) => (
          <TableRow key={env.id} className="text-xs">
            <TableCell className="py-1.5 font-medium">
              <Input
                value={env.environmentName}
                onChange={(e) => onUpdateName(env.id, e.target.value)}
                className="h-6 text-xs border-none bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
              />
            </TableCell>
            <TableCell className="py-1.5 text-center">{env.pieceCount || "—"}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{formatCurrency(env.totalValue)}</TableCell>
            <TableCell className="py-1.5 text-center text-muted-foreground">
              {format(env.importedAt, "dd/MM HH:mm")}
            </TableCell>
            {canDelete && (
              <TableCell className="py-1.5 text-center">
                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => onRemove(env.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
        {environments.length > 1 && (
          <TableRow className="bg-primary/5 font-semibold text-xs">
            <TableCell className="py-1.5">Total ({environments.length} ambientes)</TableCell>
            <TableCell className="py-1.5 text-center">{environments.reduce((s, e) => s + e.pieceCount, 0) || "—"}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums text-primary">{formatCurrency(environments.reduce((s, e) => s + e.totalValue, 0))}</TableCell>
            <TableCell className="py-1.5"></TableCell>
            {canDelete && <TableCell className="py-1.5"></TableCell>}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
