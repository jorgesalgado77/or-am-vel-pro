/**
 * Structured Briefing Form — Professional briefing based on PDF template.
 * All data stored as JSONB in client_briefings.responses
 */
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Home, Target, Sofa, Wrench, Users, DollarSign, Calendar, FileText } from "lucide-react";

interface BriefingStructuredFormProps {
  responses: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onToggleCheckbox: (key: string, option: string) => void;
  readOnly: boolean;
}

const ENVIRONMENTS = [
  "Cozinha", "Sala de Estar", "Sala de Jantar", "Quarto Casal", "Quarto Solteiro",
  "Quarto Infantil", "Banheiro Social", "Suíte", "Lavabo", "Lavanderia",
  "Home Office", "Closet", "Varanda/Sacada", "Área Gourmet", "Churrasqueira",
  "Hall de Entrada", "Despensa", "Adega", "Home Theater", "Biblioteca",
];

const TECHNICAL_CHECKLIST = [
  "Pontos elétricos definidos", "Pontos hidráulicos definidos",
  "Iluminação definida", "Revestimentos definidos",
  "Granito/Mármore definido", "Marcenaria anterior removida",
  "Pintura finalizada", "Piso instalado",
  "Gesso/Forro instalado", "Ar condicionado instalado",
];

const CONSTRUCTION_STAGES = [
  "Na planta / Projeto", "Em construção", "Em reforma",
  "Pronto (novo)", "Pronto (usado)", "Entregue pela construtora",
];

const LEAD_SOURCES = [
  "Google", "Instagram", "Facebook", "Indicação de amigo/familiar",
  "Indicação de profissional", "Passou pela loja", "Evento/Feira",
  "Landing Page", "WhatsApp", "Outro",
];

const PURCHASE_TIMELINES = [
  "Imediato", "Até 30 dias", "30 a 60 dias", "60 a 90 dias",
  "3 a 6 meses", "Acima de 6 meses", "Sem pressa",
];

const PAYMENT_TYPES = [
  "À vista", "Cartão de crédito", "Boleto parcelado",
  "Financiamento bancário", "Cheque", "PIX", "Misto",
];

const PROFILE_OPTIONS = [
  { value: "D", label: "D — Dominante (decisor rápido, objetivo)" },
  { value: "I", label: "I — Influente (comunicativo, entusiasta)" },
  { value: "S", label: "S — Estável (paciente, analítico)" },
  { value: "C", label: "C — Conforme (detalhista, perfeccionista)" },
];

function SectionCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export function BriefingStructuredForm({ responses, onChange, onToggleCheckbox, readOnly }: BriefingStructuredFormProps) {
  const v = (key: string) => responses[key] || "";
  const vArr = (key: string): string[] => Array.isArray(responses[key]) ? responses[key] : [];
  const disabled = readOnly;

  return (
    <div className="space-y-4">
      {/* 1. Dados Iniciais */}
      <SectionCard icon={FileText} title="Dados Iniciais">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Vendedor/Projetista" required>
            <Input value={v("seller_name")} onChange={e => onChange("seller_name", e.target.value)} disabled={disabled} placeholder="Nome do responsável" />
          </Field>
          <Field label="Data Inicial">
            <Input type="date" value={v("initial_date")} onChange={e => onChange("initial_date", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Data de Apresentação">
            <Input type="date" value={v("presentation_date")} onChange={e => onChange("presentation_date", e.target.value)} disabled={disabled} />
          </Field>
        </div>
      </SectionCard>

      {/* 2. Clientes */}
      <SectionCard icon={Users} title="Dados dos Clientes">
        <Badge variant="secondary" className="text-[10px] mb-1">Cliente 1 (Principal)</Badge>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome completo" required>
            <Input value={v("client_1_name")} onChange={e => onChange("client_1_name", e.target.value)} disabled={disabled} placeholder="Nome completo" />
          </Field>
          <Field label="Telefone" required>
            <Input value={v("client_1_phone")} onChange={e => onChange("client_1_phone", e.target.value)} disabled={disabled} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={v("client_1_email")} onChange={e => onChange("client_1_email", e.target.value)} disabled={disabled} placeholder="email@exemplo.com" />
          </Field>
          <Field label="Profissão">
            <Input value={v("client_1_profession")} onChange={e => onChange("client_1_profession", e.target.value)} disabled={disabled} placeholder="Profissão" />
          </Field>
          <Field label="Perfil Comportamental (DISC)">
            <Select value={v("client_1_profile")} onValueChange={val => onChange("client_1_profile", val)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {PROFILE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Separator className="my-2" />
        <Badge variant="secondary" className="text-[10px] mb-1">Cliente 2 (Opcional)</Badge>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome completo">
            <Input value={v("client_2_name")} onChange={e => onChange("client_2_name", e.target.value)} disabled={disabled} placeholder="Nome completo" />
          </Field>
          <Field label="Telefone">
            <Input value={v("client_2_phone")} onChange={e => onChange("client_2_phone", e.target.value)} disabled={disabled} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={v("client_2_email")} onChange={e => onChange("client_2_email", e.target.value)} disabled={disabled} placeholder="email@exemplo.com" />
          </Field>
          <Field label="Profissão">
            <Input value={v("client_2_profession")} onChange={e => onChange("client_2_profession", e.target.value)} disabled={disabled} placeholder="Profissão" />
          </Field>
          <Field label="Perfil Comportamental (DISC)">
            <Select value={v("client_2_profile")} onValueChange={val => onChange("client_2_profile", val)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {PROFILE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>

      {/* 3. Obra */}
      <SectionCard icon={Home} title="Dados da Obra / Imóvel">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Estágio da Obra" required>
            <Select value={v("construction_stage")} onValueChange={val => onChange("construction_stage", val)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {CONSTRUCTION_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Empreendimento / Condomínio">
            <Input value={v("enterprise")} onChange={e => onChange("enterprise", e.target.value)} disabled={disabled} placeholder="Nome do empreendimento" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Checkbox checked={!!responses["has_floor_plan"]} onCheckedChange={val => onChange("has_floor_plan", val)} disabled={disabled} />
            <Label className="text-xs">Possui planta?</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={!!responses["has_measurements"]} onCheckedChange={val => onChange("has_measurements", val)} disabled={disabled} />
            <Label className="text-xs">Medidas conferidas?</Label>
          </div>
          <Field label="Data da Medição">
            <Input type="date" value={v("measurement_date")} onChange={e => onChange("measurement_date", e.target.value)} disabled={disabled} />
          </Field>
        </div>
      </SectionCard>

      {/* 4. Origem do Lead */}
      <SectionCard icon={Target} title="Origem do Lead / Contato">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Checkbox checked={!!responses["knows_company"]} onCheckedChange={val => onChange("knows_company", val)} disabled={disabled} />
            <Label className="text-xs">Já conhece a empresa?</Label>
          </div>
          <Field label="Como nos conheceu?">
            <Select value={v("lead_source")} onValueChange={val => onChange("lead_source", val)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="O que sabe sobre a empresa?">
          <Textarea value={v("company_knowledge")} onChange={e => onChange("company_knowledge", e.target.value)} disabled={disabled} rows={2} placeholder="Descreva..." />
        </Field>
        <Field label="Motivo principal do contato">
          <Textarea value={v("reason_for_contact")} onChange={e => onChange("reason_for_contact", e.target.value)} disabled={disabled} rows={2} placeholder="O que motivou o cliente a entrar em contato?" />
        </Field>
      </SectionCard>

      {/* 5. Ambientes */}
      <SectionCard icon={Sofa} title="Ambientes Desejados">
        <p className="text-xs text-muted-foreground mb-2">Selecione os ambientes que o cliente deseja mobiliar:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {ENVIRONMENTS.map(env => (
            <div key={env} className="flex items-center gap-1.5">
              <Checkbox
                checked={vArr("environments").includes(env)}
                onCheckedChange={() => onToggleCheckbox("environments", env)}
                disabled={disabled}
              />
              <span className="text-xs">{env}</span>
            </div>
          ))}
        </div>
        <Field label="Outros ambientes (especificar)">
          <Input value={v("environments_other")} onChange={e => onChange("environments_other", e.target.value)} disabled={disabled} placeholder="Ambientes não listados..." />
        </Field>
      </SectionCard>

      {/* 6. Checklist Técnico */}
      <SectionCard icon={Wrench} title="Checklist Técnico">
        <p className="text-xs text-muted-foreground mb-2">Marque os itens já resolvidos / definidos pelo cliente:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TECHNICAL_CHECKLIST.map(item => (
            <div key={item} className="flex items-center gap-1.5">
              <Checkbox
                checked={vArr("technical_checklist").includes(item)}
                onCheckedChange={() => onToggleCheckbox("technical_checklist", item)}
                disabled={disabled}
              />
              <span className="text-xs">{item}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 7. Problemas / Dores */}
      <SectionCard icon={Target} title="Problemas e Necessidades">
        <Field label="Quais problemas ou dores o cliente possui com o espaço atual?">
          <Textarea value={v("pain_points")} onChange={e => onChange("pain_points", e.target.value)} disabled={disabled} rows={3} placeholder="Descreva os problemas relatados pelo cliente..." />
        </Field>
      </SectionCard>

      {/* 8. Moradores */}
      <SectionCard icon={Users} title="Moradores / Usuários do Espaço">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Quantidade de adultos">
            <Input type="number" min="0" value={v("residents_adults")} onChange={e => onChange("residents_adults", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Quantidade de crianças">
            <Input type="number" min="0" value={v("residents_children")} onChange={e => onChange("residents_children", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Pets?">
            <Input value={v("residents_pets")} onChange={e => onChange("residents_pets", e.target.value)} disabled={disabled} placeholder="Tipo e quantidade" />
          </Field>
        </div>
        <Field label="Necessidades especiais (acessibilidade, ergonomia, etc.)">
          <Textarea value={v("residents_special_needs")} onChange={e => onChange("residents_special_needs", e.target.value)} disabled={disabled} rows={2} placeholder="Descreva..." />
        </Field>
      </SectionCard>

      {/* 9. Experiência Anterior */}
      <SectionCard icon={FileText} title="Experiência Anterior">
        <Field label="Já comprou móveis planejados antes?">
          <RadioGroup value={v("previous_experience")} onValueChange={val => onChange("previous_experience", val)} disabled={disabled}>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5"><RadioGroupItem value="sim" /><span className="text-xs">Sim</span></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="nao" /><span className="text-xs">Não</span></div>
            </div>
          </RadioGroup>
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox checked={!!responses["previous_budget"]} onCheckedChange={val => onChange("previous_budget", val)} disabled={disabled} />
          <Label className="text-xs">Já fez orçamento em outro lugar?</Label>
        </div>
        <Field label="Concorrentes visitados / mencionados">
          <Input value={v("competitors")} onChange={e => onChange("competitors", e.target.value)} disabled={disabled} placeholder="Nomes de concorrentes..." />
        </Field>
      </SectionCard>

      {/* 10. Prazo e Investimento */}
      <SectionCard icon={DollarSign} title="Prazo e Investimento">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Previsão de compra" required>
            <Select value={v("purchase_timeline")} onValueChange={val => onChange("purchase_timeline", val)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {PURCHASE_TIMELINES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Expectativa de investimento">
            <Input value={v("budget_expectation")} onChange={e => onChange("budget_expectation", e.target.value)} disabled={disabled} placeholder="R$ ..." />
          </Field>
        </div>
        <Field label="Forma de pagamento preferida">
          <Select value={v("payment_type")} onValueChange={val => onChange("payment_type", val)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      {/* 11. Agendamento */}
      <SectionCard icon={Calendar} title="Agendamento">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Data da reunião / visita">
            <Input type="date" value={v("meeting_date")} onChange={e => onChange("meeting_date", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Horário">
            <Input type="time" value={v("meeting_time")} onChange={e => onChange("meeting_time", e.target.value)} disabled={disabled} />
          </Field>
        </div>
      </SectionCard>

      {/* 12. Observações */}
      <SectionCard icon={FileText} title="Observações">
        <Field label="Observações gerais">
          <Textarea value={v("notes")} onChange={e => onChange("notes", e.target.value)} disabled={disabled} rows={3} placeholder="Observações do vendedor/projetista..." />
        </Field>
        <Field label="Anotações finais / Percepções">
          <Textarea value={v("final_notes")} onChange={e => onChange("final_notes", e.target.value)} disabled={disabled} rows={3} placeholder="Percepções sobre o atendimento, postura do cliente, etc." />
        </Field>
      </SectionCard>
    </div>
  );
}
