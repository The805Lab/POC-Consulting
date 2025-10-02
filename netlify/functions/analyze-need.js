// Netlify Function — analyze-need (Gemini) avec sélection de modèle
// Env requises: GEMINI_API_KEY (et optionnel: DEFAULT_GEMINI_MODEL)
// Appel: POST JSON { need, theme, tone, modelKey?: "simple|balanced|pro|max", modelId?: "models/..." }

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };
}

// Mapping simple ➜ modèles Gemini (ajuste si besoin)
const MODEL_ALIASES = {
  simple:   "models/gemini-1.5-flash",
  balanced: "models/gemini-2.0-flash",
  pro:      "models/gemini-1.5-pro",
  max:      "models/gemini-2.5-pro"      // selon dispo/quota sur ton compte
};

// Liste blanche (sécurité) : seuls ces modèles sont autorisés
const ALLOWED_MODELS = new Set(Object.values(MODEL_ALIASES));

function resolveModel({ modelKey, modelId }) {
  // 1) modelId prioritaire si fourni et autorisé
  if (modelId && ALLOWED_MODELS.has(modelId)) return modelId;

  // 2) alias (modelKey)
  if (modelKey && MODEL_ALIASES[modelKey]) return MODEL_ALIASES[modelKey];

  // 3) variable d'env par défaut
  if (process.env.DEFAULT_GEMINI_MODEL && ALLOWED_MODELS.has(process.env.DEFAULT_GEMINI_MODEL)) {
    return process.env.DEFAULT_GEMINI_MODEL;
  }

  // 4) fallback
  return MODEL_ALIASES.balanced; // "models/gemini-2.0-flash"
}

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

    const parts = data?.candidates?.[0]?.content?.parts;
    const rawText = Array.isArray(parts)
      ? parts.map((p) => p?.text ?? "").join("\n")
      : parts?.[0]?.text ?? "";
    const text = typeof rawText === "string" ? rawText : String(rawText ?? "");

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
        modelUsed: selectedModel,
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
