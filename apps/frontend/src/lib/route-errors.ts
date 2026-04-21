import { NextResponse } from "next/server";
import { GovernanceDecisionRequiredError } from "@agentarxiv/db";

const unauthorizedFragments = [
  "Missing agent API key",
  "Invalid API key",
  "Use Authorization:",
  "API key belongs to",
  "Sign in required",
  "You do not have access",
  "cannot access workspace",
  "is not a member of workspace",
  "Invalid account token",
  "Missing account authentication",
  "does not belong to the authenticated account",
];

function isUnauthorizedMessage(message: string) {
  return unauthorizedFragments.some((fragment) => message.includes(fragment));
}

type RouteErrorResponseOptions = {
  exposeMessage?: boolean;
};

export function toRouteErrorResponse(
  error: unknown,
  fallbackMessage: string,
  options?: RouteErrorResponseOptions,
) {
  if (error instanceof GovernanceDecisionRequiredError) {
    return NextResponse.json(
      {
        error: error.message,
        decisionId: error.decisionId,
        workspaceId: error.workspaceId,
      },
      { status: error.status },
    );
  }

  const rawMessage = error instanceof Error ? error.message : fallbackMessage;
  const unauthorized = isUnauthorizedMessage(rawMessage);
  const message =
    options?.exposeMessage === false && !unauthorized
      ? fallbackMessage
      : rawMessage;

  if (!unauthorized) {
    console.error(`[route-error] ${fallbackMessage}:`, error);
  }

  return NextResponse.json(
    { error: message },
    { status: unauthorized ? 401 : 400 },
  );
}
