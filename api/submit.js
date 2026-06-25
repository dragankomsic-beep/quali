// /api/submit.js — Vercel Serverless Function
// Sendet die Formular-Einsendung an ein HubSpot-Formular (Forms Submission API,
// EU-Region). HubSpot nimmt die Daten als native Formular-Submission auf,
// ordnet sie per E-Mail dem Kontakt zu und verschickt die in den Formular-
// Einstellungen konfigurierte interne Benachrichtigung an Dragan & Anje.
//
// Kein Token nötig: dieser Endpoint ist derselbe öffentliche Mechanismus,
// den auch das eingebettete HubSpot-Formular nutzt.

const PORTAL_ID = "146718444";
const FORM_GUID = "668ce19a-3b4a-41a8-a389-4887cf00d51f";
// EU-Region (data-region="eu1" aus dem Embed-Code):
const SUBMIT_URL = `https://api-eu1.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_GUID}`;

// ====== HIER ANPASSEN ======
// Interner Name des Sammelfeldes in HubSpot (NICHT das Label "Demo-Vorbereitung",
// sondern der interne Property-Name, z.B. "demo_vorbereitung").
// Steht in HubSpot unter Einstellungen -> Eigenschaften -> dein Feld -> "Interner Name".
const SAMMELFELD = "demoprepform";
// ===========================

/* ---------- Labels für die lesbare Zusammenfassung ---------- */
const FREQ_LABEL = { daily: "Täglich", weekly: "Mehrmals pro Woche", occasional: "Gelegentlich", never: "Selten oder nie" };
const FREQ_FRAGE = {
  normen: "Normen/Richtlinien nachschlagen",
  projektsuche: "Unterlagen aus früheren Projekten suchen",
  email: "E-Mails/Anhänge wiederfinden (Outlook-Suche)",
  ausschreibung: "Leistungsverzeichnisse / Ausschreibungen",
  protokolle: "Protokolle / Gutachten erstellen",
};
const MS365_LABEL = { Ja: "Ja", Teilweise: "Teilweise", Nein: "Nein" };
const KI_LABEL = { regular: "Nutzt regelmäßig", tried: "Ausprobiert", no: "Noch nicht" };
const TEAM_LABEL = { "1-2": "1–2", "3-5": "3–5", "6-15": "6–15", "16+": "16+" };
const ENTSCHEID_LABEL = { self: "Entscheidet selbst", partner: "Entscheidet mit PartnerIn", boss: "Vorgesetzte/r entscheidet", scout: "Informiert sich für jemand anderen" };
const AIACT_LABEL = { yes: "Bereits absolviert", planned: "Geplant", no: "Noch nicht", unknown: "Erstmals gehört" };

function v(x) { return x == null ? "" : String(x); }

/* ---------- Alle Antworten als lesbarer Text fürs Sammelfeld ---------- */
function buildSummary(d) {
  const freqLines = Object.keys(FREQ_FRAGE).map(id => {
    const val = d.freq && d.freq[id];
    return `• ${FREQ_FRAGE[id]}: ${val ? (FREQ_LABEL[val] || val) : "—"}`;
  }).join("\n");
  const flags = (d.flags && d.flags.length) ? d.flags.join(", ") : "keine";
  const agenten = (d.empfohleneAgenten && d.empfohleneAgenten.length) ? d.empfohleneAgenten.join(", ") : "kein klarer Fit";
  const kitools = (d.kitools && d.kitools.length) ? d.kitools.join(", ") : "—";

  return [
    `=== DEMO-VORBEREITUNG ===`,
    `Score: ${v(d.score)}`,
    `Empfohlene Agenten: ${agenten}`,
    `Flags: ${flags}`,
    ``,
    `--- Büro ---`,
    `Position/Rolle: ${v(d.position)}`,
    `Fachgebiet: ${v(d.fach)}`,
    `Teamgröße: ${v(TEAM_LABEL[d.team] || d.team)}`,
    `Microsoft 365: ${v(MS365_LABEL[d.ms365] || d.ms365 || "—")}`,
    `KI-Erfahrung: ${v(KI_LABEL[d.ki] || d.ki || "—")}`,
    `Genutzte KI-Tools: ${kitools}`,
    `Entscheidung: ${v(ENTSCHEID_LABEL[d.entscheidung] || d.entscheidung)}`,
    `EU AI Act Schulung: ${v(AIACT_LABEL[d.aiact] || d.aiact || "—")}`,
    ``,
    `--- Häufigkeit der Situationen ---`,
    freqLines,
    ``,
    d.freitext ? `--- Freitext ---\n${v(d.freitext)}` : ``,
  ].join("\n").trim();
}

/* ---------- Handler ---------- */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const d = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!d || !d.email || !d.firma) {
      return res.status(400).json({ error: "E-Mail und Firma sind Pflicht" });
    }

    // Name in Vor-/Nachname zerlegen (HubSpot-Standardfelder)
    const [firstname, ...rest] = v(d.name).trim().split(" ");
    const lastname = rest.join(" ");

    // Felder müssen EXAKT den internen Namen im HubSpot-Formular entsprechen.
    const fields = [
      { name: "email", value: v(d.email).trim().toLowerCase() },
      { name: "firstname", value: firstname || "" },
      { name: "lastname", value: lastname || "" },
      { name: "company", value: v(d.firma) },
      { name: SAMMELFELD, value: buildSummary(d) },
    ];

    const payload = {
      fields,
      context: { pageName: "Demo-Vorbereitung (Vercel)" },
    };

    const hsRes = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await hsRes.text();
    if (!hsRes.ok) {
      console.error("HubSpot Forms API", hsRes.status, text);
      return res.status(hsRes.status).json({ error: "HubSpot lehnte ab", detail: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Serverfehler" });
  }
}
