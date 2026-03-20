export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    // Get main cards
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
          const realCards = raw.filter(c => typeof c === "object" && c !== null && c.title);
          if (realCards.length > 0) { cards = realCards; break; }
          if (typeof raw[0] === "string") { raw = JSON.parse(raw[0]); }
          else break;
        } else if (typeof raw === "string") {
          raw = JSON.parse(raw);
        } else break;
        attempts++;
      }
    }

    // Get today's daily challenge
    const today = new Date().toISOString().slice(0, 10);
    try {
      const challengeRes = await fetch(`${url}/get/daily-challenge-${today}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const challengeData = await challengeRes.json();
      if (challengeData.result) {
        let challenge = challengeData.result;
        // Unwrap nested strings
        let attempts = 0;
        while (typeof challenge === "string" && attempts < 5) {
          challenge = JSON.parse(challenge);
          attempts++;
        }
        // Handle array wrapper like ["key", "{...}"]
        if (Array.isArray(challenge)) {
          const str = challenge.find(x => typeof x === "string" && x.startsWith("{"));
          if (str) challenge = JSON.parse(str);
        }
        const alreadyIn = cards.some(c => c.id === chall
