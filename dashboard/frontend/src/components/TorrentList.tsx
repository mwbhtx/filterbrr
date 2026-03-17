import { useState } from "react";
import type { GrabbedTorrent, SkippedTorrent } from "../types";

function GrabbedList({ torrents }: { torrents: GrabbedTorrent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-200">
          Snatched Torrents ({torrents.length})
        </span>
        <span className="text-gray-500 text-xs">{open ? "collapse" : "expand"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-800 max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800 text-left text-xs text-gray-400 uppercase">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 w-24">Size</th>
                <th className="px-4 py-2 w-36">Date</th>
                <th className="px-4 py-2 w-40">Filter</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((t, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200 truncate max-w-0">{t.name}</td>
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{t.size_gb.toFixed(1)} GB</td>
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-2 text-gray-400 truncate max-w-0">{t.filter}</td>
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
    <div className="rounded-lg bg-gray-900 border border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-200">
          Skipped Torrents ({torrents.length})
        </span>
        <span className="text-gray-500 text-xs">{open ? "collapse" : "expand"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-800 max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800 text-left text-xs text-gray-400 uppercase">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 w-24">Size</th>
                <th className="px-4 py-2 w-36">Date</th>
                <th className="px-4 py-2 w-32">Reason</th>
                <th className="px-4 py-2">Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((t, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200 truncate max-w-0">{t.name}</td>
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{t.size_gb.toFixed(1)} GB</td>
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      t.reason === "No filter match"
                        ? "bg-red-900/50 text-red-300 border-red-700"
                        : t.reason === "Rate limited"
                        ? "bg-yellow-900/50 text-yellow-300 border-yellow-700"
                        : "bg-orange-900/50 text-orange-300 border-orange-700"
                    }`}>
                      {t.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">{t.suggestion}</td>
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
