const { cors, resolveModel, mdToHtml, partsToText } = require("./_shared/gemini");

// Netlify Function — analyze-need (Gemini) avec sélection de modèle
// Env requises: GEMINI_API_KEY (et optionnel: DEFAULT_GEMINI_MODEL)
// Appel: POST JSON { need, theme, tone, modelKey?: "simple|balanced|pro|max", modelId?: "models/..." }

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

    const themes = [
      "Organisation achats",
      "Maturité digitale / IA",
      "Gouvernance & Data",
      "PMO & exécution",
      "Études de marché",
    ];
    const detectedThemeInput = theme && theme.trim() ? theme.trim() : "";

    const systemInstruction = `
Tu es un directeur de mission en cabinet de conseil.
Ta sortie doit être: (1) un CAHIER D'APPROCHE (Objectifs, Méthodologie, Livrables, Planning indicatif),
(2) des PROCHAINES ETAPES très claires (comment démarrer),
style concis, professionnel, lisible. Reste factuel et actionnable.`;

    const userPrompt = `
BESOIN CLIENT:
${need}

THEME PREFERE (optionnel): ${detectedThemeInput || "(auto-détection parmi: " + themes.join(", ") + ")"}
FORMAT: ${tone || "consulting"}

CADRES DISPONIBLES:
- Organisation achats
- Maturité digitale / IA
- Gouvernance & Data
- PMO & exécution
- Études de marché

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

    const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        statusCode: 502,
        headers: cors(),
        body: JSON.stringify({ error: "Gemini error", detail, model: selectedModel }),
      };
    }

    const data = await response.json();

    if (!Array.isArray(data?.candidates) || data.candidates.length === 0) {
      return {
        statusCode: 502,
        headers: cors(),
        body: JSON.stringify({ error: "Empty response", model: selectedModel }),
      };
    }

    const parts = data.candidates[0]?.content?.parts ?? [];
    const rawText = partsToText(parts);
    const text = typeof rawText === "string" ? rawText : String(rawText ?? "");

    if (!text.trim()) {
      return {
        statusCode: 502,
        headers: cors(),
        body: JSON.stringify({ error: "Empty response", model: selectedModel }),
      };
    }

    const extractBlock = (label) => {
      const rx = new RegExp(`### ${label}:[\\s\\S]*?(?=\\n###|$)`, "i");
      const match = text.match(rx);
      return match ? match[0].replace(new RegExp(`^### ${label}:\\s*`, "i"), "").trim() : "";
    };

    const cadreLine = text.match(/### Cadre retenu:\s*([^\n]+)/i)?.[1]?.trim() || detectedThemeInput || "";

    const buildSection = (label) => {
      const content = extractBlock(label);
      return content ? `### ${label}:\n${content}` : "";
    };

    const approachSections = ["Objectifs", "Méthodologie", "Livrables", "Planning indicatif"].map(buildSection).filter(Boolean);
    const approach = approachSections.join("\n\n");
    const nextSteps = extractBlock("Prochaines étapes");

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        modelUsed: selectedModel,
        detectedTheme: cadreLine,
        approach,
        approachHtml: mdToHtml(approach),
        nextSteps,
        nextStepsHtml: mdToHtml(nextSteps),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ error: "Server error", detail: String(error?.message || error) }),
    };
  }
};
