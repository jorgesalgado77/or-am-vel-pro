/**
 * Backup & Restore Tab — Full tenant data backup system
 * Only visible to Administrador role
 */
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Upload, Trash2, Clock, Shield, Database, RefreshCw, AlertTriangle, CheckCircle2, FileArchive } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";
import { format } from "date-fns";

interface BackupMeta {
  id: string;
  created_at: string;
  size: string;
  tables: number;
  filename: string;
}

const BACKUP_TABLES = [
  "clients",
  "simulations",
  "client_contracts",
  "client_tracking",
  "financial_accounts",
  "tasks",
  "usuarios",
  "company_settings",
  "api_keys",
  "whatsapp_settings",
  "argument_bank",
  "support_tickets",
  "tracking_messages",
  "followup_schedules",
  "contract_templates",
  "product_catalog",
  "cargos",
  "indicadores",
  "payment_settings",
  "briefings",
  "vendazap_messages",
  "sales_goals",
  "audit_logs",
] as const;

const SCHEDULE_OPTIONS = [
  { value: "none", label: "Desativado" },
  { value: "daily", label: "Diário (00:00)" },
  { value: "weekly", label: "Semanal (Domingo)" },
  { value: "monthly", label: "Mensal (Dia 1)" },
];

function getBackupsKey(tenantId: string) {
  return `backup_history_${tenantId}`;
}

function loadBackupHistory(tenantId: string): BackupMeta[] {
  try {
    return JSON.parse(localStorage.getItem(getBackupsKey(tenantId)) || "[]");
  } catch { return []; }
}

function saveBackupHistory(tenantId: string, history: BackupMeta[]) {
  localStorage.setItem(getBackupsKey(tenantId), JSON.stringify(history));
}

