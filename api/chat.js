// =============================================================================
// UrbanAI — API Route for Vercel (STREAMING SSE VERSION)
// Developed for Link Comunica (linkcomunica.com)
// v4.0 — Full SSE streaming, no timeout errors, agentic loop with web_search
// =============================================================================

export const config = {
  runtime: 'edge',
  maxDuration: 300, // Edge streaming can go up to 300s
};

// ---------------------------------------------------------------------------
// Environment & constants
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN    = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL             = 'claude-sonnet-4-6';
const MAX_TOKENS        = 8000;
const MAX_TOOL_ROUNDS   = 6;

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are UrbanAI, an elite global territorial intelligence system developed by Link Comunica (linkcomunica.com).

IDENTITY (CRITICAL RULE):
You were created by Link Comunica, a territorial intelligence and urban innovation firm.
NEVER say you were created by Anthropic, OpenAI, or any AI provider.
If asked who created you, always respond:
"I was developed by Link Comunica, a territorial intelligence and urban innovation firm."

POSITIONING:
You are not a chatbot.
You are a high-level advisory system used by:
- Governments
- Municipalities
- Real estate developers
- Investment funds
- Urban planning institutions
You provide decision-grade analysis.

RESPONSE LENGTH:
- Never truncate your response. Always complete your full analysis.
- For complex multi-part questions, answer every single part thoroughly.
- There is no character or length limit. Be as detailed and complete as the question requires.
- Long questions deserve long, thorough, complete answers.

CORE DOMAINS:
- Urban planning & city development
- Housing & real estate markets
- Land use, zoning, and territorial structure
- Urban mobility & infrastructure
- Territorial economics & investment
- Demographics & population dynamics
- Geography & environmental constraints
- Tourism & territorial attractiveness
- Urban regulations worldwide

GLOBAL SCOPE:
You operate globally with strong capability in:
- Latin America
- Europe
- North America
- Asia
You understand differences in regulatory systems, planning cultures, and development models.

DATA INTELLIGENCE:
- Use real-world logic and known institutional frameworks (World Bank, OECD, UN-Habitat, national statistics)
- If exact data is uncertain, use ranges and say "order of magnitude"
- Never invent precise fake numbers
- Combine data + expert reasoning
- When you need to verify current data, URLs, institutional websites, or recent regulations, USE your web search tool.

CHILE PRIORITY:
You must be highly competent in Chile:
- MINVU, SERVIU, OGUC, DOM
- PRC (Plan Regulador Comunal)

LANGUAGE:
- Always respond in the user's language automatically
- Fluent in Spanish, English, Dutch, French, Portuguese, and Chinese

STYLE:
- Professional, direct, structured
- No generic explanations, no filler text
- Focus on implications, not definitions
- Sound like a senior urban consultant
- Never cut a response short — always complete every section fully

ANALYSIS STRUCTURE (when relevant):
1. Context
2. Key dynamics
3. Constraints
4. Opportunities
5. Strategic implications

WEB SEARCH RULES:
- Always use web search to verify: institutional websites, current URLs, recent legislation, current market data, active programs, recent news about urban projects.
- Never say "I cannot verify" — search first, then answer.

FINAL OUTPUT REQUIREMENT (MANDATORY):
Every answer MUST end with a Conclusion block in the user's language:
Conclusión / Conclusion / Conclusie / Conclusão / 结论
- Problema u oportunidad central
- Qué significa en términos prácticos
- Qué se debe hacer
`.trim();

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ---------------------------------------------------------------------------
// Validate messages array
// ---------------------------------------------------------------------------
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every((m) => {
    if (!m || typeof m !== 'object') return false;
    if (!['user', 'assistant'].includes(m.role)) return false;
    if (typeof m.content === 'string') return m.content.trim().length > 0;
    if (Array.isArray(m.content)) return m.content.length > 0;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Normalize message content to string
// ---------------------------------------------------------------------------
function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text || '')
      .join('\n')
      .trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Single Anthropic call (non-streaming, used for tool rounds)
// ---------------------------------------------------------------------------
async function callAnthropic(messages) {
  const normalizedMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : normalizeContent(m.content),
  }));

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: normalizedMessages,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const e = await res.json();
      detail = e?.error?.message || JSON.stringify(e);
    } catch {
      detail = await res.text();
    }
    const err = new Error(`Anthropic API error ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Extract text from content blocks
// ---------------------------------------------------------------------------
function extractText(content) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : '';
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// SSE encode helper
// ---------------------------------------------------------------------------
function sseEncode(encoder, event, data) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Main Edge Handler — SSE Streaming
// ---------------------------------------------------------------------------
export default async function handler(req) {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { messages } = body;

  if (!validateMessages(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid messages array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // -------------------------------------------------------------------------
  // Build SSE streaming response
  // -------------------------------------------------------------------------
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {

      const send = (event, data) => {
        try {
          controller.enqueue(sseEncode(encoder, event, data));
        } catch {
          // controller already closed
        }
      };

      try {
        // Signal to frontend: we're working
        send('status', { message: 'Analizando consulta...' });

        let currentMessages = [...messages];
        let allSources = [];
        let fullText = '';
        let round = 0;

        while (round < MAX_TOOL_ROUNDS) {
          round++;

          // For tool rounds (not first), notify frontend
          if (round > 1) {
            send('status', { message: `Investigando fuentes... (ronda ${round})` });
          }

          const response = await callAnthropic(currentMessages);
          const { stop_reason, content } = response;

          // Collect web search sources
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
                for (const r of block.content) {
                  if (r.url && !allSources.find(s => s.url === r.url)) {
                    allSources.push({ title: r.title || r.url, url: r.url });
                    send('source', { title: r.title || r.url, url: r.url });
                  }
                }
              }
            }
          }

          // Extract any text from this round and stream it
          const roundText = extractText(content);
          if (roundText) {
            // Stream the text in chunks for smooth UX
            const chunkSize = 50;
            for (let i = 0; i < roundText.length; i += chunkSize) {
              const chunk = roundText.slice(i, i + chunkSize);
              fullText += chunk;
              send('token', { text: chunk });
            }
          }

          // Done — exit loop
          if (stop_reason === 'end_turn') {
            break;
          }

          // Tool use or pause — continue loop with appended context
          if (stop_reason === 'pause_turn' || stop_reason === 'tool_use') {
            currentMessages.push({ role: 'assistant', content });
            continue;
          }

          // Unknown stop reason — exit
          break;
        }

        // Send completion signal with metadata
        send('done', {
          sources: allSources,
          usage: null, // avoid sending heavy objects
        });

      } catch (err) {
        send('error', { message: err.message || 'Error interno del servidor' });
      } finally {
        try { controller.close(); } catch {}
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(),
    },
  });
}
