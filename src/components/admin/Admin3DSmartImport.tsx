import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Box, Store, FileBox, Layers } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StoreRow {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
  recursos_vip: any;
}

interface ProjectRow {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
  tenant_nome?: string;
}

export function Admin3DSmartImport() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [tenantsRes, projectsRes] = await Promise.all([
      supabase.from("tenants").select("id, nome_loja, codigo_loja, recursos_vip").order("nome_loja"),
      supabase.from("imported_projects").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    const tenantsList = (tenantsRes.data || []) as StoreRow[];
    const activeStores = tenantsList.filter((t) => {
      const vip = t.recursos_vip || {};
      return vip.smart_import_3d;
    });
    setStores(activeStores);

    const tenantMap = Object.fromEntries(tenantsList.map((t) => [t.id, t.nome_loja]));
    const projectsList = (projectsRes.data || []) as ProjectRow[];
    setProjects(projectsList.map((p) => ({ ...p, tenant_nome: tenantMap[p.tenant_id] || "Desconhecida" })));

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const activeCount = stores.length;
  const totalProjects = projects.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Lojas com 3D Import", value: activeCount, icon: Store },
          { label: "Projetos Importados", value: totalProjects, icon: FileBox },
          { label: "Objetos Identificados", value: "—", icon: Layers },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <kpi.icon className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Lojas com 3D Smart Import Ativo</h3>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Projetos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : stores.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma loja com 3D Smart Import</TableCell></TableRow>
              ) : stores.map((store) => {
                const storeProjects = projects.filter((p) => p.tenant_id === store.id).length;
                return (
                  <TableRow key={store.id}>
                    <TableCell className="font-medium text-foreground">{store.nome_loja}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{store.codigo_loja || "—"}</TableCell>
                    <TableCell><Badge variant="default">Ativo</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{storeProjects}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {projects.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-foreground">Últimos Projetos Importados</h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.slice(0, 20).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.tenant_nome}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
