// Netlify Function — diagnostic (Gemini)
// Fournit trois actions: generate (questions), analyze (diagnostic complet) et synthesize (résumé court)

const { cors, partsToText, resolveModel } = require("./_shared/gemini");

const DEFAULT_MODEL = "models/gemini-1.5-flash";

const QUESTION_BANK = [
  {
    id: "vision",
    title: "Vision & sponsoring",
    description: "Clarté de l'objectif et niveau d'engagement des décideurs.",
    allowComment: true,
    commentLabel: "Contexte supplémentaire (optionnel)",
    options: [
      { value: "flou", label: "Vision peu formalisée ou sponsor absent" },
      { value: "partiel", label: "Objectifs en cours de cadrage, sponsor identifié" },
      { value: "aligne", label: "Vision partagée, sponsor engagé et disponible" }
    ]
  },
  {
    id: "data",
    title: "Données disponibles",
    description: "Qualité, accès et gouvernance des données utiles.",
    allowComment: true,
    options: [
      { value: "disperse", label: "Données dispersées ou peu fiables" },
      { value: "partielle", label: "Sources identifiées mais hétérogènes" },
      { value: "qualifiee", label: "Base consolidée avec gouvernance active" }
    ]
  },
  {
    id: "process",
    title: "Processus & exécution",
    description: "Niveau de formalisation des processus impactés par l'IA.",
    allowComment: true,
    options: [
      { value: "ad-hoc", label: "Processus peu formalisés / dépendants des individus" },
      { value: "structure", label: "Processus documentés mais perfectibles" },
      { value: "industrialise", label: "Processus maîtrisés avec indicateurs suivis" }
    ]
  },
  {
    id: "skills",
    title: "Compétences & équipes",
    description: "Disponibilité des compétences data/IA et conduite du changement.",
    allowComment: true,
    options: [
      { value: "limite", label: "Compétences internes limitées" },
      { value: "mixte", label: "Équipe mixte interne/externe" },
      { value: "autonome", label: "Équipe dédiée expérimentée" }
    ]
  },
  {
    id: "governance",
    title: "Gouvernance & priorisation",
    description: "Cadre de décision, priorisation des cas d'usage et pilotage.",
    allowComment: true,
    options: [
      { value: "informel", label: "Décisions opportunistes, gouvernance absente" },
      { value: "emergent", label: "Instances ponctuelles, priorisation partielle" },
      { value: "cadre", label: "Gouvernance claire, arbitrages réguliers" }
    ]
  },
  {
    id: "impact",
    title: "Mesure d'impact",
    description: "Suivi des bénéfices et diffusion des résultats.",
    allowComment: true,
    options: [
      { value: "aucun", label: "Peu ou pas d'indicateurs suivis" },
      { value: "partiel", label: "Indicateurs définis mais usage irrégulier" },
      { value: "suivi", label: "KPIs partagés et suivis régulièrement" }
    ]
  },
  {
    id: "infrastructure",
    title: "Infrastructure & outils",
    description: "Disponibilité des plateformes data / IA et intégration au SI.",
    allowComment: true,
    options: [
      { value: "fragmentee", label: "Outils disparates, intégrations limitées" },
      { value: "en-transition", label: "Socle en cours de modernisation" },
      { value: "industrialisee", label: "Plateforme robuste, intégrée et scalable" }
    ]
  },
  {
    id: "securite",
    title: "Sécurité & conformité",
    description: "Cadre de gestion des risques, conformité et protection des données.",
    allowComment: true,
    options: [
      { value: "non-cadre", label: "Peu de contrôles formalisés" },
      { value: "partiel", label: "Politique définie mais application hétérogène" },
      { value: "maitrise", label: "Cadre robuste, contrôles réguliers et documentés" }
    ]
  },
  {
    id: "culture",
    title: "Culture & adoption",
    description: "Appétence des équipes métiers pour les usages data / IA.",
    allowComment: true,
    options: [
      { value: "sceptique", label: "Résistances fortes, usages isolés" },
      { value: "exploration", label: "Initiatives pilotes, intérêt grandissant" },
      { value: "diffusee", label: "Culture data partagée, initiatives multipliées" }
    ]
  },
  {
    id: "ecosysteme",
    title: "Partenariats & écosystème",
    description: "Mobilisation d'experts externes et d'un réseau d'innovation.",
    allowComment: true,
    options: [
      { value: "limite", label: "Peu de partenaires identifiés" },
      { value: "opportuniste", label: "Recours ponctuel à des partenaires" },
      { value: "structure", label: "Écosystème établi avec collaborations régulières" }
    ]
  }
];

