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

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mdToHtml(markdown = "") {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let listType = null;
  let paragraph = [];

  const closeList = () => {
    if (listType === "ul") {
      html.push("</ul>");
    } else if (listType === "ol") {
      html.push("</ol>");
    }
    listType = null;
  };

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.join(" ")}</p>`);
      paragraph = [];
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      closeList();
      return;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`);
      return;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${escapeHtml(orderedMatch[2])}</li>`);
      return;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
      return;
    }

    closeList();
    paragraph.push(escapeHtml(line.trim()));
  });

  flushParagraph();
  closeList();

  return html.join("");
}

function partsToText(parts) {
  if (Array.isArray(parts)) {
    const texts = parts
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .filter(Boolean);

    if (texts.length) {
      return texts.join("\n");
    }

    const first = parts.find((p) => p && typeof p.text === "string");
    return first ? first.text : "";
  }

  if (parts && typeof parts === "object" && typeof parts.text === "string") {
    return parts.text;
  }

  return "";
}

module.exports = {
  MODEL_ALIASES,
  ALLOWED_MODELS,
  resolveModel,
  cors,
  mdToHtml,
  partsToText
};
