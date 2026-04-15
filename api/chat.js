// =============================================================================
// UrbanAI — API Route for Vercel Edge Runtime
// Developed for Link Comunica (linkcomunica.com)
// =============================================================================

export const config = { runtime: 'edge' };

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1500;

// ---------------------------------------------------------------------------
// System Prompt — UrbanAI full identity and behavior rules
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
- When you need to verify current data, URLs, institutional websites, or recent regulations, USE your web search capability. Always search before saying you do not know a URL or current fact.

CHILE PRIORITY:
You must be highly competent in Chile:
- MINVU
- SERVIU
- OGUC
- DOM
- PRC (Plan Regulador Comunal)

LANGUAGE:
- Always respond in the user's language automatically
- You must be fluent in Spanish, English, and Dutch

STYLE:
- Professional, direct, structured
- No generic explanations
- No filler text
- Focus on implications, not definitions
- Sound like a senior urban consultant

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
- After searching, synthesize the result into a structured, expert-level response. Do not paste raw search results.

FINAL OUTPUT REQUIREMENT (MANDATORY):
Every answer MUST end with a Conclusion block in the user's language:

Conclusión: (Spanish) / Conclusion: (English) / Conclusie: (Dutch)
- Problema u oportunidad central
- Qué significa en términos prácticos
- Qué se debe hacer

Do not use dramatic language.
Be precise, strategic, and actionable.
`.trim();

// ---------------------------------------------------------------------------
// World Bank Data Fetcher
// Fetches last 5 years of population data for a given ISO2 country code
// Returns a clean array: [{ year, population }] or null on failure
// ---------------------------------------------------------------------------
async function getWorldBankData(countryCode) {
  try {
    const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/SP.POP.TOTL?format=json&mrv=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = await res.json();
    // World Bank returns [metadata, dataArray]
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
// CORS Headers
// ---------------------------------------------------------------------------
function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// JSON Response Helper
// ---------------------------------------------------------------------------
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ---------------------------------------------------------------------------
// Extract assembled text from Anthropic response content blocks
// Handles text blocks and ignores tool_use / tool_result blocks.
// Also returns a `sources` array if web_search_result blocks are present.
// ---------------------------------------------------------------------------
function parseAnthropicResponse(data) {
  if (!data || !Array.isArray(data.content)) {
    return { text: '', sources: [] };
  }

  const textBlocks = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  // Collect any cited web sources returned by the search tool
  const sources = data.content
    .filter((b) => b.type === 'tool_result')
    .flatMap((b) => {
      try {
        const parsed = typeof b.content === 'string' ? JSON.parse(b.content) : b.content;
        return Array.isArray(parsed) ? parsed.map((r) => ({ title: r.title, url: r.url })) : [];
      } catch {
        return [];
      }
    });

  return { text: textBlocks, sources };
}

// ---------------------------------------------------------------------------
// Validate messages array
// Each item must be { role: 'user'|'assistant', content: string }
// ---------------------------------------------------------------------------
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      ['user', 'assistant'].includes(m.role) &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0
  );
}

// ---------------------------------------------------------------------------
// Main Edge Handler
// ---------------------------------------------------------------------------
export default async function handler(req) {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Method guard
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // API key guard
  if (!ANTHROPIC_API_KEY) {
    console.error('[UrbanAI] ANTHROPIC_API_KEY is not configured');
    return jsonResponse({ error: 'Server configuration error: missing API key' }, 500);
  }

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, country } = body;

  // Validate messages
  if (!validateMessages(messages)) {
    return jsonResponse(
      {
        error:
          'Invalid messages: must be a non-empty array of { role: "user"|"assistant", content: string }',
      },
      400
    );
  }

  // Fetch World Bank enrichment (silent — failure does not block the request)
  let worldBankData = null;
  if (country && typeof country === 'string' && country.trim().length >= 2) {
    worldBankData = await getWorldBankData(country.trim().toUpperCase());
  }

  // Build enriched message list
  // World Bank context injected as a silent user/assistant pair before the conversation
  const enrichedMessages = [
    ...(worldBankData
      ? [
          {
            role: 'user',
            content: `[BACKGROUND CONTEXT — do not reference this directly in your answer unless it adds analytical value] World Bank population data for "${country}": ${JSON.stringify(worldBankData)}.`,
          },
          {
            role: 'assistant',
            content: 'Territorial context data loaded.',
          },
        ]
      : []),
    ...messages,
  ];

  // Call Anthropic API
  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
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
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: enrichedMessages,
      }),
    });
  } catch (networkErr) {
    console.error('[UrbanAI] Network error reaching Anthropic:', networkErr.message);
    return jsonResponse(
      { error: 'Network error reaching Anthropic API', detail: networkErr.message },
      502
    );
  }

  // Handle Anthropic error responses
  if (!anthropicRes.ok) {
    let detail = '';
    try {
      const errBody = await anthropicRes.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      detail = await anthropicRes.text();
    }
    console.error(`[UrbanAI] Anthropic error ${anthropicRes.status}:`, detail);
    return jsonResponse(
      { error: 'Anthropic API error', status: anthropicRes.status, detail },
      anthropicRes.status >= 400 && anthropicRes.status < 600 ? anthropicRes.status : 502
    );
  }

  // Parse Anthropic response
  let data;
  try {
    data = await anthropicRes.json();
  } catch {
    return jsonResponse({ error: 'Failed to parse Anthropic response' }, 502);
  }

  // Build clean response
  const { text, sources } = parseAnthropicResponse(data);

  return jsonResponse({
    id: data.id,
    model: data.model,
    role: data.role,
    stop_reason: data.stop_reason,
    usage: data.usage,
    // Full content blocks (for advanced clients that need tool details)
    content: data.content,
    // Convenience fields for simple frontend consumption
    text,
    sources,
    // World Bank metadata (useful for frontend debug/display)
    worldBankData: worldBankData ?? null,
  });
}
