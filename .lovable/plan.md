
## Plano: Editor Visual de Contratos do Zero

### Escopo
Criar uma opção "Novo contrato em branco" que abre um editor visual completo permitindo construir contratos do zero.

### Componentes a criar

#### 1. Botão "Criar do Zero" no ContratosTab
- Adicionar botão ao lado do botão de importar template
- Abre o editor visual com uma folha A4 em branco

#### 2. Componente `ContractVisualEditor`
- Canvas A4 (794x1123px proporção) escalado
- Elementos posicionáveis via drag & drop:
  - **Formas geométricas**: retângulo, círculo, linha (redimensionáveis, cor de fundo/borda editável)
  - **Textos fixos**: caixas de texto editáveis com formatação
  - **Imagens**: upload de logos/imagens com redimensionamento
  - **Variáveis**: inseridas via menu de contexto

#### 3. Barra de Ferramentas (referência da imagem)
- Desfazer/Refazer
- Seletor de fonte e tamanho
- Negrito, Itálico, Sublinhado, Tachado
- Cor do texto
- Alinhamento (esquerda, centro, direita, justificado)
- Listas (ordenada e não ordenada)
- Limpar formatação
- Inserir forma / Inserir imagem

#### 4. Menu de Contexto no Preview
- Clique direito abre menu com opção "Inserir variável" → submenu com lista de variáveis disponíveis
- Opções de elemento: duplicar, excluir, trazer para frente, enviar para trás

#### 5. Conversão para HTML
- Ao salvar, converte os elementos visuais em HTML posicionado
- Compatível com o sistema existente de preview e geração de PDF

### Arquivos a criar/modificar
- `src/components/settings/ContractVisualEditor.tsx` (novo - editor principal)
- `src/components/settings/ContractEditorToolbar.tsx` (novo - barra de ferramentas)
- `src/components/settings/ContratosTab.tsx` (modificar - adicionar botão "criar do zero")
