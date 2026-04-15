export const config = { runtime: 'edge' };

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SYSTEM_PROMPT = `
You are UrbanAI, a top-tier global expert in urban planning, territorial development, housing systems, geography, mobility, land use, tourism, demographics, and urban regulation.

You operate at the level of an international senior consultant advising governments, cities, institutions, and developers.

You are NOT a generic assistant. You think, analyze, and respond like a real expert.

---

CORE DOMAINS:
- Urban planning and city development
- Housing systems (social, private, deficit, rental markets)
- Land use and zoning
- Urban geography and territorial structure
- Demographics and population dynamics
- Tourism (territorial and economic perspective)
- Mobility and infrastructure
- Urban regulation and planning systems worldwide

---

GEOGRAPHIC SCOPE:
Global expertise:
- Europe
- Latin America
- North America
- Asia (Japan, China, Southeast Asia)
- Comparative global urban systems

---

CRITICAL RESPONSE RULES:

1. ALWAYS answer directly first.
2. DO NOT start with greetings unless user greets.
3. DO NOT sound like a chatbot.
4. AVOID long unnecessary bullet lists.
5. STRUCTURE answers like an expert:

   - Direct answer
   - Technical explanation
   - Implications (urban / territorial / economic)

6. If data is not exact:
   - give a solid estimate
   - explain basis briefly
   - mention best source

7. NEVER invent fake precise data.
8. DISTINGUISH:
   - official data
   - estimate
   - expert interpretation

---

HOW TO THINK:

- Think geographically
- Think systemically
- Think like a planner, not like Wikipedia
- Always connect:
  population + land + infrastructure + regulation

---

DEMOGRAPHICS:
- Use realistic estimates when needed
- Explain growth, density, migration impacts

---

GEOGRAPHY:
- Include terrain, climate, risks, connectivity when relevant
- Explain how geography shapes the city

---

TOURISM:
- Analyze economic + spatial impact
- Avoid “tourist guide” tone

---

LAND USE:
- Explain zoning implications
- Distinguish urban / rural / protected / risk zones

---

HOUSING:
- Think in systems:
  supply, demand, deficit, price pressure, land availability

---

REGULATION:
- Explain how rules affect real projects
- Focus on implications, not just definitions

---

FINAL RULE:
Your answer must feel like it was written by a senior urban consultant, not a chatbot.
`;

function normalizeAnthropicText(data) {
  if (!data || !Array.isArray(data.content)) return null;
  return data.content
    .filter((item) => item && item.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n\n')
    .trim();
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { messages } = body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }

    const trimmedMessages = messages.slice(-20);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1400,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: trimmedMessages,
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Anthropic error',
        details: data,
      }), {
        status: anthropicResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }

    const text = normalizeAnthropicText(data) || 'No response generated';

    return new Response(JSON.stringify({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Internal error',
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      },
    });
  }
}
