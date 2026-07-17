import express from "express";
import "dotenv/config";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const app = express();

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const AUDIO_MODEL = process.env.OPENAI_AUDIO_MODEL || "gpt-4o-mini-tts";
const TTS_FALLBACK_MODEL = process.env.OPENAI_TTS_FALLBACK_MODEL || "tts-1-hd";
const DEFAULT_VOICE = process.env.DEFAULT_VOICE || "marin";
const ACCESS_CODE = String(process.env.DEMO_ACCESS_CODE || "").trim();
const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const BUILTIN_VOICES = [
  "marin", "cedar", "coral", "sage", "verse", "alloy",
  "ash", "ballad", "echo", "fable", "nova", "onyx", "shimmer"
];

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: "24kb" }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false
}));

const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false
});

const speechLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false
});

function cleanCode(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasAccess(req) {
  if (!ACCESS_CODE) return true;
  return cleanCode(req.get("x-demo-access-code")) === ACCESS_CODE;
}

function requireAccess(req, res, next) {
  if (!hasAccess(req)) return res.status(401).json({ error: "Access code required." });
  next();
}

function requireOpenAI(req, res, next) {
  if (!openai) return res.status(503).json({ error: "The server has no OPENAI_API_KEY configured." });
  next();
}

function asInteger(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return n;
}

function normaliseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateGeneratedMessage(text, advice, lo, hi) {
  const value = String(text || "").trim().replace(/^['\"]|['\"]$/g, "");
  const words = value.split(/\s+/).filter(Boolean);
  const requiredEnding = `My estimate is ${advice}.`;
  const numerals = [...value.matchAll(/\b\d+\b/g)].map((m) => Number(m[0]));
  const allowed = new Set([advice, lo, hi]);
  const validNumbers = numerals.every((n) => allowed.has(n));
  const okay = value.length > 0 && value.length <= 240 && words.length <= 34 &&
    value.endsWith(requiredEnding) && validNumbers && !/\bAs an AI\b/i.test(value);
  if (!okay) throw new Error("Generated wording failed validation.");
  return value;
}

function sanitiseHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-4).map((row) => ({
    trial: asInteger(row?.trial, "history trial", 1, 200),
    mid: asInteger(row?.mid, "history estimate", 1, 200),
    truth: asInteger(row?.truth, "history truth", 1, 200)
  }));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, openaiConfigured: Boolean(openai) });
});

app.get("/api/config", (_req, res) => {
  res.json({
    accessRequired: Boolean(ACCESS_CODE),
    openaiConfigured: Boolean(openai),
    textModel: TEXT_MODEL,
    audioModel: AUDIO_MODEL,
    fallbackModel: TTS_FALLBACK_MODEL,
    defaultVoice: BUILTIN_VOICES.includes(DEFAULT_VOICE) ? DEFAULT_VOICE : "marin",
    voices: BUILTIN_VOICES
  });
});

app.post("/api/unlock", (req, res) => {
  if (!ACCESS_CODE) return res.json({ ok: true });
  if (cleanCode(req.body?.code) !== ACCESS_CODE) {
    return res.status(401).json({ error: "That access code is not correct." });
  }
  res.json({ ok: true });
});

app.post("/api/message", messageLimiter, requireAccess, requireOpenAI, async (req, res) => {
  try {
    const stance = req.body?.stance;
    if (!['affirm', 'challenge'].includes(stance)) throw new Error("Invalid stance.");
    const advice = asInteger(req.body?.advice, "advice", 1, 200);
    const lo = asInteger(req.body?.lo, "lower bound", 1, 200);
    const hi = asInteger(req.body?.hi, "upper bound", 1, 200);
    if (lo > hi) throw new Error("Lower bound cannot exceed upper bound.");
    const history = sanitiseHistory(req.body?.history);

    const stanceInstruction = stance === "affirm"
      ? "AFFIRMING: warmly validate the participant's judgement. Do not criticise or imply that they performed poorly."
      : "CHALLENGING: politely but clearly dispute the participant's range. Do not soften the message into agreement.";

    const historyText = history.length
      ? history.map((r) => `trial ${r.trial}: estimate ${r.mid}, correct answer ${r.truth}`).join("; ")
      : "No prior trials are available.";

    const response = await openai.responses.create({
      model: TEXT_MODEL,
      store: false,
      max_output_tokens: 120,
      instructions: `You write one short advisor message for a behavioural perception experiment.
Rules:
- Use one or two sentences and at most 30 words.
- Use plain, natural conversational English.
- Do not use emoji, quotation marks, headings, or meta-commentary.
- End with this exact sentence: "My estimate is ${advice}."
- Do not change, hedge, or qualify that number.
- Other numerals may only be ${lo} or ${hi}.
- Never mention the experimental condition or the correct answer.
- Output only the message.`,
      input: `Participant range: ${lo} to ${hi}.
Required stance: ${stanceInstruction}
Prior completed trials: ${historyText}
You may briefly reference a genuine prior tendency only when it naturally fits the required stance.`
    });

    const text = validateGeneratedMessage(response.output_text, advice, lo, hi);
    res.json({ text, source: "openai", model: TEXT_MODEL, kind: `openai-${stance}` });
  } catch (error) {
    console.error("message generation failed:", error?.message || error);
    res.status(502).json({ error: "Live wording was unavailable." });
  }
});

app.post("/api/speech", speechLimiter, requireAccess, requireOpenAI, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text || text.length > 500) throw new Error("Invalid speech text.");
    const voice = BUILTIN_VOICES.includes(req.body?.voice) ? req.body.voice : DEFAULT_VOICE;

    try {
      const speech = await openai.audio.speech.create({
        model: AUDIO_MODEL,
        voice,
        input: text,
        instructions: "Speak in natural, calm, conversational English at a measured pace. Sound attentive and human-like but emotionally restrained. Keep pitch, energy, emphasis, and warmth consistent regardless of whether the sentence is supportive or challenging. Read the text exactly as written without adding or removing words.",
        response_format: "mp3",
        speed: 0.96
      });
      const buffer = Buffer.from(await speech.arrayBuffer());
      if (!buffer.length) throw new Error("Audio model returned no audio.");
      return res.json({
        audioBase64: buffer.toString("base64"),
        mimeType: "audio/mpeg",
        transcript: text,
        voice,
        model: AUDIO_MODEL,
        source: "openai-tts"
      });
    } catch (primaryError) {
      console.warn("Primary audio model failed; using TTS fallback:", primaryError?.message || primaryError);
      const fallbackVoices = new Set(["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]);
      const fallbackVoice = fallbackVoices.has(voice) ? voice : "coral";
      const speech = await openai.audio.speech.create({
        model: TTS_FALLBACK_MODEL,
        voice: fallbackVoice,
        input: text,
        response_format: "mp3",
        speed: 0.96
      });
      const buffer = Buffer.from(await speech.arrayBuffer());
      return res.json({
        audioBase64: buffer.toString("base64"),
        mimeType: "audio/mpeg",
        transcript: text,
        voice: fallbackVoice,
        model: TTS_FALLBACK_MODEL,
        source: "openai-tts-fallback"
      });
    }
  } catch (error) {
    console.error("speech generation failed:", error?.message || error);
    res.status(502).json({ error: "Spoken advice was unavailable." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error);
  res.status(500).json({ error: "Unexpected server error." });
});

export default app;
