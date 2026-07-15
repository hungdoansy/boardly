"use client";

import { Database, HardDrive } from "lucide-react";
import type { ComponentType } from "react";

import { type StorageBucket, useStorageUsage } from "../../lib/use-storage-usage";

/** Human-readable byte size, e.g. `412 MB`, `1 GB`, `0 B`. Base-1024, informal units. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function Meter({
  icon: Icon,
  label,
  bucket,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  bucket: StorageBucket;
}) {
  const { usedBytes, limitBytes } = bucket;
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const nearCap = ratio >= 0.9;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-fg">
          <Icon className="size-4 text-fg-muted" />
          {label}
        </span>
        <span className="tabular-nums text-fg-muted">
          {formatBytes(usedBytes)} of {formatBytes(limitBytes)}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-label={`${label} storage used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="h-full rounded-full transition-[width] duration-[var(--dur-base)] motion-reduce:transition-none"
          style={{
            width: `${pct}%`,
            backgroundColor: nearCap ? "var(--danger)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

export function StorageSettings() {
  const { data, loading, error } = useStorageUsage();

  if (loading) {
    return (
      <section className="flex max-w-md flex-col gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="h-4 w-40 animate-pulse rounded-[var(--radius-sm)] bg-elevated" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-elevated" />
          </div>
        ))}
      </section>
    );
  }

  if (error || !data) {
    return (
      <p role="alert" className="max-w-md text-sm text-fg-muted">
        Couldn&apos;t load storage usage. Please try again.
      </p>
    );
  }

  return (
    <section className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-fg-muted">
        How much of your local storage Boardly is using. Images pasted into card descriptions count
        toward files.
      </p>
      <Meter icon={Database} label="Database" bucket={data.database} />
      <Meter icon={HardDrive} label="Files" bucket={data.files} />
    </section>
  );
}
