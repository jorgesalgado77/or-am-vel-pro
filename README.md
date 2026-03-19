# OrçaMóvel PRO

Sistema SaaS de gestão comercial para marcenarias e lojas de móveis planejados.

## Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (banco de dados, auth, edge functions, storage)
- OpenAI API (VendaZap AI, OCR de contratos)

## Setup

1. Clone o repositório
2. `npm install`
3. Configure o `.env`
4. Deploy edge functions no Supabase
5. Configure o secret `OPENAI_API_KEY` nas edge functions
6. `npm run dev`
