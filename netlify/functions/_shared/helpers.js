const MODEL_ALIASES = {
  simple: "models/gemini-1.5-flash",
  balanced: "models/gemini-2.0-flash",
  pro: "models/gemini-1.5-pro",
  max: "models/gemini-2.5-pro"
};

const ALLOWED_MODELS = new Set(Object.values(MODEL_ALIASES));

function resolveModel({ modelKey, modelId }) {
  if (modelId && ALLOWED_MODELS.has(modelId)) {
    return modelId;
  }
  if (modelKey && MODEL_ALIASES[modelKey]) {
    return MODEL_ALIASES[modelKey];
  }
  if (process.env.DEFAULT_GEMINI_MODEL && ALLOWED_MODELS.has(process.env.DEFAULT_GEMINI_MODEL)) {
    return process.env.DEFAULT_GEMINI_MODEL;
  }
  return MODEL_ALIASES.balanced;
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function mdToHtml(markdown = "") {
  return markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>");
}

module.exports = {
  MODEL_ALIASES,
  ALLOWED_MODELS,
  resolveModel,
  cors,
  mdToHtml
};
