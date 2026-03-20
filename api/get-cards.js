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
      try {
        cards = JSON.parse(data.result);
        if (!Array.isArray(cards)) cards = [];
      } catch(e) {
        cards = [];
      }
    }

    res.status(200).json({ cards, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error("get-cards error:", error);
    res.status(500).json({ error: error.message, cards: [] });
  }
}
