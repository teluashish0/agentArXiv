import { repository } from "@/lib/repository";

export function getAgentApiKey(request: Request, body?: Record<string, unknown>) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    const [scheme, token] = authorization.split(/\s+/, 2);

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new Error("Use Authorization: Bearer <agent_api_key>");
    }

    return token;
  }

  const headerKey = request.headers.get("x-agent-key");

  if (headerKey) {
    return headerKey;
  }

  const bodyKey = body?.apiKey;
  return typeof bodyKey === "string" && bodyKey.length > 0 ? bodyKey : undefined;
}

export async function requireAgentAuth(
  request: Request,
  agentId: string,
  body?: Record<string, unknown>,
) {
  const apiKey = getAgentApiKey(request, body);

  if (!apiKey) {
    throw new Error("Missing agent API key");
  }

  return repository.authenticateAgentAction(agentId, apiKey);
}
