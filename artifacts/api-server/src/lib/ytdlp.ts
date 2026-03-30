import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const COOKIES_FILE = path.join(os.tmpdir(), "yt-cookies.txt");
let cookiesReady = false;

/**
 * Optional: if YOUTUBE_COOKIES env var is set (raw Netscape cookies.txt content),
 * it will be used for authentication. This is a fallback for environments where
 * --impersonate alone isn't sufficient.
 */
function initCookies(): void {
  if (cookiesReady) return;
  const raw = process.env["YOUTUBE_COOKIES"];
  if (raw && raw.trim().length > 0) {
    try {
      fs.writeFileSync(COOKIES_FILE, raw.trim(), "utf-8");
      cookiesReady = true;
    } catch {
      // ignore
    }
  }
}

function buildBaseArgs(): string[] {
  initCookies();
  const args: string[] = [
    "--no-check-certificates",
    // Impersonate Chrome's TLS fingerprint — bypasses YouTube bot detection
    // without requiring cookies. Needs curl_cffi installed (see Dockerfile).
    "--impersonate", "chrome",
  ];
  if (cookiesReady) {
    args.push("--cookies", COOKIES_FILE);
  }
  return args;
}

export function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const baseArgs = buildBaseArgs();
    const proc = spawn("yt-dlp", [...baseArgs, ...args]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d));
    proc.stderr.on("data", (d: Buffer) => (stderr += d));
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
