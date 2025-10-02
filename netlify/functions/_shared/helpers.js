const MODEL_ALIASES = {
  simple: "models/gemini-1.5-flash",
  balanced: "models/gemini-2.0-flash",
  pro: "models/gemini-1.5-pro",
  max: "models/gemini-2.5-pro",
};

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
});

const ALLOWED_MODELS = new Set(Object.values(MODEL_ALIASES));

const resolveModel = ({ modelKey, modelId } = {}) => {
  if (modelId && ALLOWED_MODELS.has(modelId)) {
    return modelId;
  }

  if (modelKey && MODEL_ALIASES[modelKey]) {
    return MODEL_ALIASES[modelKey];
  }

  const defaultModel = process.env.DEFAULT_GEMINI_MODEL;
  if (defaultModel && ALLOWED_MODELS.has(defaultModel)) {
    return defaultModel;
  }

  return MODEL_ALIASES.balanced;
};

const partsToText = (parts) => {
  if (!parts) return "";
  if (typeof parts === "string") return parts;
  if (!Array.isArray(parts)) {
    return typeof parts?.text === "string" ? parts.text : "";
  }
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
};

const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const wrapListBlocks = (html) =>
  html.replace(/(?:^|\n)((?:<li>.*?<\/li>(?:\n|$))+)/gm, (match, listBlock) => {
    const cleaned = listBlock.replace(/\n/g, "");
    return `<ul>${cleaned}</ul>`;
  });

const mdToHtml = (markdown = "") => {
  const safeMarkdown = escapeHtml(markdown);
  const withHeadings = safeMarkdown.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  const withListItems = withHeadings.replace(/^-\s+(.+)$/gm, "<li>$1</li>");
  const withListsWrapped = wrapListBlocks(withListItems);
  const segments = withListsWrapped.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean);

  return `<div>${segments
    .map((segment) => {
      if (segment.startsWith("<h3>")) {
        return segment;
      }
      if (segment.startsWith("<ul>")) {
        return segment;
      }
      return `<p>${segment.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("")}</div>`;
};

module.exports = {
  MODEL_ALIASES,
  ALLOWED_MODELS,
  resolveModel,
  cors,
  partsToText,
  mdToHtml,
};
