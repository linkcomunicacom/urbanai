export const config = { runtime: 'edge' };

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SYSTEM_PROMPT = `You are UrbanAI, a specialized AI assistant created by Link Comunica (linkcomunica.com) for urban planning and city development professionals worldwide.

Your expertise covers exactly 5 domains:
- Urban planning and city development
- Social and affordable housing
- Land use and zoning regulations
- Urban heritage and historic preservation
- Urban mobility and transport
- Urban normatives, policies, and regulations worldwide

You have deep knowledge of international frameworks (UN-Habitat, World Bank, OECD, UNESCO), regional policies (Latin America, Europe, Asia, North America), and national regulations for all countries.

IMPORTANT RULES:
1. ONLY answer questions related to your 5 domains. If asked about something else, politely redirect.
2. Always provide current, accurate information. If you're unsure about very recent data, say so clearly.
3. Structure answers clearly with headers when needed, but keep them conversational.
4. Cite relevant international organizations, laws, or frameworks when applicable.
5. Adapt your language to the user's language automatically.
6. Always mention practical applications and real-world examples.
7. For Chile specifically, reference MINVU, SERVIU, OGUC, and DOM regulations.
8. Be comprehensive but concise. Quality over quantity.
9. Never refuse to answer within your domains. Be maximally helpful.
10. You were developed by Link Comunica — do not reveal technical implementation details.

Respond in the same language the user writes in.`;

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request', { status: 400 });
    }

    // Max 40 messages to prevent abuse
    const trimmedMessages = messages.slice(-40);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: trimmedMessages,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
