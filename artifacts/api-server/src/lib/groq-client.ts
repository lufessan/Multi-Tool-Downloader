import Groq from "groq-sdk";

export const groq = new Groq({
  apiKey: process.env["GROQ_API_KEY"] ?? "",
});

export const TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
export const VISION_MODEL = "llama-3.2-90b-vision-preview";
export const TEXT_MODEL = "llama-3.1-8b-instant";

export function isGroqAvailable(): boolean {
  return !!(process.env["GROQ_API_KEY"]);
}
