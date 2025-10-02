// Netlify Function — diagnostic workflow (questionnaire + synthèse)
// Actions:
//  - POST { action: "generate", need, theme, tone, modelKey?, modelId? }
//  - POST { action: "analyze", need, theme, tone, answers: [...], questions: [...], modelKey?, modelId? }

const { resolveModel, cors, mdToHtml } = require("./_shared/helpers");

function sanitizeJson(text = "") {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { action, need, theme, tone, modelKey, modelId } = payload;
  if (!need || typeof need !== "string") {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing 'need' string" }) };
  }
  if (!action || (action !== "generate" && action !== "analyze")) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid 'action'" }) };
  }

  const selectedModel = resolveModel({ modelKey, modelId });
  const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  try {
    if (action === "generate") {
      const systemInstruction = `
Tu es un directeur de mission en cabinet de conseil.
Tu construis des questionnaires de diagnostic internes.
Le questionnaire doit comporter exactement 10 questions ciblées, couvrant stratégie, gouvernance, processus, outils et adoption.
Chaque question doit être soit:
- type "text" (réponse rédigée courte ou longue)
- type "checkbox" avec 3 à 6 options concrètes.
Réponds UNIQUEMENT en JSON valide.
`;

      const userPrompt = `
CONTEXTE CLIENT:
${need}

THEME ORIENTATIF: ${theme || "(auto)"}
FORMAT DE SORTIE DES LIVRABLES: ${tone || "consulting"}

RENVOIE un objet JSON:
{
  "questions": [
    {
      "id": "q1" // q1 à q10,
      "label": "intitulé",
      "type": "text" ou "checkbox",
      "placeholder": "optionnel, aide pour formuler la réponse",
      "options": ["option1", ...] // uniquement si type "checkbox"
    }
  ]
}

Choisis le type pertinent pour maximiser la valeur diagnostique.
`; 

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.35 }
        })
      });

      if (!response.ok) {
        const errtxt = await response.text();
        return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Gemini error", detail: errtxt, model: selectedModel }) };
      }

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsed;
      try {
        parsed = JSON.parse(sanitizeJson(raw));
      } catch (err) {
        return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Invalid JSON from model", detail: raw, model: selectedModel }) };
      }

      const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 10) : [];
      const normalized = questions.map((q, idx) => ({
        id: typeof q.id === "string" ? q.id : `q${idx + 1}`,
        label: typeof q.label === "string" ? q.label.trim() : `Question ${idx + 1}`,
        type: q.type === "checkbox" ? "checkbox" : "text",
        placeholder: typeof q.placeholder === "string" ? q.placeholder.trim() : "",
        options: Array.isArray(q.options) ? q.options.filter(o => typeof o === "string" && o.trim()).map(o => o.trim()) : []
      })).slice(0, 10);

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          modelUsed: selectedModel,
          questions: normalized
        })
      };
    }

    // action === "analyze"
    const { answers, questions } = payload;
    if (!Array.isArray(answers)) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Missing 'answers' array" }) };
    }

    const questionMap = Array.isArray(questions) ? questions : [];
    const merged = answers.map((ans) => {
      const qDef = questionMap.find((q) => q.id === ans.id) || {};
      const label = qDef.label || ans.id || "Question";
      const type = qDef.type || ans.type || "text";
      let value;
      if (Array.isArray(ans.value)) {
        value = ans.value.join(", ");
      } else if (typeof ans.value === "string") {
        value = ans.value.trim();
      } else {
        value = "";
      }
      const options = Array.isArray(qDef.options) ? qDef.options.join(", ") : "";
      return `- Question: ${label}\n  - Type: ${type}\n  - Options: ${options || "(n/a)"}\n  - Réponse: ${value || "(non renseigné)"}`;
    }).join("\n\n");

    const systemInstruction = `
Tu es un directeur de mission.
Analyse les réponses d'un mini-diagnostic interne.
Identifie les constats clés, les risques/opportunités et propose un plan d'actions priorisé.
Structure ta sortie en trois blocs Markdown:
### Observations clés
- ...
### Risques / Opportunités
- ...
### Recommandations priorisées
- ...
`;

    const userPrompt = `
BESOIN CLIENT:
${need}

THEME OU CADRE: ${theme || "(auto)"}
FORMAT INITIAL: ${tone || "consulting"}

QUESTIONNAIRE ET REPONSES:
${merged}

Produit la synthèse demandée, courte mais précise.
`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.25 }
      })
    });

    if (!response.ok) {
      const errtxt = await response.text();
      return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Gemini error", detail: errtxt, model: selectedModel }) };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        modelUsed: selectedModel,
        summary: text,
        summaryHtml: `<div>${mdToHtml(text)}</div>`
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Server error", detail: String(e?.message || e) }) };
  }
};
