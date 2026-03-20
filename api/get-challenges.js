export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${url}/get/challenge-log`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    let entries = [];

    if (data.result) {
      let raw = data.result;
      let attempts = 0;

      while (attempts < 6) {
        if (Array.isArray(raw)) {
          const realEntries = raw.filter(
            (e) => typeof e === "object" && e !== null && e.id
          );
          if (realEntries.length > 0) {
            entries = realEntries;
            break;
          }

          if (typeof raw[0] === "string") {
            raw = JSON.parse(raw[0]);
          } else {
            break;
          }
        } else if (typeof raw === "string") {
          raw = JSON.parse(raw);
        } else {
          break;
        }

        attempts++;
      }

      if (Array.isArray(raw) && entries.length === 0) {
        entries = raw;
      }
    }

    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      entries,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("get-challenges error:", error);
    res.status(500).json({ error: error.message, entries: [] });
  }
}
