/**
 * LLM integration for:
 *   1. Pre-visit summary  -> urgency level, chief complaint, suggested questions (structured JSON)
 *   2. Post-visit summary -> patient-friendly explanation of clinical notes + medication schedule
 *
 * Design notes (see SYSTEM_DESIGN.md for more):
 *  - We always ask the model to return STRICT JSON so the API layer can parse and store
 *    structured fields (urgency) alongside free text.
 *  - Every call is wrapped so a network error, timeout, or malformed JSON response
 *    NEVER crashes the request. Callers get a safe fallback object with `failed: true`
 *    and the appointment is still created/updated; a background job can retry generation.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const TIMEOUT_MS = 15000;

async function callAnthropic(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API returned status ${response.status}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    return textBlock ? textBlock.text : "";
  } finally {
    clearTimeout(timeout);
  }
}

function safeParseJSON(raw) {
  // Model may wrap JSON in ```json fences despite instructions; strip defensively.
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * @param {string} symptomText - patient-entered symptoms
 * @returns {Promise<{urgency: 'Low'|'Medium'|'High', chiefComplaint: string, questions: string[], failed?: boolean}>}
 */
async function generatePreVisitSummary(symptomText) {
  const prompt = `Analyse these symptoms and return ONLY a JSON object (no markdown, no preamble) with keys:
"urgency" (one of "Low", "Medium", "High"), "chiefComplaint" (short string), "questions" (array of exactly 3 short suggested questions for the doctor to ask).
Symptoms: ${symptomText}`;

  try {
    const raw = await callAnthropic(prompt);
    const parsed = safeParseJSON(raw);
    if (!parsed.urgency || !parsed.chiefComplaint || !Array.isArray(parsed.questions)) {
      throw new Error("Malformed LLM response shape");
    }
    return parsed;
  } catch (err) {
    console.error("[llmService] pre-visit summary failed:", err.message);
    // Graceful fallback: doctor still sees the raw symptoms and a neutral urgency flag
    // rather than the booking flow breaking.
    return {
      urgency: "Medium",
      chiefComplaint: symptomText.slice(0, 140),
      questions: [
        "Can you describe when the symptoms started?",
        "Have you taken any medication for this already?",
        "Are there any other symptoms you haven't mentioned?",
      ],
      failed: true,
    };
  }
}

/**
 * @param {string} clinicalNotes - doctor's raw notes + prescription
 * @returns {Promise<{summary: string, medicationSchedule: string[], followUp: string, failed?: boolean}>}
 */
async function generatePostVisitSummary(clinicalNotes) {
  const prompt = `Convert these clinical notes into a patient-friendly summary. Return ONLY a JSON object (no markdown) with keys:
"summary" (2-4 plain-language sentences explaining the diagnosis/visit outcome),
"medicationSchedule" (array of short strings, one per medication with dose/timing),
"followUp" (short string describing next steps or follow-up date).
Clinical notes: ${clinicalNotes}`;

  try {
    const raw = await callAnthropic(prompt);
    const parsed = safeParseJSON(raw);
    if (!parsed.summary || !Array.isArray(parsed.medicationSchedule)) {
      throw new Error("Malformed LLM response shape");
    }
    return parsed;
  } catch (err) {
    console.error("[llmService] post-visit summary failed:", err.message);
    return {
      summary: "Your doctor has recorded notes from your visit. Please see the details below or contact the clinic for clarification.",
      medicationSchedule: [],
      followUp: "Please follow up with the clinic if symptoms persist or worsen.",
      failed: true,
    };
  }
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
