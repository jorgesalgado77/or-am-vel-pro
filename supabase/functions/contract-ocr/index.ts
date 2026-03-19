import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64 } = await req.json();

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "pdfBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não está configurada. Configure no painel do Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um assistente especializado em reconstrução fiel de contratos em PDF para visualização e impressão.
Extraia e reconstrua o documento preservando o layout original o máximo possível:
- mantenha a ordem visual exata dos blocos
- preserve tabelas, colunas, cabeçalhos, divisórias, alinhamentos e espaçamentos
- preserve tamanhos relativos e posição dos textos
- quando houver múltiplas páginas, retorne cada página em um bloco separado com <section class="contract-page" data-contract-page="true"><div class="contract-page__content">...</div></section>
- preserve estilos inline úteis como width, text-align, border, padding, margin, font-size e line-height
- use HTML válido com <table>, <tr>, <td>, <p>, <div>, <strong>, <em>, <br/>, <hr/>
- não invente conteúdo nem resuma

Retorne APENAS o HTML final, sem markdown, sem explicações e sem blocos de código.
Se houver campos preenchíveis, mantenha o texto original exatamente como está para que depois ele possa ser substituído por variáveis.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia todo o texto deste documento PDF e retorne como HTML estruturado:" },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições da OpenAI atingido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Chave da OpenAI inválida ou expirada. Verifique a configuração." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro na API OpenAI [${response.status}]` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    let html = result.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    html = html.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    return new Response(
      JSON.stringify({ html }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("contract-ocr error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
