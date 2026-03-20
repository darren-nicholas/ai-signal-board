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
  let attempts = 0;
  while (attempts < 6) {
    if (Array.isArray(raw)) {
      // Filter to only real card objects
      const realCards = raw.filter(c => typeof c === "object" && c !== null && c.title);
      if (realCards.length > 0) { cards = realCards; break; }
      // Array exists but contains strings — unwrap first element
      if (typeof raw[0] === "string") { raw = JSON.parse(raw[0]); }
      else break;
    } else if (typeof raw === "string") {
      raw = JSON.parse(raw);
    } else break;
    attempts++;
  }
}

    res.status(200).json({ cards, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error("get-cards error:", error);
    res.status(500).json({ error: error.message, cards: [] });
  }
}
