import type { SimulationResult } from "../types";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface MetricsBarProps {
  result: SimulationResult;
  loading?: boolean;
}

function CardLoader() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="text-xs text-muted-foreground">Simulating…</span>
    </div>
  );
}

function HintTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex ml-1 align-middle cursor-help">
          <HelpCircle className="size-3 text-primary/50" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">{text}</TooltipContent>
    </Tooltip>
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

export default function MetricsBar({ result, loading = false }: MetricsBarProps) {
  const rateLimited = result.skip_reasons["rate_limited"] ?? 0;
  const storageFull = result.skip_reasons["storage_full"] ?? 0;
  const missed = rateLimited + storageFull;
  const hasMissed = missed > 0;
  const overCapacity = result.steady_state_avg_utilization > 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* 1. Disk Utilization — hero metric */}
      <div className={`rounded-lg p-4 ${
        !loading && overCapacity
          ? "bg-destructive/20 border border-destructive"
          : "bg-card border border-border"
      }`}>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
          Disk Utilization
          {!loading && <HintTooltip text={utilizationHint(result)} />}
        </p>
        {loading ? <CardLoader /> : (
          <>
            <p className={`text-3xl font-bold tracking-tight ${
              overCapacity ? "text-destructive" : "text-foreground"
            }`}>
              {result.steady_state_avg_utilization.toFixed(1)}%
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {result.steady_state_avg_disk_gb.toFixed(1)} / {result.max_storage_gb.toFixed(1)} GB
            </p>
          </>
        )}
      </div>

      {/* 2. Transfer — upload + download combined */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Transfer</p>
        {loading ? <CardLoader /> : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground/70 mb-0.5">
                Upload /mo
                <HintTooltip text={uploadHint(result)} />
              </p>
              <p className="text-lg font-bold text-foreground">
                {(() => {
                  const monthlyGb = result.steady_state_daily_upload_gb * 30;
                  return monthlyGb >= 1024
                    ? `${(monthlyGb / 1024).toFixed(1)} TB`
                    : `${monthlyGb.toFixed(1)} GB`;
                })()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {result.steady_state_daily_upload_gb.toFixed(1)} GB/day
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground/70 mb-0.5">
                Download /mo
                <HintTooltip text={downloadHint(result)} />
              </p>
              <p className="text-lg font-bold text-foreground">
                {result.total_days > 0
                  ? (() => {
                      const monthlyGb = (result.total_grabbed_gb / result.total_days) * 30;
                      return monthlyGb >= 1024
                        ? `${(monthlyGb / 1024).toFixed(1)} TB`
                        : `${monthlyGb.toFixed(1)} GB`;
                    })()
                  : "0 GB"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                ratio {result.avg_ratio}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Grab Performance — grabbed + missed combined */}
      <div className={`rounded-lg p-4 ${
        !loading && hasMissed
          ? "bg-destructive/10 border border-destructive/50"
          : "bg-card border border-border"
      }`}>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Grab Performance</p>
        {loading ? <CardLoader /> : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground/70 mb-0.5">
                Grabbed
                <HintTooltip text={grabHint(result)} />
              </p>
              <p className="text-lg font-bold text-foreground">
                {result.total_grabbed.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/{result.total_seen.toLocaleString()}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {result.grab_rate_pct.toFixed(1)}% rate
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground/70 mb-0.5">
                Missed
                <HintTooltip text={missedHint(result)} />
              </p>
              <p className={`text-lg font-bold ${hasMissed ? "text-destructive" : "text-foreground"}`}>
                {missed.toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {storageFull > 0 && `${storageFull.toLocaleString()} storage`}
                {storageFull > 0 && rateLimited > 0 && " · "}
                {rateLimited > 0 && `${rateLimited.toLocaleString()} rate limited`}
                {missed === 0 && "None missed"}
              </p>
              {result.blackout_days > 0 && (
                <p className="text-[10px] text-destructive/70 mt-0.5">
                  {result.blackout_days} blackout day{result.blackout_days !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
