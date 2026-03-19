const FEEDS = [
  // Anthropic
  { url: "https://www.anthropic.com/rss.xml", company: "Anthropic" },
  // OpenAI
  { url: "https://openai.com/blog/rss.xml", company: "OpenAI" },
  // Google DeepMind
  { url: "https://deepmind.google/blog/rss.xml", company: "Google DeepMind" },
  // The Rundown AI newsletter
  { url: "https://www.therundown.ai/rss", company: "Newsletter" },
  // MIT Tech Review AI
  { url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", company: "MIT Tech Review" },
  // VentureBeat AI
  { url: "https://venturebeat.com/category/ai/feed/", company: "VentureBeat" },
];

async function fetchFeed(feedUrl) {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "AI-Signal-Board/1.0" },
      signal: AbortSignal.timeout(8000),
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
    return items.slice(0, 5);
  } catch (e) {
    console.error(`Feed error ${feedUrl}:`, e.message);
    return [];
  }
}

async function analyzeWithClaude(articles) {
  const prompt = `You are an AI intelligence analyst for Darren, a strategic operator in hospitality and food service (runs DSquared, a corporate dining company with a major T-Mobile account). He is also co-producing an animated YouTube series called Coco & Daisy, and building a voice AI startup called VoiceInventory for bars and restaurants.

Analyze these recent AI news articles and return a JSON array of the most important ones. Focus on:
- Agentic AI and automation breakthroughs
- Model launches and capability updates
- Hospitality/operations business applications  
- Animation and creative AI tools (relevant to Coco & Daisy production)
- Major industry moves (acquisitions, partnerships, funding)
- Practical workflow automation tools

For each article worth tracking, return this exact JSON structure:
{
  "id": "unique string",
  "title": "clear headline",
  "source": "publication name",
  "company": "OpenAI|Anthropic|Google DeepMind|Meta|Microsoft|Other",
  "category": "Big Move|Model Launch|Capability Update|Agentic Progress|Workflow Idea|Hospitality Relevance|Coco & Daisy|Note",
  "summary": "2-3 sentence plain English summary of what happened",
  "whyItMatters": "why this matters specifically to someone in hospitality ops and AI automation",
  "shouldITest": "specific actionable experiment Darren could try this week, or empty string if not applicable",
  "workflowImpact": "how this could change Darren's daily work or DSquared operations",
  "hospitalityRelevance": "specific hospitality/restaurant/catering applications, or empty string",
  "cocoAndDaisy": "relevance to animated YouTube production workflow, or empty string",
  "priority": "High|Medium|Low",
  "tags": ["tag1", "tag2"],
  "externalLink": "original article URL",
  "status": "New"
}

Only include articles that are genuinely significant. Skip press releases, minor updates, and noise. Return 3-8 items maximum. Return ONLY a valid JSON array, no other text.

Articles to analyze:
${JSON.stringify(articles, null, 2)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.anthropic || process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function saveToUpstash(cards) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  const existing = await fetch(`${url}/get/signal-cards`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json()).then(d => JSON.parse(d.result || "[]")).catch(() => []);

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
  try {
    console.log("Starting news fetch...");

    const allArticles = [];
    for (const feed of FEEDS) {
      const items = await fetchFeed(feed.url);
      items.forEach(item => allArticles.push({ ...item, feedCompany: feed.company }));
    }

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
