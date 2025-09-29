// Netlify Function — analyze-need (Gemini)
// Utilise l'API Google AI Studio (Gemini 1.5) via generateContent.
// Clé attendue dans process.env.GEMINI_API_KEY

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };
}

exports.handler = async (event) => {
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

    const systemInstruction = `
Tu es un directeur de mission en cabinet de conseil.
Ta sortie doit être: (1) un CAHIER D'APPROCHE (Objectifs, Méthodologie, Livrables, Planning indicatif),
(2) des PROCHAINES ETAPES très claires (comment démarrer),
style concis, professionnel, lisible. Reste factuel et actionnable.`;

    const userPrompt = `
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

    // Appel Gemini (Google AI Studio) — modèle rapide et gratuit pour POC
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    });

    if (!r.ok) {
      const errtxt = await r.text();
      return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Gemini error", detail: errtxt }) };
    }
    const data = await r.json();

    // Récupération du texte
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";

    // Extraction simple des blocs
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
};