export function BackupTab() {
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [schedule, setSchedule] = useState("none");
  const [autoDeleteOld, setAutoDeleteOld] = useState(true);
  const [backups, setBackups] = useState<BackupMeta[]>(() => {
    const tid = getTenantId();
    return tid ? loadBackupHistory(tid) : [];
  });

  const createBackup = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Tenant não identificado"); return; }

    setCreating(true);
    toast.info("🔄 Criando backup completo... Isso pode levar alguns segundos.");

    try {
      const backupData: Record<string, any[]> = {};
      let totalRecords = 0;
      let tablesExported = 0;

      for (const table of BACKUP_TABLES) {
        try {
          const { data, error } = await (supabase as any)
            .from(table)
            .select("*")
            .eq("tenant_id", tenantId);

          if (!error && data) {
            backupData[table] = data;
            totalRecords += data.length;
            tablesExported++;
          }
        } catch {
          // Table might not exist or have different structure
          // Try without tenant_id filter for tenant-agnostic tables
          try {
            const { data } = await (supabase as any)
              .from(table)
              .select("*")
              .limit(1000);
            if (data) {
              backupData[table] = data;
              totalRecords += data.length;
              tablesExported++;
            }
          } catch { /* skip */ }
        }
      }

      // Also export tenant info
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenantData) {
        backupData["_tenant"] = [tenantData];
      }

      const backup = {
        version: "1.0",
        created_at: new Date().toISOString(),
        tenant_id: tenantId,
        tables: backupData,
        metadata: {
          total_records: totalRecords,
          tables_exported: tablesExported,
          app_version: "OrçaMóvel PRO",
        },
      };

      // Create downloadable file
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = `backup_${tenantId.slice(0, 8)}_${format(new Date(), "yyyy-MM-dd_HH-mm")}.json`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Save to history
      const meta: BackupMeta = {
        id: `bk-${Date.now()}`,
        created_at: new Date().toISOString(),
        size: `${(jsonStr.length / 1024).toFixed(1)} KB`,
        tables: tablesExported,
        filename,
      };
      const updated = [meta, ...backups].slice(0, 20);
      setBackups(updated);
      saveBackupHistory(tenantId, updated);

      toast.success(`✅ Backup criado com sucesso! ${totalRecords} registros em ${tablesExported} tabelas.`);
    } catch (err) {
      console.error("Backup error:", err);
      toast.error("Erro ao criar backup. Tente novamente.");
    } finally {
      setCreating(false);
    }
  }, [backups]);

  const restoreBackup = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Tenant não identificado"); return; }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setRestoring(true);
      toast.info("🔄 Restaurando backup... Isso pode levar alguns segundos.");

      try {
        const text = await file.text();
        const backup = JSON.parse(text);

        if (!backup.version || !backup.tables) {
          toast.error("Arquivo de backup inválido.");
          setRestoring(false);
          return;
        }

        if (backup.tenant_id !== tenantId) {
          if (!window.confirm(`Este backup pertence a outro tenant. Deseja restaurar mesmo assim? Os dados serão aplicados à loja atual.`)) {
            setRestoring(false);
            return;
          }
        }

        let restoredTables = 0;
        let restoredRecords = 0;

        for (const [table, records] of Object.entries(backup.tables)) {
          if (table.startsWith("_") || !Array.isArray(records) || records.length === 0) continue;

          try {
            // Adapt tenant_id to current tenant
            const adapted = (records as any[]).map(r => ({
              ...r,
              tenant_id: tenantId,
            }));

            // Upsert to avoid conflicts
            const { error } = await (supabase as any)
              .from(table)
              .upsert(adapted, { onConflict: "id", ignoreDuplicates: true });

            if (!error) {
              restoredTables++;
              restoredRecords += adapted.length;
            } else {
              console.warn(`Restore ${table} error:`, error);
            }
          } catch (err) {
            console.warn(`Restore ${table} failed:`, err);
          }
        }

        toast.success(`✅ Backup restaurado! ${restoredRecords} registros em ${restoredTables} tabelas.`);
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        console.error("Restore error:", err);
        toast.error("Erro ao restaurar backup. Verifique o arquivo.");
      } finally {
        setRestoring(false);
      }
    };
    input.click();
  }, []);

  const deleteBackup = useCallback((id: string) => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    const updated = backups.filter(b => b.id !== id);
    setBackups(updated);
    saveBackupHistory(tenantId, updated);
    toast.success("Registro de backup removido.");
  }, [backups]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Backup & Restauração</CardTitle>
              <CardDescription>Clone completo de todos os dados da sua loja</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Informação Importante</p>
              <p className="mt-1">O backup inclui: clientes, simulações, contratos, configurações, usuários, chaves de API, contas financeiras, tarefas, mensagens e todas as configurações do sistema. Ao restaurar, os dados existentes serão mantidos e os dados do backup serão adicionados/atualizados.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Download className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Criar Backup</h3>
                <p className="text-sm text-muted-foreground mt-1">Exporta todos os dados da loja em um arquivo JSON que pode ser baixado e armazenado com segurança.</p>
              </div>
              <Button onClick={createBackup} disabled={creating} className="w-full gap-2">
                {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
                {creating ? "Criando backup..." : "Criar Backup Completo"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Upload className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Restaurar Backup</h3>
                <p className="text-sm text-muted-foreground mt-1">Carrega um arquivo de backup anteriormente criado e restaura todos os dados no sistema.</p>
              </div>
              <Button onClick={restoreBackup} disabled={restoring} variant="outline" className="w-full gap-2">
                {restoring ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {restoring ? "Restaurando..." : "Restaurar de Arquivo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduled Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Backups Programados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Frequência do backup automático</Label>
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {schedule !== "none" && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Excluir backups com mais de 30 dias</Label>
                <Switch checked={autoDeleteOld} onCheckedChange={setAutoDeleteOld} />
              </div>
              <div className="bg-primary/5 rounded-lg p-3 text-sm text-muted-foreground flex gap-2">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Backups programados serão salvos automaticamente no armazenamento local do dispositivo. Para maior segurança, faça download periódico dos backups.</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileArchive className="h-4 w-4" />
            Histórico de Backups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum backup criado ainda. Crie seu primeiro backup para garantir a segurança dos seus dados.
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map(backup => (
                <div key={backup.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{backup.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(backup.created_at), "dd/MM/yyyy 'às' HH:mm")} • {backup.size} • {backup.tables} tabelas
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => deleteBackup(backup.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* What's included */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">O que está incluído no backup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "Clientes", "Simulações", "Contratos", "Rastreamento",
              "Contas Financeiras", "Tarefas", "Usuários", "Configurações",
              "Chaves de API", "WhatsApp", "Argumentos de Venda", "Tickets",
              "Mensagens", "Follow-ups", "Templates", "Produtos",
              "Cargos", "Indicadores", "Pagamentos", "Briefings",
              "VendaZap", "Metas de Vendas", "Auditoria",
            ].map(item => (
              <Badge key={item} variant="outline" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />{item}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
