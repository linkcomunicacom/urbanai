export const config = { runtime: 'edge' };

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

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

FINAL OUTPUT REQUIREMENT (MANDATORY):
Every answer MUST end with:

Conclusion:
- Core problem or opportunity
- What it means in practical terms
- What should be done

Do not use dramatic language.
Be precise, strategic, and actionable.
`;

async function getWorldBankData(country) {
  try {
    const res = await fetch(
      `https://api.worldbank.org/v2/country/${country}/indicator/SP.POP.TOTL?format=json&mrv=5`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
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

  const { messages, country } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing or invalid messages array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Fetch World Bank data if country code is provided
  const worldBankData = country ? await getWorldBankData(country) : null;

  // Build message list, optionally injecting World Bank context
  const enrichedMessages = [
    ...(worldBankData
      ? [
          {
            role: 'user',
            content: `World Bank context data for country "${country}": ${JSON.stringify(worldBankData)}`,
          },
          {
            role: 'assistant',
            content:
              'World Bank data received and integrated into my territorial analysis context.',
          },
        ]
      : []),
    ...messages,
  ];

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: enrichedMessages,
      }),
    });

    if (!anthropicRes.ok) {
      const errorBody = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: 'Anthropic API error', detail: errorBody }),
        {
          status: anthropicRes.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        }
      );
    }

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: err.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      }
    );
  }
}
