import { useState, useEffect, useRef } from "react";

/**
 * Returns a simulated progress percentage (0–100).
 * Uses an exponential curve: fast at first, slows towards 95%.
 * Snaps to 100% when `running` becomes false, then resets.
 *
 * @param running  - whether the operation is in progress
 * @param tau      - time constant in seconds (lower = faster rise)
 */
export function useSimulatedProgress(running: boolean, tau = 18): number {
  const [pct, setPct] = useState(0);
  const pctRef = useRef(0);

  useEffect(() => {
    if (!running) {
      if (pctRef.current > 0) {
        setPct(100);
        pctRef.current = 100;
        const t = setTimeout(() => {
          setPct(0);
          pctRef.current = 0;
        }, 700);
        return () => clearTimeout(t);
      }
      return;
    }

    setPct(1);
    pctRef.current = 1;
    const start = Date.now();

    const id = setInterval(() => {
      const t = (Date.now() - start) / 1000;
      const p = Math.min(95, Math.max(1, Math.round(95 * (1 - Math.exp(-t / tau)))));
      setPct(p);
      pctRef.current = p;
    }, 120);

    return () => clearInterval(id);
  }, [running, tau]);

  return pct;
}
