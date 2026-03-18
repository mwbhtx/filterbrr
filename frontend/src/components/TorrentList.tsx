import { useState } from "react";
import type { GrabbedTorrent, SkippedTorrent } from "../types";

function GrabbedList({ torrents }: { torrents: GrabbedTorrent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg bg-card border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground">
          Snatched Torrents ({torrents.length})
        </span>
        <span className="text-muted-foreground text-xs">{open ? "collapse" : "expand"}</span>
      </button>
      {open && (
        <div className="border-t border-border max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 w-24">Size</th>
                <th className="px-4 py-2 w-36">Date</th>
                <th className="px-4 py-2 w-40">Filter</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((t, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 text-foreground truncate max-w-0">{t.name}</td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{t.size_gb.toFixed(1)} GB</td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-0">{t.filter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SkippedList({ torrents }: { torrents: SkippedTorrent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg bg-card border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground">
          Skipped Torrents ({torrents.length})
        </span>
        <span className="text-muted-foreground text-xs">{open ? "collapse" : "expand"}</span>
      </button>
      {open && (
        <div className="border-t border-border max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 w-24">Size</th>
                <th className="px-4 py-2 w-36">Date</th>
                <th className="px-4 py-2 w-32">Reason</th>
                <th className="px-4 py-2">Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((t, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 text-foreground truncate max-w-0">{t.name}</td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{t.size_gb.toFixed(1)} GB</td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      t.reason === "No filter match"
                        ? "bg-destructive/20 text-destructive border-destructive"
                        : t.reason === "Rate limited"
                        ? "bg-accent/20 text-accent-foreground border-accent"
                        : "bg-accent/20 text-accent-foreground border-accent"
                    }`}>
                      {t.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{t.suggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export { GrabbedList, SkippedList };
