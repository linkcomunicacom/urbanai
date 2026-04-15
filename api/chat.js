// =============================================================================
// UrbanAI — API Route for Vercel
// Developed for Link Comunica (linkcomunica.com)
// v3.3 — Fixed model name, flexible message validation, robust agentic loop
// =============================================================================

export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

// ---------------------------------------------------------------------------
// Environment & constants
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN    = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL             = 'claude-sonnet-4-6';   // ✅ CORRECTED model name
const MAX_TOKENS        = 8000;
const MAX_TOOL_ROUNDS   = 8;

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
- When you need to verify current data, URLs, institutional websites, or recent regulations, USE your web search tool. Always search before saying you do not know a URL or current fact.

CHILE PRIORITY:
You must be highly competent in Chile:
- MINVU
- SERVIU
- OGUC
- DOM
- PRC (Plan Regulador Comunal)

LANGUAGE:
- Always respond in the user's language automatically
- You must be fluent in Spanish, English, Dutch, French, Portuguese, and Chinese

STYLE:
- Professional, direct, structured
- No generic explanations
- No filler text
- Focus on implications, not definitions
- Sound like a senior urban consultant
- Never cut a response short — always complete every section fully

ANALYSIS STRUCTURE:
When relevant, structure answers like:
1. Context
2. Key dynamics
3. Constraints
4. Opportunities
5. Strategic implications

WEB SEARCH RULES:
- Always use web search to verify: institutional websites, current URLs, recent legislation, current market data, active programs, recent news about urban projects.
- Never say "I cannot verify" or "I do not have access to real-time data" — search first, then answer.
- After searching, synthesize results into a structured expert-level response. Do not paste raw search results.

FINAL OUTPUT REQUIREMENT (MANDATORY):
Every answer MUST end with a Conclusion block in the user's language:

Conclusión: (Spanish) / Conclusion: (English) / Conclusie: (Dutch) / Conclusion: (French) / Conclusão: (Portuguese) / 结论: (Chinese)
- Problema u oportunidad central
- Qué significa en términos prácticos
- Qué se debe hacer

Do not use dramatic language.
Be precise, strategic, and actionable.
`.trim();

// ---------------------------------------------------------------------------
// World Bank population data fetcher
// ---------------------------------------------------------------------------
async function getWorldBankData(countryCode) {
  try {
    const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/SP.POP.TOTL?format=json&mrv=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const entries = raw[1];
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return entries
      .filter((e) => e.value !== null)
      .map((e) => ({ year: e.date, population: e.value }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Normalize a single message content to string
// Handles cases where assistant content arrives as array of blocks
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
// Single Anthropic API call
// ---------------------------------------------------------------------------
async function callAnthropic(messages) {
  // Normalize all message contents to strings before sending
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
// Agentic loop — correct server tool handling
// web_search is SERVER-SIDE — no manual tool_result needed.
// On pause_turn or tool_use: append assistant content, continue.
// On end_turn: done.
// ---------------------------------------------------------------------------
async function runAgenticLoop(initialMessages) {
  let messages = [...initialMessages];
  let lastResponse = null;
  const allSources = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callAnthropic(messages);
    lastResponse = response;

    const { stop_reason, content } = response;

    // Collect sources from web_search_tool_result blocks
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r.url) {
              allSources.push({ title: r.title || r.url, url: r.url });
            }
          }
        }
      }
    }

    if (stop_reason === 'end_turn') break;

    if (stop_reason === 'pause_turn' || stop_reason === 'tool_use') {
      // Append raw content array so the next call sees the full assistant turn
      messages.push({ role: 'assistant', content });
      continue;
    }

    // Unknown stop reason — exit loop
    break;
  }

  return { lastResponse, allSources };
}

// ---------------------------------------------------------------------------
// Extract text from content array
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
// Helpers
// ---------------------------------------------------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ✅ FIXED: accepts both string and array content (multi-turn conversations)
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
// Main Edge Handler
// ---------------------------------------------------------------------------
export default async function handler(req) {

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('[UrbanAI] Missing ANTHROPIC_API_KEY');
    return jsonResponse({ error: 'Server configuration error: missing API key' }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, country } = body;

  if (!validateMessages(messages)) {
    return jsonResponse(
      { error: 'Invalid messages: non-empty array of { role, content } required' },
      400
    );
  }

  let worldBankData = null;
  if (country && typeof country === 'string' && country.trim().length >= 2) {
    worldBankData = await getWorldBankData(country.trim().toUpperCase());
  }

  const enrichedMessages = [
    ...(worldBankData
      ? [
          {
            role: 'user',
            content: `[BACKGROUND CONTEXT — use only if analytically relevant] World Bank population data for "${country}": ${JSON.stringify(worldBankData)}.`,
          },
          {
            role: 'assistant',
            content: 'Territorial context data loaded.',
          },
        ]
      : []),
    ...messages,
  ];

  let lastResponse, allSources;
  try {
    ({ lastResponse, allSources } = await runAgenticLoop(enrichedMessages));
  } catch (err) {
    console.error('[UrbanAI] Agentic loop error:', err.message);
    return jsonResponse(
      { error: err.message || 'Internal server error', status: err.status || 500 },
      err.status || 500
    );
  }

  const text = extractText(lastResponse.content);

  return jsonResponse({
    id:           lastResponse.id,
    model:        lastResponse.model,
    role:         lastResponse.role,
    stop_reason:  lastResponse.stop_reason,
    usage:        lastResponse.usage,
    content:      lastResponse.content,
    text,
    sources:      allSources,
    worldBankData: worldBankData ?? null,
  });
}
