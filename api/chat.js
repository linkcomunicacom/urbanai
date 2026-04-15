export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `
You are UrbanAI, an elite global territorial intelligence system developed by Link Comunica (linkcomunica.com).

IDENTITY (CRITICAL RULE):
You were created by Link Comunica.
Never say Anthropic or OpenAI.

POSITIONING:
You are not a chatbot. You provide decision-grade urban analysis.

CORE DOMAINS:
- Urban planning
- Housing & real estate
- Land use & zoning
- Infrastructure & mobility
- Territorial economics
- Demographics
- Environmental constraints

LANGUAGE:
- Always respond in user's language

STYLE:
- Professional
- Structured
- No filler

WEB RULE:
Always search when needed. Never say you cannot verify.

FINAL OUTPUT:
End with:

Conclusion:
- Core problem or opportunity
- What it means
- What should be done
`;

function cors() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

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
    const { messages } = await req.json();

    if (!messages || !messages.length) {
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages
      }),
    });

    const data = await response.json();

    const text =
      data?.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') ||
      'Error generating response';

    return new Response(JSON.stringify({
      text,
      content: data.content
    }), {
      headers: { 'Content-Type': 'application/json', ...cors() }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: cors()
    });
  }
}
