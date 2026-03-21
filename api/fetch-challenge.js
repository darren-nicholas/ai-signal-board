// Rotate focus areas by day of week so challenges stay varied
function getTodaysFocus(today) {
  const focuses = [
    {
      area: "Coco & Daisy animation pipeline",
      context: "Darren and his partner Manny are co-producing an animated YouTube series called Coco & Daisy. They are building an AI-assisted production pipeline. Current priorities include automating script generation, scene prompting for AI image/video tools, character consistency, voiceover workflows, and episode planning. Manny has already built a multi-agent pipeline using Gemini and Airtable. Darren wants to build complementary automation tools using Claude.",
      examples: "storyboard prompt generator, character bible builder, episode script template, scene description automator, YouTube thumbnail prompt batch generator, voice casting prompt tool"
    },
    {
      area: "DSquared catering & corporate dining automation",
      context: "Darren runs DSquared, a food service company operating corporate dining programs including a large T-Mobile 'Lunch On Us' (LOU) program at T-Mobile's Bellevue WA headquarters. He has a 60-proposal catering backlog and no API access to his current catering software (Caterease). He wants to automate proposal generation, pricing analysis, menu building, and client reporting. He has sample proposals in PDF format.",
      examples: "catering proposal PDF generator, menu pricing calculator, client-facing cost breakdown builder, T-Mobile LOU weekly summary report, venue capacity and staffing estimator, competitive pricing analyzer"
    },
    {
      area: "General coding and AI building skills",
      context: "Darren is a non-technical operator who started learning to code 6 months ago. He has built: a family dashboard in Lovable, a children's game with Claude API, a Gmail cleanup script, a Wordle game, a file organizer, and this AI news dashboard with Vercel, Upstash, and GitHub. He learns best by building real things. He uses Claude as his primary coding assistant.",
      examples: "API integration mini-project, data transformation script, simple automation tool, Claude-powered utility, browser extension, command line tool"
    }
  ];

  // Rotate by day of week (Mon=Coco, Tue=DSquared, Wed=Coding, Thu=Coco, Fri=DSquared, Sat=Coding, Sun=Coco)
  const dayIndex = new Date(today).getDay(); // 0=Sun
  const rotation = [0, 0, 1, 2, 0, 1, 2]; // Sun=Coco, Mon=Coco, Tue=DSquared, Wed=Coding...
  return focuses[rotation[dayIndex]];
}

async function generateDailyChallenge(today) {
  const focus = getTodaysFocus(today);

  const prompt = `You are a personal AI learning coach for Darren. Today's challenge must be focused on: ${focus.area}.

Context about this focus area:
${focus.context}

Example types of challenges for this area: ${focus.examples}

About Darren:
- Non-technical operator who started learning 6 months ago
- Has built: family dashboard, children's game with Claude API, Gmail cleanup script, Wordle game, file organizer, and an AI news dashboard with Vercel/Upstash/GitHub
- Learns best by building real things that solve actual problems
- Uses Claude as his primary AI assistant and coding partner

Generate ONE daily build challenge for today (${today}) focused specifically on ${focus.area}. It should:
- Take 30-90 minutes with Claude's help
- Produce something immediately useful to Darren's actual work
- Be slightly beyond what he's done before but achievable in one session
- Include a detailed, ready-to-paste starter prompt for Claude

Return ONLY this JSON object with no other text:
{
  "id": "challenge-${today}",
  "title": "challenge title — be specific, not generic",
  "category": "Note",
  "source": "Daily Challenge",
  "company": "Other",
  "summary": "Exactly what you will build today in 2-3 sentences. Be concrete about the output.",
  "whyItMatters": "How this directly advances ${focus.area} — be specific about time saved or problem solved",
  "shouldITest": "Paste this exact prompt into a new Claude conversation to start: [write a detailed 4-6 sentence starter prompt that gives Claude full context and asks for the specific deliverable]",
  "workflowImpact": "What skill this builds and how it compounds with what Darren already knows",
  "hospitalityRelevance": "${focus.area === 'DSquared catering & corporate dining automation' ? 'Describe the specific DSquared or T-Mobile LOU application' : ''}",
  "cocoAndDaisy": "${focus.area === 'Coco & Daisy animation pipeline' ? 'Describe the specific Coco & Daisy production application' : ''}",
  "accessCost": "Free",
  "priority": "High",
  "tags": ["daily-challenge", "learning", "${focus.area.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"],
  "externalLink": "",
  "status": "New",
  "dateAdded": "${today}"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object found in Claude response");
  return JSON.parse(jsonMatch[0]);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    // Check if today's challenge already exists
    const existingRes = await fetch(`${url}/get/daily-challenge-${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const existingData = await existingRes.json();

    if (existingData.result) {
      let challenge = existingData.result;
      let attempts = 0;
      while (typeof challenge === "string" && attempts < 5) {
        challenge = JSON.parse(challenge);
        attempts++;
      }
      return res.status(200).json({ success: true, challenge, fresh: false });
    }

    // Generate a new one
    const focus = getTodaysFocus(today);
    console.log(`Generating daily challenge for ${today} — focus: ${focus.area}`);
    const challenge = await generateDailyChallenge(today);

    // Save to Upstash
    await fetch(`${url}/set/daily-challenge-${today}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([JSON.stringify(challenge)]),
    });

    console.log("Daily challenge saved:", challenge.title);
    res.status(200).json({ success: true, challenge, fresh: true });
  } catch (error) {
    console.error("fetch-challenge error:", error);
    res.status(500).json({ error: error.message });
  }
}
