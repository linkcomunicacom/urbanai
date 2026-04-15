// =============================================================================
// UrbanAI — API Route for Vercel Edge Runtime
// Developed for Link Comunica (linkcomunica.com)
// v3.0 — Agentic loop: handles web_search tool_use cycles automatically
// =============================================================================

export const config = { runtime: 'edge' };

// ---------------------------------------------------------------------------
// Environment & constants
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN    = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL             = 'claude-sonnet-4-20250514';
const MAX_TOKENS        = 1500;
const MAX_TOOL_ROUNDS   = 5; // safety cap on search iterations

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
- After searching, synthesize results into a structured expert-level response. Do not paste raw search results.

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
// World Bank population data fetcher (ISO2 country code)
// Returns [{ year, population }] or null on any failure
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
// Single Anthropic API call
// ---------------------------------------------------------------------------
async function callAnthropic(messages) {
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
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { const e = await res.json(); detail = e?.error?.message || JSON.stringify(e); }
    catch { detail = await res.text(); }
    const err = new Error(`Anthropic API error ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Agentic loop
//
// Anthropic's web_search works like this:
//   1. Model returns stop_reason="tool_use" with tool_use blocks inside content
//   2. The TOOL ITSELF executes the search internally (no manual execution needed)
//   3. We append the assistant's full content as-is, then send a tool_result
//      message so the model can continue and produce the final text answer
//
// This loop runs until stop_reason="end_turn" or MAX_TOOL_ROUNDS is reached.
// ---------------------------------------------------------------------------
async function runAgenticLoop(initialMessages) {
  let messages = [...initialMessages];
  let lastResponse = null;
  const allSources = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callAnthropic(messages);
    lastResponse = response;

    const { stop_reason, content } = response;

    // Collect any text blocks accumulated so far
    // (sometimes partial text appears before tool_use blocks)

    if (stop_reason === 'end_turn') {
      // Final answer — we are done
      break;
    }

    if (stop_reason === 'tool_use') {
      // Find all tool_use blocks in this response
      const toolUseBlocks = content.filter((b) => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) break; // safety: no tool blocks, exit

      // Append the full assistant message (with tool_use blocks) to history
      messages.push({ role: 'assistant', content });

      // Build tool_result blocks for each tool_use
      // For web_search, Anthropic executes the search internally and the results
      // are already embedded in the content as web_search_tool_result blocks.
      // We need to acknowledge each tool_use with a tool_result so the model
      // can proceed. Extract search results if present in the content.
      const toolResults = toolUseBlocks.map((toolBlock) => {
        // Find matching web_search_tool_result for this tool_use id
        const resultBlock = content.find(
          (b) => b.type === 'web_search_tool_result' && b.tool_use_id === toolBlock.id
        );

        if (resultBlock) {
          // Collect sources for the final response metadata
          if (Array.isArray(resultBlock.content)) {
            resultBlock.content.forEach((r) => {
              if (r.url) allSources.push({ title: r.title || r.url, url: r.url });
            });
          }
          return {
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: resultBlock.content,
          };
        }

        // No result block found — return empty result so model can continue
        return {
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: [],
        };
      });

      // Append tool results as a user message and continue the loop
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Any other stop_reason (max_tokens, stop_sequence) — exit loop
    break;
  }

  return { lastResponse, allSources };
}

// ---------------------------------------------------------------------------
// Extract all text blocks from a response's content array
// ---------------------------------------------------------------------------
function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Helpers: CORS, JSON responses, message validation
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
    console.error('[UrbanAI] Missing ANTHROPIC_API_KEY');
    return jsonResponse({ error: 'Server configuration error: missing API key' }, 500);
  }

  // Parse body
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
      { error: 'Invalid messages: non-empty array of { role: "user"|"assistant", content: string } required' },
      400
    );
  }

  // World Bank enrichment (non-blocking)
  let worldBankData = null;
  if (country && typeof country === 'string' && country.trim().length >= 2) {
    worldBankData = await getWorldBankData(country.trim().toUpperCase());
  }

  // Build enriched message list
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

  // Run agentic loop
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

  // Build and return clean response
  const text = extractText(lastResponse.content);

  return jsonResponse({
    id:           lastResponse.id,
    model:        lastResponse.model,
    role:         lastResponse.role,
    stop_reason:  lastResponse.stop_reason,
    usage:        lastResponse.usage,
    content:      lastResponse.content,  // full blocks for advanced clients
    text,                                 // assembled final answer text
    sources:      allSources,             // web sources used
    worldBankData: worldBankData ?? null,
  });
}
