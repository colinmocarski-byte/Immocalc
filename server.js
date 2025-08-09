import express from "express";
import cors from "cors";
import { scrapeImmoScout } from "./scraper/immoscout.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/ping", (_req, res) => res.json({ ok: true }));

app.post("/api/scrape", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || !/^https?:\/\/(www\.)?immobilienscout24\.de/i.test(url)) {
      return res.status(400).json({ error: "Bitte einen gültigen ImmoScout-Link senden." });
    }
    const data = await scrapeImmoScout(url);
    res.json({ source: "immoscout", data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Scrape fehlgeschlagen. Bitte Daten manuell ergänzen." });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));