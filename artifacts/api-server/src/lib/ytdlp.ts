import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const COOKIES_FILE = path.join(os.tmpdir(), "yt-cookies.txt");
let cookiesReady = false;
let cookiesChecked = false;

function initCookies(): void {
  if (cookiesChecked) return;
  cookiesChecked = true;
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
  const args: string[] = ["--no-check-certificates"];

  // Proxy support — highest priority bypass method.
  // Set YTDLP_PROXY to any proxy URL, e.g.:
  //   http://user:pass@p.webshare.io:80
  //   socks5://user:pass@proxy.example.com:1080
  const proxy = process.env["YTDLP_PROXY"];
  if (proxy && proxy.trim().length > 0) {
    args.push("--proxy", proxy.trim());
  }

  // Cookie authentication — fallback / extra layer.
  // Set YOUTUBE_COOKIES to raw Netscape cookies.txt content.
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
