import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "../types";
import { getIdToken } from "../auth/auth";

interface JobRunnerProps {
  jobId: string | null;
  onComplete: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface SSEData {
  status: JobStatus["status"];
  progress: string;
  result?: Record<string, unknown>;
  error?: string;
}

export default function JobRunner({ jobId, onComplete }: JobRunnerProps) {
  const [status, setStatus] = useState<JobStatus["status"] | null>(null);
  const [progress, setProgress] = useState<string>("Starting...");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const completedRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      setProgress("Starting...");
      setError(null);
      setElapsed(0);
      return;
    }

    startTimeRef.current = Date.now();
    setStatus("running");
    setProgress("Starting...");
    setError(null);
    setElapsed(0);

    if (completedRef.current !== jobId) {
      completedRef.current = null;
    }

    // Elapsed timer
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // SSE connection via fetch (supports auth headers unlike EventSource)
    const controller = new AbortController();

    async function connectSSE() {
      const token = getIdToken();
      const headers: Record<string, string> = { 'Accept': 'text/event-stream' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const res = await fetch(`/api/pipeline/jobs/${jobId}/stream`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data: SSEData = JSON.parse(line.slice(6));
              setStatus(data.status);
              setProgress(data.progress ?? '');
              if (data.error) setError(data.error);

              if (eventType === 'complete') {
                clearInterval(timer);
                if (completedRef.current !== jobId) {
                  completedRef.current = jobId;
                  onComplete();
                }
                return;
              }
            }
          }
        }
      } catch {
        // Aborted or network error — ignore
      }
    }

    connectSSE();

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [jobId]); // intentionally exclude onComplete to avoid re-triggering

  if (!status) return null;

  const isTerminal = ["completed", "failed", "cancelled"].includes(status);

  return (
    <div className="mt-3">
      <div className="bg-background border border-border rounded p-3 text-xs font-mono text-muted-foreground flex items-center gap-2">
        {!isTerminal && !error && (
          <svg className="size-3.5 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {error ? (
          <span className="text-destructive flex-1">{error}</span>
        ) : (
          <span className="flex-1">{progress}</span>
        )}
        {!isTerminal && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-muted-foreground">{formatElapsed(elapsed)}</span>
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
    </div>
  );
}
