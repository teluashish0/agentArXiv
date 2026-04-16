function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function isGoogleSignInEnabled() {
  return parseBooleanEnv(process.env.NEXT_PUBLIC_AGENTARXIV_ENABLE_GOOGLE_SIGN_IN, true);
}
