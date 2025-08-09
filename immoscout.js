import axios from "axios";
import * as cheerio from "cheerio";

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

export async function scrapeImmoScout(url) {
  const resp = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    },
    timeout: 15000
  });

  const $ = cheerio.load(resp.data);

  // Try JSON-LD blocks
  const ld = $('script[type="application/ld+json"]')
    .map((_, el) => safeParse($(el).contents().text()))
    .get()
    .filter(Boolean);

  let data = {};

  // Pull common listing schema if present
  const offer = ld.find(o => o && (o["@type"] === "Offer" || o["@type"] === "Product" || o["@type"] === "Apartment"));
  const place = ld.find(o => o && o.address && o.address["@type"] === "PostalAddress");

  // Price
  if (offer?.price || offer?.offers?.price) {
    data.price = Number(offer.price ?? offer.offers?.price);
  }

  // Address & location
  const addr = offer?.itemOffered?.address || place?.address || place;
  if (addr) {
    data.streetAddress = addr.streetAddress || "";
    data.postalCode = addr.postalCode || "";
    data.addressLocality = addr.addressLocality || addr.addressRegion || "";
    data.addressCountry = addr.addressCountry || "DE";
  }

  // Living area, rooms, yearBuilt (varies by page)
  const item = offer?.itemOffered || ld.find(o => o["@type"] === "Apartment" || o["@type"] === "SingleFamilyResidence");
  if (item) {
    if (item.floorSize?.value) data.livingArea = Number(item.floorSize.value);
    if (item.numberOfRooms) data.rooms = Number(item.numberOfRooms);
    if (item.yearBuilt) data.yearBuilt = Number(item.yearBuilt);
  }

  // Fallbacks via meta labels/feature table
  // Typical ImmoScout pages render key/value lists; we heuristically parse numbers with "m²" and "€".
  const text = $("body").text();

  const euro = s => Number(String(s).replaceAll(".", "").replace(",", ".").replace(/[^\d.]/g, ""));
  const sqm  = s => Number(String(s).replace(",", ".").replace(/[^\d.]/g, ""));

  // Common patterns
  if (!data.livingArea) {
    const m = text.match(/(\d{1,4}[,.]?\d?)\s*m²/);
    if (m) data.livingArea = sqm(m[1]);
  }
  if (!data.price) {
    const p = text.match(/Kaufpreis[^0-9]*([\d\.]{2,9},?\d{0,2})\s*€/i) || text.match(/([\d\.]{2,9},?\d{0,2})\s*€\s*Kaufpreis/i);
    if (p) data.price = euro(p[1]);
  }
  if (!data.rooms) {
    const r = text.match(/(\d+(?:[.,]\d)?)\s*Zimmer/i);
    if (r) data.rooms = Number(r[1].replace(",", "."));
  }
  if (!data.yearBuilt) {
    const y = text.match(/Baujahr[^0-9]*(\d{4})/i);
    if (y) data.yearBuilt = Number(y[1]);
  }

  // Cold rent (if it’s a rental listing) – most cashflow-Käufer sind Kauf; wir lassen das Feld dennoch zu.
  const rentMatch = text.match(/Kaltmiete[^0-9]*([\d\.]{2,9},?\d{0,2})\s*€/i);
  if (rentMatch) data.coldRentMonthly = euro(rentMatch[1]);

  // Compose convenient fields
  if (data.price && data.livingArea) {
    data.pricePerSqm = +(data.price / data.livingArea).toFixed(0);
  }

  // Try to guess Bundesland from locality (rough heuristic; Frontend bietet Auswahl)
  data.stateGuess = data.addressLocality || "";

  return data;
}