// Netlify Function — analyze-need (Gemini) avec sélection de modèle
// Env requises: GEMINI_API_KEY (et optionnel: DEFAULT_GEMINI_MODEL)
// Appel: POST JSON { need, theme, tone, modelKey?: "simple|balanced|pro|max", modelId?: "models/..." }

const { resolveModel, cors, mdToHtml } = require("./_shared/helpers");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { need, theme, tone, modelKey, modelId } = JSON.parse(event.body || "{}");
    if (!need || typeof need !== "string") {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing 'need' string" }) };
    }

    const selectedModel = resolveModel({ modelKey, modelId });

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

    // Appel Gemini (Google AI Studio)
    const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;

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
      return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Gemini error", detail: errtxt, model: selectedModel }) };
    }
    const data = await r.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";

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

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        modelUsed: selectedModel,
        detectedTheme: cadreLine,
        approach,
        approachHtml: `<div>${mdToHtml(approach)}</div>`,
        nextSteps,
        nextStepsHtml: `<div>${mdToHtml(nextSteps)}</div>`
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error", detail: String(e?.message || e) }) };
  }
};
