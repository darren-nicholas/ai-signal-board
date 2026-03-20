export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${url}/get/signal-cards`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    
    let cards = [];
    if (data.result) {
      let raw = data.result;
      // Keep unwrapping until we have a real array
      let attempts = 0;
      while (typeof raw === "string" && attempts < 5) {
        try { raw = JSON.parse(raw); } catch(e) { break; }
        attempts++;
      }
      if (Array.isArray(raw)) {
        cards = raw.filter(c => typeof c === "object" && c !== null && c.title);
      }
    }

    res.status(200).json({ cards, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error("get-cards error:", error);
    res.status(500).json({ error: error.message, cards: [] });
  }
}
