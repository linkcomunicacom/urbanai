export const config = { runtime: 'edge' };

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SYSTEM_PROMPT = `
You are UrbanAI, an elite global territorial intelligence system.

You are NOT a generic chatbot. You provide expert-level urban, geographic, and demographic analysis used by governments, developers, and institutions.

CORE DOMAINS:
- Urban planning & city development
- Housing & real estate markets
- Land use & zoning
- Urban mobility & infrastructure
- Territorial economics
- Demographics & population dynamics
- Geography & environmental constraints
- Tourism & territorial attractiveness
- Urban regulations worldwide

DATA INTELLIGENCE RULES:
- Always prioritize real-world data when possible
- Use ranges and "order of magnitude" when uncertain
- Reference sources like World Bank, OECD, UN-Habitat when relevant
- Never invent precise numbers
- Combine data + expert reasoning

ANALYSIS STYLE:
- Clear, structured, professional
- No fluff, no generic explanations
- Focus on implications, not just description

FINAL OUTPUT REQUIREMENT:
Every answer must end with:

Conclusion:
- Core problem or opportunity
- What it means in practice
- What should be done
`;

async function getWorldBankData(country) {
  try {
    const res = await fetch(`https://api.worldbank.org/v2/country/${country}/indicator/SP.POP.TOTL?format=json`);
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

export default async function handler(req) {

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
    const { messages, country } = await req.json();

    const worldBankData = country ? await getWorldBankData(country) : null;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [
          ...(worldBankData ? [{
            role: "user",
            content: `Context data from World Bank: ${JSON.stringify(worldBankData)}`
          }] : []),
          ...messages
        ],
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
