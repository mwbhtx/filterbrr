import type { SimulationResult } from "../types";

interface MetricsBarProps {
  result: SimulationResult;
}

function TuningHint({ text }: { text: string }) {
  return (
    <p className="text-xs text-blue-400/70 mt-2 leading-snug border-t border-gray-800 pt-2">
      {text}
    </p>
  );
}

function grabHint(result: SimulationResult): string {
  const { skip_reasons, grab_rate_pct } = result;
  const noMatch = skip_reasons["no_match"] ?? 0;
  const rateLimited = skip_reasons["rate_limited"] ?? 0;
  const storageFull = skip_reasons["storage_full"] ?? 0;
  const total = noMatch + rateLimited + storageFull;
  if (total === 0) return "All torrents matched. Narrow filters to be more selective.";
  const topReason =
    storageFull >= rateLimited && storageFull >= noMatch
      ? "storage"
      : rateLimited >= noMatch
        ? "rate_limit"
        : "no_match";
  if (topReason === "no_match")
    return grab_rate_pct < 5
      ? "Very few matches. Broaden resolutions, sources, or categories."
      : "Widen size range or add more resolutions/sources to grab more.";
  if (topReason === "rate_limit")
    return "Rate limited. Raise max downloads or switch unit to HOUR.";
  return "Storage full. Increase storage, shorten seed days, or tighten size limits.";
}

function downloadHint(result: SimulationResult): string {
  const avgSizeGb =
    result.total_grabbed > 0
      ? result.total_grabbed_gb / result.total_grabbed
      : 0;
  if (avgSizeGb > 15)
    return "Large avg torrent size. Lower max size or exclude 4K/remux to reduce volume.";
  if (avgSizeGb < 2)
    return "Small avg torrent size. Raise min size or add higher resolutions for larger grabs.";
  return "Adjust min/max size to shift download volume up or down.";
}

function utilizationHint(result: SimulationResult): string {
  const util = result.steady_state_avg_utilization;
  if (util > 90)
    return "Near capacity. Increase storage, reduce seed days, or tighten size limits.";
  if (util < 40)
    return "Underutilized. Extend seed days, raise max downloads, or broaden filters.";
  return "Balanced. Fine-tune seed days or storage to shift utilization.";
}

function missedHint(result: SimulationResult): string {
  const { skip_reasons } = result;
  const rateLimited = skip_reasons["rate_limited"] ?? 0;
  const storageFull = skip_reasons["storage_full"] ?? 0;
  void (skip_reasons["no_match"] ?? 0);
  const total = rateLimited + storageFull;
  if (total === 0) return "No matched torrents were missed. Filters are well-tuned.";
  const topReason =
    storageFull >= rateLimited ? "storage" : "rate_limit";
  if (topReason === "storage")
    return "Most misses from full storage. Shorten seed days or increase storage.";
  return "Most misses from rate limits. Raise max downloads or widen the window.";
}

function uploadHint(result: SimulationResult): string {
  const daily = result.steady_state_daily_upload_gb;
  if (daily < 5)
    return "Low upload. Grab more popular torrents (higher priority) or extend seed days.";
  return "Raise avg ratio estimate or extend seed days to increase upload projection.";
}

export default function MetricsBar({ result }: MetricsBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Grabbed */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-400">Grabbed</p>
        <p className="text-2xl font-bold text-white">
          {result.total_grabbed.toLocaleString()} / {result.total_seen.toLocaleString()}
        </p>
        <p className="text-sm text-gray-500">{result.grab_rate_pct.toFixed(1)}% grab rate</p>
        <TuningHint text={grabHint(result)} />
      </div>

      {/* Monthly Download */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-400">Monthly Download</p>
        <p className="text-2xl font-bold text-white">
          {result.total_days > 0
            ? `${((result.total_grabbed_gb / result.total_days) * 30).toFixed(1)} GB`
            : "0 GB"}
        </p>
        <p className="text-sm text-gray-500">
          {result.total_grabbed_gb.toFixed(1)} GB over {result.total_days} days
        </p>
        <TuningHint text={downloadHint(result)} />
      </div>

      {/* Avg. Disk Utilization */}
      <div className={`rounded-lg p-4 ${
        result.steady_state_avg_utilization > 100
          ? "bg-red-900/40 border border-red-700"
          : "bg-gray-900 border border-gray-800"
      }`}>
        <p className="text-sm text-gray-400">Avg. Disk Utilization</p>
        <p className={`text-2xl font-bold ${
          result.steady_state_avg_utilization > 100 ? "text-red-300" : "text-white"
        }`}>
          {result.steady_state_avg_utilization.toFixed(1)}%
        </p>
        <p className="text-sm text-gray-500">
          {result.steady_state_avg_disk_gb.toFixed(1)} / {result.max_storage_gb.toFixed(1)} GB
        </p>
        <TuningHint text={utilizationHint(result)} />
      </div>

      {/* Missed Torrents */}
      {(() => {
        const rateLimited = result.skip_reasons["rate_limited"] ?? 0;
        const storageFull = result.skip_reasons["storage_full"] ?? 0;
        const missed = rateLimited + storageFull;
        const hasMissed = missed > 0;
        return (
          <div className={`rounded-lg p-4 ${
            hasMissed
              ? "bg-red-900/40 border border-red-700"
              : "bg-gray-900 border border-gray-800"
          }`}>
            <p className="text-sm text-gray-400">Missed Torrents</p>
            <p className={`text-2xl font-bold ${
              hasMissed ? "text-red-300" : "text-white"
            }`}>{missed.toLocaleString()}</p>
            <p className="text-sm text-gray-500">
              {storageFull > 0 && `${storageFull.toLocaleString()} storage`}
              {storageFull > 0 && rateLimited > 0 && " · "}
              {rateLimited > 0 && `${rateLimited.toLocaleString()} rate limited`}
              {missed === 0 && "No matched torrents missed"}
            </p>
            {result.blackout_days > 0 && (
              <p className="text-xs text-red-400/70 mt-1">
                {result.blackout_days} blackout day{result.blackout_days !== 1 ? "s" : ""}
              </p>
            )}
            <TuningHint text={missedHint(result)} />
          </div>
        );
      })()}

      {/* Estimated Monthly Upload */}
      {result.avg_ratio > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Monthly Upload</p>
          <p className="text-2xl font-bold text-white">
            {(() => {
              const monthlyGb = result.steady_state_daily_upload_gb * 30;
              return monthlyGb >= 1024
                ? `${(monthlyGb / 1024).toFixed(1)} TB`
                : `${monthlyGb.toFixed(1)} GB`;
            })()}
          </p>
          <p className="text-sm text-gray-500">
            {result.steady_state_daily_upload_gb.toFixed(1)} GB/day (ratio {result.avg_ratio})
          </p>
          <TuningHint text={uploadHint(result)} />
        </div>
      )}
    </div>
  );
}
