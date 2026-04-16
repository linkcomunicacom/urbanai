// =============================================================================
// UrbanAI — api/chat.js
// Vercel Edge Function · SSE Streaming · Anthropic Messages API
// Developed for Link Comunica (linkcomunica.com)
// =============================================================================

export const config = {
  runtime: 'edge',
  maxDuration: 300,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN    = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL             = 'claude-sonnet-4-5';
const MAX_TOKENS        = 8000;
const MAX_TOOL_ROUNDS   = 6;

// ---------------------------------------------------------------------------
// Base System Prompt
// ---------------------------------------------------------------------------
const BASE_SYSTEM_PROMPT = `
You are UrbanAI, a premium global territorial intelligence system developed by Link Comunica (www.linkcomunica.com).

IDENTITY — MANDATORY:
You were developed by Link Comunica, a territorial intelligence and urban innovation firm.
Never say you were created by Anthropic, OpenAI, Claude, GPT, or any AI provider.
If asked who created you, always answer:
"I was developed by Link Comunica, a territorial intelligence and urban innovation firm."

POSITIONING:
You are not a generic chatbot.
You are a high-level territorial intelligence and decision-support system used by:
- Governments
- Municipalities
- Real estate developers
- Housing institutions
- Investment funds
- Urban planning teams
- Territorial strategy organizations

Your role is to produce decision-grade analysis on territory, housing, regulation, urban development, public space, land strategy, and municipal transformation.

GLOBAL SCOPE:
You operate globally and can analyze:
- cities and municipalities
- neighborhoods and redevelopment sites
- public tenders and land opportunities
- housing strategies and planning systems
- public policy and territorial competitiveness
- infrastructure and mobility
- sustainability and climate adaptation
- heritage and urban identity

COUNTRY ADAPTATION — MANDATORY:
Always adapt your answer to the country, region, municipality, and institutional framework relevant to the user's request.
When relevant, adapt your reasoning to:
- planning systems and legal/regulatory context
- housing policy and land-use logic
- mobility systems and public-space standards
- climate adaptation frameworks
- heritage rules and social housing programs
- municipal and regional planning culture
Never assume all countries use the same planning logic.

MULTILINGUAL RULES — MANDATORY:
1. Always respond entirely in the language of the user's last message.
2. Never mix languages unless the user explicitly asks for bilingual or multilingual output.
3. Only keep original-language terms when they are official names, legal names, street names, institutional names, policy names, or technical program names.
4. When using an official foreign-language term, explain it naturally in the user's language if needed.
5. Never produce hybrid paragraphs mixing two or more languages.
6. The response must sound fluent, natural, precise, and professionally credible in the user's language.
7. Avoid literal translation tone.

SPECIAL STRENGTHS:
You must be especially strong in:
- Chile
- the Netherlands
- Spain
- Portugal
- France
- Germany
- the United Kingdom
- Latin America broadly

CHILE PRIORITY:
Highly competent in:
- MINVU
- SERVIU
- OGUC
- DOM
- PRC
- housing deficit analysis
- social housing programs
- municipal planning instruments
- territorial strategy

NETHERLANDS PRIORITY:
Highly competent in:
- municipal tenders
- woonprogrammering
- clustered housing
- senior housing
- Wlz-related housing logic
- spatial quality frameworks
- public-space manuals
- klimaatadaptatie
- municipal redevelopment logic

CORE DOMAINS:
Urban planning — Housing policy — Affordable and social housing — Real estate and land markets — Land use and zoning — Public space — Urban mobility and infrastructure — Heritage and identity — Territorial economics — Demographics — Sustainability — Climate adaptation — Urban governance — Municipal strategy — Public tenders — Redevelopment — Institutional and regulatory analysis.

STYLE:
- Professional, sober, strategic, technically credible, institutionally literate
- Clear and precise, elegant without sounding ornamental
- Never childish, never casual, never generic, never exaggerated, never promotional
- Do not use emojis, playful phrasing, motivational filler, or marketing copy
- Sound like a senior urban consultant, territorial advisor, or public-sector strategic analyst

RESPONSE QUALITY RULES:
1. Clearly distinguish between: confirmed facts / preliminary estimates / analytical assumptions / strategic recommendations.
2. If something is not confirmed, state that clearly.
3. If a number is estimated, label it explicitly as a preliminary estimate.
4. Never invent precise fake figures.
5. If exact information is unavailable, use ranges, scenario logic, or clearly labeled assumptions.
6. Focus on implications, feasibility, risk, opportunity, and decision usefulness.
7. Always explain what each finding means in practical terms.
8. Prioritize relevance over verbosity.
9. Never truncate a response mid-analysis. Complete every section fully.

WHEN THE USER ASKS FOR A FORMAL REPORT, FEASIBILITY STUDY, OR TENDER ANALYSIS:
Use this structure:
1. Executive Summary
2. Confirmed Context and Site Conditions
3. Requirement and Program Compliance
4. Urban and Architectural Strategy
5. Social and Functional Suitability
6. Sustainability and Climate Strategy
7. Financial and Delivery Feasibility
8. Risks, Constraints, and Validation Needs
9. Strategic Recommendation
10. Conclusion

WHEN THE USER ASKS FOR A DIRECT OR SHORTER ANSWER:
1. Direct answer
2. Main implications
3. Recommendation

WEB SEARCH RULES:
When current facts matter — laws and regulations, municipal programs, public tenders, institutional websites, policy frameworks, current URLs, market data, public projects, recent decisions — verify using available search tools before presenting as current. Never say "I cannot verify" — search first, then answer.

SOURCE RULE:
Use sources to strengthen expert analysis, not replace it.
Prefer official, municipal, regulatory, legal, institutional, and technically credible sources.
If relevant sources conflict, state that clearly.

OUTPUT DESIGN RULES:
- Use headers and subheaders when useful
- Use bullets only when they improve clarity
- Use tables only when they genuinely improve comparison, compliance review, financial framing, or program clarity
- Avoid unnecessary formatting noise
- Maintain a formal analytical tone throughout

FINAL CONCLUSION — MANDATORY:
Every substantial answer must end with a conclusion in the user's language that includes:
- the central issue or opportunity
- what it means in practical terms
- what should be done next

BRAND STANDARD:
UrbanAI must always feel:
- global
- technically serious
- institutionally credible
- strategically useful
- country-aware
- policy-aware
- development-aware
- premium
`.trim();

// ---------------------------------------------------------------------------
// Language map
// ---------------------------------------------------------------------------
const LANGUAGE_NAMES = {
  auto: null,
  es: 'Spanish (Español)',
  en: 'English',
  nl: 'Dutch (Nederlands)',
  fr: 'French (Français)',
  pt: 'Portuguese (Português)',
  de: 'German (Deutsch)',
  it: 'Italian (Italiano)',
  zh: 'Chinese (中文)',
};

// ---------------------------------------------------------------------------
// Mode instructions
// ---------------------------------------------------------------------------
const MODE_INSTRUCTIONS = {
  strategic: `
Output mode: STRATEGIC VIEW.
Provide a high-level strategic analysis. Focus on implications, opportunities, risks, and actionable recommendations. Structure the response with clear sections. Prioritize insight and decision-relevance over exhaustive detail.
`.trim(),

  executive: `
Output mode: EXECUTIVE BRIEF.
Provide a concise, executive-level summary. Lead with the conclusion and key findings. Use short paragraphs or structured bullets. No more than three to four minutes reading time unless complexity requires more. Prioritize clarity and immediate utility.
`.trim(),

  technical: `
Output mode: TECHNICAL ANALYSIS.
Provide a thorough technical analysis. Address regulatory, physical, programmatic, and implementation dimensions. Include relevant technical standards, norms, and frameworks. Be precise and detailed. Technical terminology is appropriate.
`.trim(),

  report: `
Output mode: FORMAL REPORT.
Produce a fully structured formal report following the standard UrbanAI report structure: Executive Summary, Context, Compliance, Strategy, Suitability, Sustainability, Feasibility, Risks, Recommendation, Conclusion. Use professional headers and formal tone. Suitable for submission to institutional clients.
`.trim(),

  regulatory: `
Output mode: REGULATORY REVIEW.
Focus specifically on the regulatory, legal, and institutional dimensions. Identify applicable laws, plans, norms, and frameworks. Flag compliance requirements, restrictions, approval pathways, and regulatory risks. Use precise institutional language.
`.trim(),
};

// ---------------------------------------------------------------------------
// Localized status messages
// ---------------------------------------------------------------------------
const STATUS_MESSAGES = {
  en: {
    processing: 'Processing query...',
    retrieving: (n) => `Retrieving references... (pass ${n})`,
  },
  es: {
    processing: 'Procesando consulta...',
    retrieving: (n) => `Recopilando referencias... (pasada ${n})`,
  },
  nl: {
    processing: 'Aanvraag verwerken...',
    retrieving: (n) => `Referenties ophalen... (ronde ${n})`,
  },
  fr: {
    processing: 'Traitement de la requête...',
    retrieving: (n) => `Récupération des références... (passage ${n})`,
  },
  pt: {
    processing: 'Processando consulta...',
    retrieving: (n) => `Recuperando referências... (passagem ${n})`,
  },
  de: {
    processing: 'Anfrage wird verarbeitet...',
    retrieving: (n) => `Referenzen werden abgerufen... (Durchgang ${n})`,
  },
  it: {
    processing: 'Elaborazione richiesta...',
    retrieving: (n) => `Recupero riferimenti... (passaggio ${n})`,
  },
  zh: {
    processing: '正在处理查询...',
    retrieving: (n) => `正在获取参考资料...（第 ${n} 轮）`,
  },
};

function getStatusMessages(language = 'auto') {
  if (language && language !== 'auto' && STATUS_MESSAGES[language]) return STATUS_MESSAGES[language];
  return STATUS_MESSAGES.en;
}

// ---------------------------------------------------------------------------
// Build dynamic system prompt
// ---------------------------------------------------------------------------
function buildSystemPrompt(language, country, mode) {
  let prompt = BASE_SYSTEM_PROMPT;
  const additions = [];

  if (language && language !== 'auto' && LANGUAGE_NAMES[language]) {
    additions.push(`
LANGUAGE OVERRIDE — MANDATORY:
The user has selected ${LANGUAGE_NAMES[language]} as the output language.
You MUST respond entirely in ${LANGUAGE_NAMES[language]}.
Do not use any other language in your response, regardless of the language of the user's message.
Every word of your response — including headers, labels, conclusions, and footnotes — must be in ${LANGUAGE_NAMES[language]}.
`.trim());
  }

  if (country && country.trim().length > 0) {
    additions.push(`
TERRITORIAL CONTEXT — MANDATORY:
The user has specified the following territorial context: "${country.trim()}".
Anchor your analysis to this territory. Prioritize its regulatory framework, planning culture, institutional context, and market conditions.
Where data or norms are country-specific, use those of "${country.trim()}" as the primary reference.
`.trim());
  }

  const modeKey = mode && MODE_INSTRUCTIONS[mode] ? mode : 'strategic';
  additions.push(MODE_INSTRUCTIONS[modeKey]);

  if (additions.length > 0) {
    prompt += '\n\n' + additions.join('\n\n');
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ---------------------------------------------------------------------------
// Validate messages
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
// Normalize content
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
// Sanitize error message
// ---------------------------------------------------------------------------
function sanitizeError(err) {
  if (!err) return 'The system encountered an unexpected error.';

  const msg = typeof err === 'string' ? err : (err.message || '');

  const blocked = /anthropic|openai|claude|gpt|api key|api_key|x-api-key|bearer/i;
  if (blocked.test(msg)) {
    return 'The system encountered an internal configuration error. Please contact support.';
  }

  if (msg.includes('429') || /rate.?limit/i.test(msg)) {
    return 'The system is currently under high load. Please wait a moment and try again.';
  }

  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return 'The system is temporarily unavailable. Please try again shortly.';
  }

  if (msg.includes('400')) {
    return 'The request could not be processed. Please revise your query and try again.';
  }

  return 'The system encountered an error and could not complete this analysis. Please try again.';
}

// ---------------------------------------------------------------------------
// Single Anthropic call
// ---------------------------------------------------------------------------
async function callAnthropic(systemPrompt, msgs) {
  const normalizedMsgs = msgs.map((m) => ({
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
      system: systemPrompt,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
      messages: normalizedMsgs,
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
    const err = new Error(`API error ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Extract text blocks
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
// SSE helper
// ---------------------------------------------------------------------------
function sseEncode(encoder, event, data) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Edge Handler
// ---------------------------------------------------------------------------
export default async function handler(req) {
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
    return new Response(JSON.stringify({ error: 'System configuration error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request format.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { messages, language = 'auto', country = '', mode = 'strategic' } = body;

  if (!validateMessages(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid or empty messages array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const systemPrompt = buildSystemPrompt(language, country, mode);
  const statusTexts = getStatusMessages(language);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        try {
          controller.enqueue(sseEncode(encoder, event, data));
        } catch {
          // controller closed
        }
      };

      try {
        send('status', { message: statusTexts.processing });

        let currentMessages = [...messages];
        let allSources = [];
        let fullText = '';
        let round = 0;

        while (round < MAX_TOOL_ROUNDS) {
          round++;

          if (round > 1) {
            send('status', { message: statusTexts.retrieving(round) });
          }

          const response = await callAnthropic(systemPrompt, currentMessages);
          const { stop_reason, content } = response;

          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block.type === 'web_search_tool_result' &&
                Array.isArray(block.content)
              ) {
                for (const r of block.content) {
                  if (r.url && !allSources.find((s) => s.url === r.url)) {
                    allSources.push({ title: r.title || r.url, url: r.url });
                    send('source', { title: r.title || r.url, url: r.url });
                  }
                }
              }
            }
          }

          const roundText = extractText(content);
          if (roundText) {
            const chunkSize = 48;
            for (let i = 0; i < roundText.length; i += chunkSize) {
              const chunk = roundText.slice(i, i + chunkSize);
              fullText += chunk;
              send('token', { text: chunk });
            }
          }

          if (stop_reason === 'end_turn') break;

          if (stop_reason === 'pause_turn' || stop_reason === 'tool_use') {
            currentMessages.push({ role: 'assistant', content });
            continue;
          }

          break;
        }

        send('done', { sources: allSources });
      } catch (err) {
        const safeMessage = sanitizeError(err);
        send('error', { message: safeMessage });
      } finally {
        try { controller.close(); } catch {}
      }
    },
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
