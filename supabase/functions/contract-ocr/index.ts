import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // Validate auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond({ error: "Body inválido" }, 400);
    }

    const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : "";

    if (!pdfBase64) {
      return respond({ error: "PDF não fornecido" }, 400);
    }

    // Limit payload size (10MB base64 ~ 7.5MB binary)
    if (pdfBase64.length > 14_000_000) {
      return respond({ error: "PDF muito grande. Limite: 10MB" }, 413);
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return respond({ error: "OPENAI_API_KEY não configurada" }, 500);
    }

    // Use OpenAI to extract text from the PDF image
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um OCR especializado em contratos de móveis planejados.
Extraia o conteúdo do documento e retorne em formato HTML limpo.
Mantenha a estrutura de títulos, parágrafos e listas.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia o conteúdo deste documento PDF e retorne como HTML:",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI OCR error:", openaiRes.status, errText);
      return respond({ error: "Erro no OCR" }, 502);
    }

    const data = await openaiRes.json();
    const html = data.choices?.[0]?.message?.content || "";

    return respond({ html, tokens: data.usage?.total_tokens || 0 });
  } catch (e) {
    console.error("contract-ocr error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
