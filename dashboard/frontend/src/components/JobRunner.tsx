import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
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

export default function JobRunner({ jobId, onComplete }: JobRunnerProps) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);
  const completedRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!jobId) { setJob(null); setElapsed(0); return; }

    startTimeRef.current = Date.now();
    if (completedRef.current !== jobId) {
      completedRef.current = null;
    }

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(jobId);
        setJob(status);
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        if (status.status !== "running") {
          clearInterval(pollInterval);
          if (completedRef.current !== jobId) {
            completedRef.current = jobId;
            onComplete();
          }
        }
      } catch {
        clearInterval(pollInterval);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [jobId]); // intentionally exclude onComplete to avoid re-triggering

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.output.length]);

  if (!job) return null;

  const lineCount = job.output.length;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          job.status === "running" ? "bg-yellow-900 text-yellow-300" :
          job.status === "completed" ? "bg-green-900 text-green-300" :
          "bg-red-900 text-red-300"
        }`}>
          {job.status}
        </span>
        <span className="text-xs text-gray-500 font-mono truncate">{job.command}</span>
        <span className="text-xs text-gray-600 ml-auto shrink-0">
          {formatElapsed(elapsed)} · {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
      </div>
      <pre
        ref={logRef}
        className="bg-gray-950 border border-gray-800 rounded p-3 text-xs font-mono text-gray-400 max-h-64 overflow-y-auto whitespace-pre-wrap"
      >
        {job.output.join("\n") || "Waiting for output..."}
      </pre>
    </div>
  );
}
