// /api/submit.js — Vercel Serverless Function
// Nimmt die Formular-Einsendung entgegen und schreibt eine Notiz an den
// (per E-Mail gematchten) HubSpot-Kontakt. Benachrichtigung läuft über
// einen HubSpot-Workflow (neue Notiz -> Mail an Dragan & Anje).

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

const HS = "https://api.hubapi.com";

/* ---------- kleine Helfer ---------- */
const FREQ_LABEL = {
  daily: "Täglich", weekly: "Mehrmals pro Woche",
  occasional: "Gelegentlich", never: "Selten oder nie",
};
const AGENT_BY_ID = {
  normen: "Normbert", projektsuche: "Archibald", email: "Mailanie",
  ausschreibung: "Bietmar", protokolle: "Protokolliver",
};
const FREQ_FRAGE = {
  normen: "Normen/Richtlinien nachschlagen",
  projektsuche: "Unterlagen aus früheren Projekten suchen",
  email: "E-Mails/Anhänge wiederfinden",
  ausschreibung: "Leistungsverzeichnisse / Ausschreibungen",
  protokolle: "Protokolle erstellen",
};
const MS365_LABEL = { Ja: "Ja", Teilweise: "Teilweise", Nein: "Nein" };
const KI_LABEL = { regular: "Nutzt regelmäßig", tried: "Ausprobiert", no: "Noch nicht", unknown: "Kennt KI nicht" };
const TEAM_LABEL = { "1-2": "1–2", "3-5": "3–5", "6-15": "6–15", "16+": "16+" };
const ENTSCHEID_LABEL = {
  self: "Entscheidet selbst", partner: "Entscheidet mit PartnerIn",
  boss: "Vorgesetzte/r entscheidet", scout: "Informiert sich für jemand anderen",
};
const AIACT_LABEL = { yes: "Bereits absolviert", planned: "Geplant", no: "Noch nicht", unknown: "Erstmals gehört" };

function esc(s) { return String(s == null ? "" : s); }

async function hsFetch(path, options = {}) {
  const res = await fetch(HS + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + HUBSPOT_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leer */ }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text || ("HTTP " + res.status);
    const err = new Error("HubSpot " + res.status + ": " + msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

/* ---------- Kontakt per E-Mail finden oder anlegen ---------- */
async function upsertContact(email, firma, name) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  // Suche
  const search = await hsFetch("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
      properties: ["email"], limit: 1,
    }),
  });
  if (search && search.total > 0 && search.results.length) {
    return search.results[0].id;
  }
  // Anlegen
  const [firstname, ...rest] = String(name || "").trim().split(" ");
  const created = await hsFetch("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        email: cleanEmail,
        firstname: firstname || "",
        lastname: rest.join(" ") || "",
        company: firma || "",
      },
    }),
  });
  return created.id;
}

/* ---------- Notiz-Text aufbauen (lesbar) ---------- */
function buildNoteHtml(d) {
  const freqLines = Object.keys(FREQ_FRAGE).map(id => {
    const v = d.freq && d.freq[id];
    return `<li><strong>${FREQ_FRAGE[id]}:</strong> ${v ? FREQ_LABEL[v] || v : "—"}</li>`;
  }).join("");
  const flags = (d.flags && d.flags.length) ? d.flags.join(", ") : "keine";
  const agenten = (d.empfohleneAgenten && d.empfohleneAgenten.length) ? d.empfohleneAgenten.join(", ") : "kein klarer Fit";
  const kitools = (d.kitools && d.kitools.length) ? d.kitools.join(", ") : "—";

  return `
<div>
  <p><strong>📋 Demo-Vorbereitung — Formular ausgefüllt</strong></p>
  <p><strong>Score:</strong> ${esc(d.score)} &nbsp;|&nbsp; <strong>Empfohlene Agenten:</strong> ${esc(agenten)}</p>
  <p><strong>⚑ Flags:</strong> ${esc(flags)}</p>
  <hr>
  <p><strong>Büro</strong><br>
  Firma: ${esc(d.firma)}<br>
  Name: ${esc(d.name)} (${esc(d.position)})<br>
  E-Mail: ${esc(d.email)}<br>
  Fachgebiet: ${esc(d.fach)}<br>
  Bundesland: ${esc(d.bundesland)}<br>
  Teamgröße: ${esc(TEAM_LABEL[d.team] || d.team)}<br>
  Microsoft 365: ${esc(MS365_LABEL[d.ms365] || d.ms365 || "—")}<br>
  KI-Erfahrung: ${esc(KI_LABEL[d.ki] || d.ki || "—")}<br>
  Genutzte KI-Tools: ${esc(kitools)}<br>
  Entscheidung: ${esc(ENTSCHEID_LABEL[d.entscheidung] || d.entscheidung)}<br>
  EU AI Act Schulung: ${esc(AIACT_LABEL[d.aiact] || d.aiact || "—")}</p>
  <p><strong>Häufigkeit der Situationen</strong></p>
  <ul>${freqLines}</ul>
  ${d.freitext ? `<p><strong>Freitext:</strong><br>${esc(d.freitext)}</p>` : ""}
</div>`.trim();
}

/* ---------- Notiz an Kontakt hängen ---------- */
// Über die Engagements-API (/engagements/v1/engagements). Dieser Weg läuft
// historisch über den Kontakt-Scope (crm.objects.contacts.write) und braucht
// KEINEN separaten notes-Scope — wie der bestehende Braingineering-Service.
// Wichtig: contactIds ist ein ARRAY, der Text geht in metadata.body.
async function createNote(contactId, html) {
  const result = await hsFetch("/engagements/v1/engagements", {
    method: "POST",
    body: JSON.stringify({
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: { contactIds: [Number(contactId)], companyIds: [], dealIds: [], ownerIds: [] },
      metadata: { body: html },
    }),
  });
  return result && result.engagement ? result.engagement.id : null;
}

/* ---------- Handler ---------- */
export default async function handler(req, res) {
  // CORS (Formular liegt auf gleicher Domain — Header schaden aber nicht)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!HUBSPOT_TOKEN) return res.status(500).json({ error: "HUBSPOT_TOKEN fehlt" });

  try {
    const d = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!d || !d.email || !d.firma) {
      return res.status(400).json({ error: "E-Mail und Firma sind Pflicht" });
    }

    const html = buildNoteHtml(d);
    const contactId = await upsertContact(d.email, d.firma, d.name);
    const noteId = await createNote(contactId, html);

    return res.status(200).json({ ok: true, contactId, noteId });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Serverfehler" });
  }
}
