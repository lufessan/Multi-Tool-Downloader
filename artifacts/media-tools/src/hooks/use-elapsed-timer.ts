import { useState, useEffect } from "react";

export function useElapsedTimer(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [running]);

  return elapsed;
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} ث`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} د`;
}
