import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "../types";

interface JobRunnerProps {
  jobId: string | null;
  onComplete: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface JobData {
  status: JobStatus["status"];
  progress: string;
  started_at?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export default function JobRunner({ jobId, onComplete }: JobRunnerProps) {
  const [status, setStatus] = useState<JobStatus["status"] | null>(null);
  const [progress, setProgress] = useState<string>("Starting...");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const completedRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      setProgress("Starting...");
      setError(null);
      setElapsed(0);
      return;
    }

    startTimeRef.current = 0;
    setStatus("running");
    setProgress("Starting...");
    setError(null);
    setElapsed(0);

    if (completedRef.current !== jobId) {
      completedRef.current = null;
    }

    // Elapsed timer — uses server started_at once available
    const timer = setInterval(() => {
      if (startTimeRef.current > 0) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    // Poll job status every 2 seconds
    let cancelled = false;

    async function pollJob() {
      while (!cancelled) {
        try {
          const data = await api.getJob(jobId!) as unknown as JobData;
          if (cancelled) break;

          setStatus(data.status);
          setProgress(data.progress ?? "");
          if (data.error) setError(data.error);
          if (data.started_at && !startTimeRef.current) {
            startTimeRef.current = new Date(data.started_at).getTime();
          }

          const isTerminal = ["completed", "failed", "cancelled"].includes(data.status);
          if (isTerminal) {
            clearInterval(timer);
            if (completedRef.current !== jobId) {
              completedRef.current = jobId;
              onComplete();
            }
            return;
          }
        } catch {
          // Network error — keep polling
        }

        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    pollJob();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId]); // intentionally exclude onComplete to avoid re-triggering

  if (!status) return null;

  const isTerminal = ["completed", "failed", "cancelled"].includes(status);

  return (
    <div className="bg-background border border-border rounded px-3 py-2 text-xs font-mono text-muted-foreground flex items-center gap-2 flex-1 min-w-0">
      {!isTerminal && !error && (
        <svg className="size-3.5 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {error ? (
        <span className="text-destructive flex-1 truncate">{error}</span>
      ) : (
        <span className="flex-1 truncate">{progress}</span>
      )}
      {!isTerminal && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground">
            {elapsed > 0 ? formatElapsed(elapsed) : (
              <svg className="size-3 animate-spin inline" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </span>
          {status === "running" && (
            <Button
              variant="destructive"
              size="xs"
              onClick={() => api.cancelJob(jobId!)}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
