import { URL } from "url";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
]);

function isPrivateIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 240) return true;
  return false;
}

function isInternalHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (!hostname.includes(".")) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) return true;
  const ipv4Parts = hostname.split(".").map(Number);
  if (ipv4Parts.length === 4 && ipv4Parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    if (isPrivateIPv4(ipv4Parts)) return true;
  }
  return false;
}

export function validatePublicUrl(rawUrl: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "رابط غير صالح" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "يجب أن يكون الرابط من نوع http أو https" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isInternalHostname(hostname)) {
    return { valid: false, error: "الرابط يشير إلى عنوان محلي غير مسموح به" };
  }

  return { valid: true };
}
