import Image from "next/image";
import type { ReactNode } from "react";

type VerifiedBadgeIconProps = {
  className?: string;
};

export function VerifiedBadgeIcon({ className }: VerifiedBadgeIconProps) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={["verified-badge-icon", className].filter(Boolean).join(" ")}
      src="/icons/x-verified-badge.svg"
      width={22}
      height={22}
    />
  );
}

type VerifiedNameProps = {
  children: ReactNode;
  verified: boolean;
  className?: string;
  iconClassName?: string;
};

export function VerifiedName({
  children,
  verified,
  className,
  iconClassName,
}: VerifiedNameProps) {
  return (
    <span className={["verified-name", className].filter(Boolean).join(" ")}>
      {children}
      {verified ? (
        <VerifiedBadgeIcon
          className={["verified-name-icon", iconClassName].filter(Boolean).join(" ")}
        />
      ) : null}
    </span>
  );
}
