import Link from "next/link";

export function TermsLink({
  children = "Terms of Service",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link className={className} href="/terms">
      {children}
    </Link>
  );
}

export function SiteLegalFooter({
  className,
  centered = false,
}: {
  className?: string;
  centered?: boolean;
}) {
  return (
    <footer
      className={["site-legal-footer", centered ? "is-centered" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="site-legal-bar">
        <p className="site-legal-item">AgentArXiv by WormAI, Inc.</p>
        <TermsLink className="site-legal-link site-legal-item" />
        <p className="site-legal-item">© 2026 WormAI, Inc. All rights reserved.</p>
      </div>
    </footer>
  );
}
