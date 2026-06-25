# Deployment-Anleitung — Demo-Vorbereitungs-Formular

Ziel: Das Formular liegt auf Vercel. Beim Absenden wird eine Notiz an den
HubSpot-Kontakt geschrieben. Die Benachrichtigung an Dragan & Anje laeuft ueber
einen HubSpot-Workflow (kein externer Maildienst noetig).

Zeitaufwand: ca. 20-30 Minuten.

---

## Projektstruktur

```
projekt/
|- index.html        <- das Formular
|- api/
|   |- submit.js      <- die Serverless Function (nur HubSpot)
|- package.json
```

index.html und der Ordner api/ liegen auf derselben Ebene. Der Endpoint ist
dann automatisch unter https://DEINE-DOMAIN/api/submit erreichbar - genau
darauf zeigt das Formular bereits.

---

## Schritt 1 - HubSpot Private App: Scopes pruefen  [WICHTIG]

Ihr nutzt die bestehende n8n-Private-App. Der Token an sich passt, ABER die
Function schreibt NOTIZEN - dieses Recht hat n8n nicht zwingend.

1. HubSpot -> Einstellungen -> Integrationen -> Private Apps -> n8n-App oeffnen
2. Reiter Scopes -> sicherstellen, dass aktiv sind:
   - crm.objects.contacts.read
   - crm.objects.contacts.write
   - crm.objects.notes.write   <- der typischerweise fehlende
3. Falls etwas fehlte: ergaenzen + speichern. Der Token-Wert bleibt gleich.
4. Token kopieren (Reiter Auth).

> Bricht der erste Test mit "HubSpot 403" ab, ist es fast immer der fehlende
> crm.objects.notes.write-Scope.

---

## Schritt 2 - Auf GitHub hochladen

1. Neues (privates) Repo anlegen.
2. Den Inhalt des projekt/-Ordners hochladen (index.html, api/submit.js, package.json).
   WICHTIG: Es kommt KEIN Token ins Repo - der wird in Vercel gesetzt (Schritt 4).

---

## Schritt 3 - In Vercel importieren

1. https://vercel.com -> mit GitHub anmelden.
2. Add New -> Project -> das Repo auswaehlen -> Import.
3. Framework-Preset: Other (kein Build noetig).
4. Noch nicht zwingend deployen - erst die Variable setzen (Schritt 4),
   oder deployen und danach Redeploy.

---

## Schritt 4 - Environment Variable in Vercel

Vercel -> Projekt -> Settings -> Environment Variables. Nur EINE noetig:

   Name             Wert
   HUBSPOT_TOKEN    der Token aus Schritt 1

Nach dem Setzen: Redeploy ausloesen, damit die Variable aktiv wird.

---

## Schritt 5 - Benachrichtigung in HubSpot einrichten

Damit Dragan & Anje erfahren, dass ein Formular ausgefuellt wurde:

1. HubSpot -> Automatisierung -> Workflows -> neuer Workflow.
2. Ausloeser: z.B. "Notiz erstellt" mit Bedingung auf den Text der Notiz
   (die Notizen beginnen mit "Demo-Vorbereitung - Formular ausgefuellt") -
   oder ein einfacher Kontakt-basierter Trigger, je nach eurem Setup.
3. Aktion: interne E-Mail / Benachrichtigung an Dragan und Anje.

> Den genauen Trigger koennt ihr in HubSpot frei waehlen - der Vorteil ist, dass
> ihr Empfaenger und Bedingungen jederzeit ohne Code-Aenderung anpassen koennt.

---

## Schritt 6 - Echt testen

1. Formular-URL oeffnen, mit Test-E-Mail ausfuellen, absenden.
2. In HubSpot den Kontakt zu dieser E-Mail oeffnen -> unter Notizen sollte
   die Demo-Prep-Notiz mit Score, Flags und allen Antworten stehen.
3. Pruefen, ob der Benachrichtigungs-Workflow ausgeloest hat.
4. Test-Kontakt danach wieder loeschen.

---

## Wenn etwas klemmt

- 403 bei der Notiz -> crm.objects.notes.write-Scope fehlt (Schritt 1).
- "HUBSPOT_TOKEN fehlt" (500) -> Variable in Vercel nicht gesetzt oder kein
  Redeploy nach dem Setzen (Schritt 4).
- "E-Mail und Firma sind Pflicht" (400) -> leere Pflichtfelder durchgelassen;
  Logs unter Vercel -> Deployments -> Functions pruefen.
- Dubletten in HubSpot -> entstehen, wenn jemand eine andere E-Mail tippt als
  die hinterlegte. Manuell mergen.

---

## Was bewusst (noch) nicht drin ist

- Kein Property-Setup - alles landet als Notiz (so gewuenscht).
- Kein externer Maildienst - Benachrichtigung via HubSpot-Workflow.
- Keine automatische Deal-/Stage-Aenderung - rein dokumentierend.
- Kein Prefill ueber Kontakt-ID - ein allgemeiner Link fuer alle. Das Formular
  liest ?firma=...&name=... aus der URL, falls ihr spaeter vorbefuellen wollt.
