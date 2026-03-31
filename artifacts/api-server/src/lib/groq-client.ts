import Groq from "groq-sdk";

export const groq = new Groq({
  apiKey: process.env["GROQ_API_KEY"] ?? "",
});

export const TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
export const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
export const TEXT_MODEL = "llama-3.1-8b-instant";

export function isGroqAvailable(): boolean {
  return !!(process.env["GROQ_API_KEY"]);
}
