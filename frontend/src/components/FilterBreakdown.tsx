import type { SimulationResult } from "../types";

interface FilterBreakdownProps {
  result: SimulationResult;
}

export default function FilterBreakdown({ result }: FilterBreakdownProps) {
  const showUpload = result.avg_ratio > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-sm">
            <th className="py-2 pr-4">Filter</th>
            <th className="py-2 pr-4 text-right">Torrents</th>
            <th className="py-2 pr-4 text-right">Total GB</th>
            <th className="py-2 pr-4 text-right">Median Size</th>
            <th className="py-2 pr-4 text-right">GB/Day</th>
            {showUpload && <th className="py-2 text-right">Est. Upload</th>}
          </tr>
        </thead>
        <tbody>
          {result.filters_used.map((name) => {
            const stats = result.per_filter_stats[name];
            if (!stats) return null;
            const gbPerDay = result.total_days > 0 ? stats.gb / result.total_days : 0;
            return (
              <tr
                key={name}
                className="border-b border-border text-foreground text-sm"
              >
                <td className="py-2 pr-4 font-medium">{name}</td>
                <td className="py-2 pr-4 text-right">{stats.count.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right">{stats.gb.toFixed(1)}</td>
                <td className="py-2 pr-4 text-right">{stats.median_size.toFixed(2)} GB</td>
                <td className="py-2 pr-4 text-right">{gbPerDay.toFixed(1)}</td>
                {showUpload && (
                  <td className="py-2 text-right">{stats.upload_gb.toFixed(1)} GB</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
