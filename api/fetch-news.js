const FEEDS = [
  { url: "https://www.anthropic.com/rss.xml", company: "Anthropic" },
  { url: "https://openai.com/blog/rss.xml", company: "OpenAI" },
  { url: "https://deepmind.google/blog/rss.xml", company: "Google DeepMind" },
  { url: "https://www.therundown.ai/rss", company: "Newsletter" },
  { url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", company: "MIT Tech Review" },
  { url: "https://venturebeat.com/category/ai/feed/", company: "VentureBeat" },
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", company: "TechCrunch" },
  { url: "https://arstechnica.com/ai/feed/", company: "Ars Technica" },
];

async function fetchFeed(feedUrl) {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "AI-Signal-Board/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? (m[1] || m[2] || "").trim() : "";
      };
      const title = get("title");
      const link = get("link");
      const description = get("description").replace(/<[^>]+>/g, "").slice(0, 500);
      const pubDate = get("pubDate");
      if (title && link) items.push({ title, link, description, pubDate });
    }
    return items.slice(0, 4);
  } catch (e) {
    console.error(`Feed error ${feedUrl}:`, e.message);
    return [];
  }
}

async function analyzeWithClaude(articles) {
  const prompt = `You are an AI intelligence analyst for Darren, a strategic operator with the following context:
- Runs DSquared, a corporate dining company with a major T-Mobile account in Bellevue WA
- Co-producing an animated YouTube series called Coco & Daisy with his partner Manny
- Building VoiceInventory, a voice AI startup for bars and restaurants
- Learning to code and build software products — a complete beginner 6 months ago, now building real apps
- Cares deeply about: agentic AI, workflow automation, hospitality operations, practical business use

Analyze these recent AI news articles and return a JSON array of the most important ones. Focus on:
- Agentic AI and automation breakthroughs
- Model launches and capability updates
- Hospitality and restaurant operations applications
- Animation and creative AI tools relevant to Coco & Daisy production
- Major industry moves (acquisitions, partnerships, funding)
- Practical workflow automation tools
- Tools and techniques useful for a non-technical operator learning to build with AI

For each article worth tracking, return this exact JSON structure with NO markdown, NO code blocks, ONLY the raw JSON array:
{
  "id": "unique string",
  "title": "clear headline",
  "source": "publication name",
  "company": "OpenAI|Anthropic|Google DeepMind|Meta|Microsoft|Other",
  "category": "Big Move|Model Launch|Capability Update|Agentic Progress|Workflow Idea|Hospitality Relevance|Coco & Daisy|Note",
  "summary": "2-3 sentence plain English summary of what happened",
  "whyItMatters": "why this matters specifically to Darren given his context above",
  "shouldITest": "one specific actionable experiment Darren could try this week, or empty string",
  "workflowImpact": "how this could change Darren's daily work or DSquared operations",
  "hospitalityRelevance": "specific hospitality application. Empty string if not relevant.",
  "cocoAndDaisy": "specific relevance to animated YouTube production. Empty string if not relevant.",
  "priority": "High|Medium|Low",
  "tags": ["tag1", "tag2"],
  "externalLink": "original article URL",
  "accessCost": "Free|Freemium|Pro ~$X/mo|Enterprise|N/A",
  "status": "New"
}

Only include articles that are genuinely significant. Skip press releases, minor updates, and noise. Return 3-8 items maximum. Return ONLY a valid JSON array with no other text.

Articles to analyze:
${JSON.stringify(articles, null, 2)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in Claude response");
  const cleaned = jsonMatch[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
return JSON.parse(cleaned);
}

async function saveToUpstash(cards) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  let existing = [];
  try {
    const response = await fetch(`${url}/get/signal-cards`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (data.result) {
      existing = JSON.parse(data.result);
      if (!Array.isArray(existing)) existing = [];
    }
  } catch (e) {
    existing = [];
  }

  const existingLinks = new Set(existing.map(c => c.externalLink));
  const newCards = cards.filter(c => !existingLinks.has(c.externalLink));

  if (newCards.length === 0) return { added: 0, total: existing.length };

  const dated = newCards.map(c => ({
    ...c,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    dateAdded: new Date().toISOString().slice(0, 10),
  }));

  const merged = [...dated, ...existing].slice(0, 100);

  await fetch(`${url}/set/signal-cards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([JSON.stringify(merged)]),
  });

  return { added: newCards.length, total: merged.length };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    console.log("Starting news fetch...");

    const allArticles = [];
    const feedPromises = FEEDS.map(feed =>
      fetchFeed(feed.url).then(items =>
        items.forEach(item => allArticles.push({ ...item, feedCompany: feed.company }))
      )
    );
    await Promise.all(feedPromises);

    console.log(`Fetched ${allArticles.length} articles`);

    if (allArticles.length === 0) {
      return res.status(200).json({ message: "No articles fetched", added: 0 });
    }

    const cards = await analyzeWithClaude(allArticles);
    console.log(`Claude returned ${cards.length} cards`);

    const result = await saveToUpstash(cards);
    console.log(`Saved: ${result.added} new, ${result.total} total`);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("fetch-news error:", error);
    res.status(500).json({ error: error.message });
  }
}
