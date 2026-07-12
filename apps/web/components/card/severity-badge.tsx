import { type SeverityValue, SEVERITY_META } from "@boardly/domain";

import { CHIP } from "./chip";

/**
 * Small `S#` chip in the shared neutral, fully-rounded bordered shell; the
 * severity color rides on the `S#` text itself (semibold), which stays legible
 * for every hue on the elevated card surface.
 */
export function SeverityBadge({ severity }: { severity: SeverityValue }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={`${CHIP} font-semibold`}
      style={{ color: meta.color }}
      title={`Severity: ${meta.name}`}
    >
      {meta.name}
    </span>
  );
}
