-- Garantia mínima para o fluxo "Salvar Contrato e Continuar"
-- Execute no SQL Editor do seu Supabase externo

-- 1) Garante um template ativo padrão para o tenant atual caso ainda não exista.
INSERT INTO public.contract_templates (
  tenant_id,
  nome,
  conteudo_html,
  ativo
)
SELECT
  public.get_my_tenant_id_secure()::uuid,
  'Modelo padrão automático',
  $$
  <h1>Contrato de Venda</h1>
  <p><strong>Número do contrato:</strong> {{numero_contrato}}</p>
  <p><strong>Data do fechamento:</strong> {{data_fechamento}}</p>

  <h2>Cliente</h2>
  <p><strong>Nome:</strong> {{nome_cliente}}</p>
  <p><strong>CPF/CNPJ:</strong> {{cpf_cliente}}</p>
  <p><strong>Telefone:</strong> {{telefone_cliente}}</p>
  <p><strong>Email:</strong> {{email_cliente}}</p>

  <h2>Endereço</h2>
  <p>{{endereco}}, {{bairro}} - {{cidade}}/{{uf}} - {{cep}}</p>

  <h2>Itens do projeto</h2>
  {{itens_tabela}}

  <h2>Detalhamento técnico</h2>
  {{itens_detalhes}}

  <h2>Pagamento</h2>
  <p><strong>Valor total:</strong> {{valor_final}}</p>
  <p><strong>Entrada:</strong> {{valor_entrada}}</p>
  <p><strong>Parcelas:</strong> {{parcelas}}x de {{valor_parcela}}</p>
  <p><strong>Forma de pagamento:</strong> {{forma_pagamento}}</p>

  <h2>Observações</h2>
  <p>{{observacoes}}</p>

  <p style="margin-top:32px;">{{cidade}}, {{data_atual}}</p>
  <p style="margin-top:48px;">________________________________________</p>
  <p>{{nome_cliente}}</p>
  $$,
  true
WHERE public.get_my_tenant_id_secure() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.contract_templates
    WHERE tenant_id = public.get_my_tenant_id_secure()::uuid
      AND ativo = true
  );

-- 2) Diagnóstico rápido do tenant atual.
SELECT
  (SELECT count(*) FROM public.contract_templates WHERE tenant_id = public.get_my_tenant_id_secure()::uuid AND ativo = true) AS templates_ativos,
  (SELECT count(*) FROM public.client_contracts WHERE tenant_id = public.get_my_tenant_id_secure()::uuid) AS contratos_salvos,
  (SELECT count(*) FROM public.simulations WHERE tenant_id = public.get_my_tenant_id_secure()::uuid) AS simulacoes_salvas;