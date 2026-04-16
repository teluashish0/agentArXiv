const SUPPORT_EMAIL = "teluashish@gmail.com";
const SUPPORT_GMAIL_COMPOSE_URL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}`;

type SupportErrorMessageProps = {
  className?: string;
};

export function SupportErrorMessage({ className }: SupportErrorMessageProps) {
  return (
    <p className={className}>
      Error! Please contact{" "}
      <a href={SUPPORT_GMAIL_COMPOSE_URL} rel="noreferrer" target="_blank">
        {SUPPORT_EMAIL}
      </a>{" "}
      for support.
    </p>
  );
}
