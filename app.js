const API = "http://localhost:4000";

const els = {
  url:          document.getElementById("url"),
  load:         document.getElementById("load"),
  status:       document.getElementById("status"),
  street:       document.getElementById("street"),
  city:         document.getElementById("city"),
  state:        document.getElementById("state"),
  yearBuilt:    document.getElementById("yearBuilt"),
  area:         document.getElementById("area"),
  price:        document.getElementById("price"),
  ppsqm:        document.getElementById("ppsqm"),
  brokerPct:    document.getElementById("brokerPct"),
  notaryPct:    document.getElementById("notaryPct"),
  restPct:      document.getElementById("restPct"),
  acqCosts:     document.getElementById("acqCosts"),
  totalCost:    document.getElementById("totalCost"),
  rentMonthly:  document.getElementById("rentMonthly"),
  otherIncome:  document.getElementById("otherIncome"),
  vacancyPct:   document.getElementById("vacancyPct"),
  capexPerSqm:  document.getElementById("capexPerSqm"),
  adminPa:      document.getElementById("adminPa"),
  nonAllocPa:   document.getElementById("nonAllocPa"),
  equity:       document.getElementById("equity"),
  ratePct:      document.getElementById("ratePct"),
  amortPct:     document.getElementById("amortPct"),
  fixYears:     document.getElementById("fixYears"),
  annuity:      document.getElementById("annuity"),
  interestM:    document.getElementById("interestM"),
  principalM:   document.getElementById("principalM"),
  grossYield:   document.getElementById("grossYield"),
  cfPre:        document.getElementById("cfPre"),
  cfPost:       document.getElementById("cfPost"),
  roe:          document.getElementById("roe"),
  dscr:         document.getElementById("dscr"),
};

// Bundesland → GrESt
const REST = {
  BW:5.0, BY:3.5, BE:6.0, BB:6.5, HB:5.0, HH:5.5, HE:6.0, MV:6.0,
  NI:5.0, NW:6.5, RP:5.0, SL:6.5, SN:5.5, ST:5.0, SH:6.5, TH:6.5
};

function n(v){ return Number(v||0); }
function set(el, v){ el.value = (Number.isFinite(v)? Math.round(v): v); }
function setFixed(el, v, d=0){ el.value = Number.isFinite(v)? v.toFixed(d): ""; }

function recalc() {
  const price = n(els.price.value);
  const area  = n(els.area.value);
  if (price && area) set(els.ppsqm, price / area);

  const rest = REST[els.state.value] ?? 5;
  setFixed(els.restPct, rest, 2);

  const acq = price * (rest/100 + n(els.notaryPct.value)/100 + n(els.brokerPct.value)/100);
  set(els.acqCosts, acq);
  set(els.totalCost, price + acq);

  // Financing
  const equity = n(els.equity.value);
  const loan   = Math.max(0, n(els.totalCost.value) - equity);
  const rate   = n(els.ratePct.value)/100;
  const amort  = n(els.amortPct.value)/100;

  // Startmonat (deutsche Anfangstilgung): Annuität ≈ (Zins+Tilgung)*K / 12
  const annuitySimple = loan * (rate + amort) / 12;

  // Exakte Annuität über Laufzeit (Zinsbindung als n Monate)
  const r = rate/12;
  const nPeriods = Math.max(12, n(els.fixYears.value)*12);
  const annuityExact = r>0 ? loan * (r / (1 - Math.pow(1+r, -nPeriods))) : loan / nPeriods;

  const annuity = isFinite(annuityExact) ? annuityExact : annuitySimple;

  const interestM = loan * rate / 12;
  const principalM = annuity - interestM;

  setFixed(els.annuity, annuity, 0);
  setFixed(els.interestM, interestM, 0);
  setFixed(els.principalM, principalM, 0);

  // Income & costs
  const rentM = n(els.rentMonthly.value) + n(els.otherIncome.value);
  const vacancy = n(els.vacancyPct.value)/100;
  const rentEffM = rentM * (1 - vacancy);
  const rentEffY = rentEffM * 12;

  const capexY = n(els.capexPerSqm.value) * area;
  const adminY = n(els.adminPa.value);
  const nonAllocY = n(els.nonAllocPa.value);
  const opexY = capexY + adminY + nonAllocY;

  const grossYield = price>0 ? (rentEffY / n(els.totalCost.value)) * 100 : 0;
  setFixed(els.grossYield, grossYield, 2);

  const interestY = interestM * 12;
  const debtSvcY = annuity * 12;

  const cfPreY = rentEffY - opexY - interestY;          // vor Tilgung
  const cfPostY = rentEffY - opexY - debtSvcY;          // nach Tilgung

  setFixed(els.cfPre, cfPreY/12, 0);
  setFixed(els.cfPost, cfPostY/12, 0);

  const roe = equity>0 ? (cfPreY / equity) * 100 : 0;
  setFixed(els.roe, roe, 1);

  const noi = rentEffY - opexY; // simple NOI
  const dscr = debtSvcY>0 ? noi / debtSvcY : "";
  setFixed(els.dscr, dscr, 2);
}

[
  els.state, els.yearBuilt, els.area, els.price, els.brokerPct, els.notaryPct,
  els.rentMonthly, els.otherIncome, els.vacancyPct, els.capexPerSqm, els.adminPa, els.nonAllocPa,
  els.equity, els.ratePct, els.amortPct, els.fixYears
].forEach(el => el.addEventListener("input", recalc));

els.load.addEventListener("click", async () => {
  els.status.textContent = "Lade…";
  try {
    const url = els.url.value.trim();
    const r = await fetch(`${API}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const { data, error } = await r.json();
    if (error) throw new Error(error);

    // Fill fields safely
    if (data.streetAddress) els.street.value = data.streetAddress;
    const city = [data.postalCode, data.addressLocality].filter(Boolean).join(" ");
    if (city) els.city.value = city;

    if (data.livingArea) els.area.value = data.livingArea;
    if (data.price) els.price.value = data.price;
    if (data.yearBuilt) els.yearBuilt.value = data.yearBuilt;

    if (data.coldRentMonthly) els.rentMonthly.value = data.coldRentMonthly;
    // Preis/m² wird automatisch gerechnet
    // Bundesland grob raten? Nutzer bestätigt:
    // (optional) kannst du hier anhand PLZ mapen; wir lassen Benutzer wählen.

    recalc();
    els.status.textContent = "Daten geladen.";
  } catch (e) {
    console.error(e);
    els.status.textContent = "Konnte nicht automatisch lesen – bitte Daten manuell ergänzen.";
  }
});

// Initial
recalc();