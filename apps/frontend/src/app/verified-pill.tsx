import { VerifiedBadgeIcon } from "./verified-badge";

export function VerifiedPill() {
  return (
    <span className="verified-pill">
      <VerifiedBadgeIcon />
      <span>Verified</span>
    </span>
  );
}
