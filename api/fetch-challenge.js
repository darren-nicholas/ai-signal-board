async function generateDailyChallenge(today) {
  const prompt = `You are a personal AI learning coach for Darren, who is learning to build software products with AI assistance. Here is his context:
- Non-technical operator who started learning 6 months ago
- Has built: a family dashboard in Lovable, a children's game with Claude API, a Gmail cleanup script, a Wordle game, a file organizer, and an AI news dashboard with Vercel, Upstash, and GitHub
- Works in hospitality (corporate dining, T-Mobile account)
- Building VoiceInventory (voice AI for restaurants)
- Co-producing Coco & Daisy animated YouTube series
- Learns best by building real things, not tutorials
- Uses Claude as his primary AI assistant

Generate ONE daily build challenge for today (${today}). It should:
- Take 30-90 minutes with Claude's help
- Produce something real and useful (not just an exercise)
- Be slightly beyond what he's done before but achievable
- Connect to his actual projects when possible
- Include a clear "how to start" prompt he can paste into Claude

Return ONLY this JSON object with no other text:
{
  "id": "challenge-${today}",
  "title": "challenge title",
  "category": "Note",
  "source": "Daily Challenge",
  "company": "Other",
  "summary": "What you will build today and why it matters",
  "whyItMatters": "How this connects to your actual projects and learning journey",
  "shouldITest": "Paste this exact prompt into a new Claude conversation to start: [include the starter prompt]",
  "workflowImpact": "What skill this builds and how it compounds with what you already know",
  "hospitalityRelevance": "",
  "cocoAndDaisy": "",
  "accessCost": "Free",
  "priority": "Medium",
  "tags": ["daily-challenge", "learning"],
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
      max_tokens: 1000,
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
    console.log("Generating daily challenge for", today);
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
