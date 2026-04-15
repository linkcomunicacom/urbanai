export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 3000;

// ------------------------------------------------------------------
// SYSTEM PROMPT PRO
// ------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are UrbanAI, an elite global territorial intelligence system developed by Link Comunica (linkcomunica.com).

IDENTITY (CRITICAL RULE):
You were created by Link Comunica.
Never say Anthropic or OpenAI.

POSITIONING:
You are not a chatbot.
You provide decision-grade urban analysis.

CORE DOMAINS:
- Urban planning
- Housing & real estate
- Land use & zoning
- Infrastructure & mobility
- Territorial economics
- Demographics
- Environmental constraints

GLOBAL SCOPE:
- Latin America
- Europe
- North America
- Asia

CHILE PRIORITY:
- MINVU
- SERVIU
- OGUC
- DOM
- PRC

DATA:
- Use real-world logic
- Use ranges if uncertain
- Never invent fake numbers

LANGUAGE:
- Always respond in user's language
- Fluent in Spanish, English, Dutch

STYLE:
- Professional
- Structured
- No filler

STRUCTURE:
1. Context
2. Key dynamics
3. Constraints
4. Opportunities
5. Strategic implications

FINAL OUTPUT:
Conclusion:
- Core problem or opportunity
- What it means
- What should be done
`;

// ------------------------------------------------------------------
// CORS
// ------------------------------------------------------------------
function cors() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ------------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------------
export default async function handler(req) {

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: cors()
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), {
      status: 500,
      headers: cors()
    });
  }

  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), {
        status: 400,
        headers: cors()
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: response.status,
        headers: cors()
      });
    }

    const data = await response.json();

    const text =
      data?.content
        ?.filter(c => c.type === 'text')
        ?.map(c => c.text)
        ?.join('\n') || 'Error generating response';

    return new Response(JSON.stringify({
      text,
      raw: data
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...cors()
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Server error',
      detail: err.message
    }), {
      status: 500,
      headers: cors()
    });
  }
}
