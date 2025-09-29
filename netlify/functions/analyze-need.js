// Netlify Function — analyze-need
// Reçoit { need, theme, tone } et renvoie une proposition structurée.
// Mets ta clé API dans Netlify (Site settings → Environment variables → OPENAI_API_KEY).

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { need, theme, tone } = JSON.parse(event.body || "{}");
    if (!need || typeof need !== "string") {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing 'need' string" }) };
    }

    const themes = ["Organisation achats","Maturité digitale / IA","Gouvernance & Data","PMO & exécution"];
    const detected = theme && theme.trim() ? theme.trim() : "";

    const system = `
Tu es un directeur de mission en cabinet de conseil.
Ta sortie doit être: (1) un CAHIER D'APPROCHE (Objectifs, Méthodologie, Livrables, Planning indicatif),
(2) des PROCHAINES ETAPES très claires (comment démarrer),
dans un style concis, professionnel, lisible.
Reste factuel et actionnable.`;

    const user = `
BESOIN CLIENT:
${need}

THEME PREFERE (optionnel): ${detected || "(auto-détection parmi: " + themes.join(", ") + ")"}
FORMAT: ${tone || "consulting"}

CADRES DISPONIBLES:
- Organisation achats
- Maturité digitale / IA
- Gouvernance & Data
- PMO & exécution

EXIGENCE DE SORTIE (structure exacte):
### Cadre retenu:
<Nom du cadre et justification en 1-2 phrases>

### Objectifs:
<3 à 5 puces>

### Méthodologie:
<3 à 6 puces, incl. entretiens, atelier, analyse doc, restitution>

### Livrables:
<3 à 5 puces, incl. un rapport exécutif>

### Planning indicatif:
<jalons clés en semaines>

### Prochaines étapes:
<3 à 5 puces très concrètes>`;

    // Appel LLM (OpenAI)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!r.ok) {
      const errtxt = await r.text();
      return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "LLM error", detail: errtxt }) };
    }
    const json = await r.json();
    const text = json.choices?.[0]?.message?.content || "";

    // Extraction simple de blocs
    const block = (label) => {
      const rx = new RegExp(`### ${label}:[\\s\\S]*?(?=\\n###|$)`, "i");
      const m = text.match(rx);
      return m ? m[0].replace(new RegExp(`^### ${label}:\\s*`, "i"), "").trim() : "";
    };
    const cadreLine = text.match(/### Cadre retenu:\s*([^\n]+)/i)?.[1]?.trim() || detected || "";
    const approach = [
      "### Objectifs:\n" + block("Objectifs"),
      "### Méthodologie:\n" + block("Méthodologie"),
      "### Livrables:\n" + block("Livrables"),
      "### Planning indicatif:\n" + block("Planning indicatif")
    ].join("\n\n");
    const nextSteps = block("Prochaines étapes");

    const mdToHtml = (s) => s
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br/>");

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        detectedTheme: cadreLine,
        approach,
        approachHtml: `<div><p>${mdToHtml(approach)}</p></div>`,
        nextSteps,
        nextStepsHtml: `<div><p>${mdToHtml(nextSteps)}</p></div>`
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error", detail: String(e?.message || e) }) };
  }
}

