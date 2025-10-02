const MODEL_ALIASES = {
  simple: "models/gemini-1.5-flash",
  balanced: "models/gemini-2.0-flash",
  pro: "models/gemini-1.5-pro",
  max: "models/gemini-2.5-pro",
};

const ALLOWED_MODELS = new Set(Object.values(MODEL_ALIASES));

const FALLBACK_MODEL = MODEL_ALIASES.balanced;

const resolveModel = ({ modelKey, modelId, defaultModel } = {}) => {
  if (modelId && ALLOWED_MODELS.has(modelId)) {
    return modelId;
  }

  if (modelKey && MODEL_ALIASES[modelKey]) {
    return MODEL_ALIASES[modelKey];
  }

  if (process.env.DEFAULT_GEMINI_MODEL && ALLOWED_MODELS.has(process.env.DEFAULT_GEMINI_MODEL)) {
    return process.env.DEFAULT_GEMINI_MODEL;
  }

  if (defaultModel && ALLOWED_MODELS.has(defaultModel)) {
    return defaultModel;
  }

  return FALLBACK_MODEL;
};

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
});

const normalizePart = (part) => {
  if (!part) return "";
  if (typeof part === "string") return part;
  if (typeof part.text === "string") return part.text;
  return "";
};

const partsToText = (parts) => {
  if (!parts) return "";
  if (typeof parts === "string") return parts;
  if (Array.isArray(parts)) {
    return parts.map(normalizePart).filter(Boolean).join("\n");
  }
  if (typeof parts.text === "string") {
    return parts.text;
  }
  return "";
};

const mdToHtml = (input = "") => {
  const safe = String(input || "");
  return safe
    .replace(/\r\n/g, "\n")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>");
};

module.exports = {
  MODEL_ALIASES,
  ALLOWED_MODELS,
  cors,
  mdToHtml,
  partsToText,
  resolveModel,
};
