export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    const body = req.body || {};
    const title = (body.title || "").trim();
    const prompt = (body.prompt || "").trim();
    const result = (body.result || "").trim();
    const takeaway = (body.takeaway || "").trim();
    const tagsInput = body.tags || "";

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const newEntry = {
      id: `challenge-${Date.now()}`,
      title,
      prompt,
      result,
      takeaway,
      tags: Array.isArray(tagsInput)
        ? tagsInput
        : String(tagsInput)
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
      createdAt: new Date().toISOString(),
    };

    const existingResponse = await fetch(`${url}/get/challenge-log`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const existingData = await existingResponse.json();

    let entries = [];

    if (existingData.result) {
      let raw = existingData.result;
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

    entries.unshift(newEntry);

    const saveResponse = await fetch(`${url}/set/challenge-log`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entries),
    });

    if (!saveResponse.ok) {
      const text = await saveResponse.text();
      console.error("save-challenge Upstash error:", text);
      return res.status(500).json({ error: "Failed to save challenge" });
    }

    res.status(200).json({
      success: true,
      entry: newEntry,
    });
  } catch (error) {
    console.error("save-challenge error:", error);
    res.status(500).json({ error: error.message });
  }
}