const DEFAULT_INTRO = "Répondez à ce mini-questionnaire pour situer rapidement votre maturité data / IA.";
const DEFAULT_EXPECTATIONS = [
  { title: "Synthèse", description: "1 à 2 phrases qui résument la situation." },
  { title: "Points forts", description: "Ce qui peut être valorisé immédiatement." },
  { title: "Risques / alertes", description: "Points de vigilance à adresser." },
  { title: "Recommandations rapides", description: "3 à 5 actions concrètes sur 30 jours." }
];

const DEFAULT_SYSTEM_INSTRUCTION = `Tu es directeur de mission en cabinet de conseil.
Tu réalises des diagnostics flash de maturité IA.
Tu es factuel, clair, orienté plan d'action.`;

const DEFAULT_ANALYSIS_INSTRUCTION = `Analyse les réponses au mini-diagnostic ci-dessous.
Retourne un texte structuré en Markdown avec :
### Synthèse
- 2 phrases maximum
### Points forts
- Liste de puces
### Risques / alertes
- Liste de puces
### Recommandations rapides
- Liste de puces avec actions concrètes (30-60 jours).
Adapte le ton au format demandé (consulting, executive, detailed).`;

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

const markdownToHtml = (text) => {
  const lines = ensureString(text).split(/\r?\n/);
  const chunks = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      chunks.push("</ul>");
      inList = false;
    }
  };
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        chunks.push("<ul>");
        inList = true;
      }
      chunks.push(`<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`);
      continue;
    }
    closeList();
    if (/^###\s+/.test(line)) {
      chunks.push(`<h3>${line.replace(/^###\s+/, "")}</h3>`);
    } else if (/^##\s+/.test(line)) {
      chunks.push(`<h2>${line.replace(/^##\s+/, "")}</h2>`);
    } else if (/^#\s+/.test(line)) {
      chunks.push(`<h1>${line.replace(/^#\s+/, "")}</h1>`);
    } else if (line.trim() === "") {
      chunks.push("");
    } else {
      chunks.push(`<p>${line}</p>`);
    }
  }
  closeList();
  return chunks.join("");
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
    need = "",
    theme = "",
    tone = "",
    answers = [],
    questions,
    analysisInstruction,
  } = payload;

  try {
    if (action === "generate") {
      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          action,
          intro: DEFAULT_INTRO,
          analysisExpectations: DEFAULT_EXPECTATIONS,
          questions: QUESTION_BANK,
          systemInstruction: ensureString(systemInstruction) || DEFAULT_SYSTEM_INSTRUCTION,
          analysisInstruction: ensureString(analysisInstruction) || DEFAULT_ANALYSIS_INSTRUCTION,
        }),
      };
    }

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

    const effectiveQuestions = Array.isArray(questions) && questions.length ? questions : QUESTION_BANK;
    const normalizedAnswers = Array.isArray(answers) ? answers : [];
    const answerMap = new Map();
    normalizedAnswers.forEach((entry, index) => {
      const id = entry?.id ?? String(index);
      answerMap.set(id, {
        value: ensureString(entry?.value),
        label: ensureString(entry?.label || entry?.value),
        comment: ensureString(entry?.comment),
      });
    });

    const answerLines = effectiveQuestions
      .map((question, index) => {
        const id = question?.id ?? String(index);
        const stored = answerMap.get(id) || {};
        const title = ensureString(question?.title || `Question ${index + 1}`);
        const label = stored.label || "(non renseigné)";
        const base = `${index + 1}. ${title} : ${label}`;
        return stored.comment ? `${base} | Commentaire : ${stored.comment}` : base;
      })
      .join("\n");

    const instructionText = ensureString(analysisInstruction) || ensureString(prompt) || DEFAULT_ANALYSIS_INSTRUCTION;
    const analysisPrompt =
      instructionText +
      "\n\nContexte client :\n" +
      `${ensureString(need) || "(non communiqué)"}\n` +
      `Thème / cadre : ${ensureString(theme) || "Auto-détection"}\n` +
      `Format attendu : ${ensureString(tone) || "consulting"}\n\n` +
      "Réponses du mini-diagnostic :\n" +
      answerLines;

    const analyzeResult = await callGemini({
      userPrompt: analysisPrompt,
      systemInstruction: ensureString(systemInstruction) || DEFAULT_SYSTEM_INSTRUCTION,
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
        resultHtml: markdownToHtml(safeAnalyze),
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
