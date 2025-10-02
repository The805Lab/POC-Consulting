// Netlify Function — diagnostic (Gemini)
// Fournit deux actions: analyze (diagnostic complet) et synthesize (résumé court)

const { cors, partsToText, resolveModel } = require("./_shared/gemini");

const DEFAULT_MODEL = "models/gemini-1.5-flash";

const ensureString = (value) => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return String(value);
  } catch (e) {
    return "";
  }
};

const callGemini = async ({ userPrompt, systemInstruction, model, modelId, modelKey }) => {
  const idCandidate = modelId || (typeof model === "string" && model.startsWith("models/") ? model : undefined);
  const keyCandidate = modelKey || (typeof model === "string" && !model.startsWith("models/") ? model : undefined);
  const selectedModel = resolveModel({
    modelId: idCandidate,
    modelKey: keyCandidate,
    defaultModel: DEFAULT_MODEL,
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemInstruction
        ? { systemInstruction: { role: "system", parts: [{ text: systemInstruction }] } }
        : {}),
      contents: [{ role: "user", parts: [{ text: userPrompt || "" }] }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error("Gemini API error");
    err.statusCode = response.status;
    err.detail = detail;
    throw err;
  }

  return { data: await response.json(), model: selectedModel };
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const {
    action = "analyze",
    prompt = "",
    synthesisPrompt,
    systemInstruction,
    synthesisSystemInstruction,
    model,
    modelId,
    modelKey,
  } = payload;

  try {
    if (action === "synthesize") {
      const synthResult = await callGemini({
        userPrompt: synthesisPrompt || prompt,
        systemInstruction: synthesisSystemInstruction || systemInstruction,
        model,
        modelId,
        modelKey,
      });
      const synthesisCandidates = synthResult.data?.candidates;
      if (!Array.isArray(synthesisCandidates) || synthesisCandidates.length === 0) {
        return {
          statusCode: 502,
          headers: cors(),
          body: JSON.stringify({ error: "Empty response", model: synthResult.model, action }),
        };
      }

      const synthesisParts = synthesisCandidates[0]?.content?.parts;
      const synthesisText = partsToText(synthesisParts);
      if (!synthesisText.trim()) {
        return {
          statusCode: 502,
          headers: cors(),
          body: JSON.stringify({ error: "Empty response", model: synthResult.model, action }),
        };
      }
      const safeSynthesis = ensureString(synthesisText);

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          action,
          result: safeSynthesis,
          modelUsed: synthResult.model,
        }),
      };
    }

    const analyzeResult = await callGemini({
      userPrompt: prompt,
      systemInstruction,
      model,
      modelId,
      modelKey,
    });
    const analyzeCandidates = analyzeResult.data?.candidates;
    if (!Array.isArray(analyzeCandidates) || analyzeCandidates.length === 0) {
      return {
        statusCode: 502,
        headers: cors(),
        body: JSON.stringify({ error: "Empty response", model: analyzeResult.model, action: "analyze" }),
      };
    }

    const analyzeParts = analyzeCandidates[0]?.content?.parts;
    const analyzeText = partsToText(analyzeParts);
    if (!analyzeText.trim()) {
      return {
        statusCode: 502,
        headers: cors(),
        body: JSON.stringify({ error: "Empty response", model: analyzeResult.model, action: "analyze" }),
      };
    }
    const safeAnalyze = ensureString(analyzeText);

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        action: "analyze",
        result: safeAnalyze,
        modelUsed: analyzeResult.model,
      }),
    };
  } catch (err) {
    return {
      statusCode: err?.statusCode || 500,
      headers: cors(),
      body: JSON.stringify({ error: err?.message || "Server error", detail: err?.detail || "" }),
    };
  }
};
