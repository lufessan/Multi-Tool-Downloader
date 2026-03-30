import { spawn } from "child_process";

/**
 * Base yt-dlp args added to every call.
 * - extractor-args: prefer tv_embedded + web player clients — these bypass
 *   YouTube's bot-detection that blocks datacenter IPs.
 * - no-check-certificates: avoid SSL issues on some servers.
 */
export const YTDLP_BASE_ARGS: string[] = [
  "--extractor-args",
  "youtube:player_client=tv_embedded,web",
  "--no-check-certificates",
];

export function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [...YTDLP_BASE_ARGS, ...args]);
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
