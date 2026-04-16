const defaultChatKitBackendUrl = "http://127.0.0.1:8001";

export function resolveChatKitBackendUrl() {
  return (process.env.AGENTARXIV_CHATKIT_BACKEND_URL || defaultChatKitBackendUrl).replace(/\/$/, "");
}

export function resolveChatKitProxyTarget(pathname: string) {
  return `${resolveChatKitBackendUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function buildChatKitJsonResponse(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export function toChatKitRouteErrorResponse(
  error: unknown,
  fallbackMessage = "Unexpected ChatKit proxy failure",
) {
  if (!(error instanceof Error)) {
    return buildChatKitJsonResponse(500, fallbackMessage);
  }

  const message = error.message.trim() || fallbackMessage;

  if (
    message === "Sign in required" ||
    message === "Missing trusted workspace context secret"
  ) {
    return buildChatKitJsonResponse(401, message);
  }

  if (
    message.startsWith("You do not have access to workspace") ||
    (message.startsWith("Agent ") &&
      message.includes(" is not a member of workspace "))
  ) {
    return buildChatKitJsonResponse(403, message);
  }

  if (message === "fetch failed") {
    return buildChatKitJsonResponse(502, "ChatKit backend is unavailable");
  }

  return buildChatKitJsonResponse(500, message);
}

export async function forwardChatKitRequest(
  request: Request,
  pathname: string,
  extraHeaders?: HeadersInit,
) {
  const targetUrl = resolveChatKitProxyTarget(pathname);
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
  let upstream: Response;

  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        accept: request.headers.get("accept") ?? "application/json",
        ...(extraHeaders ?? {}),
      },
      body,
      cache: "no-store",
    });
  } catch (error) {
    return toChatKitRouteErrorResponse(
      error,
      "ChatKit backend is unavailable",
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentDisposition = upstream.headers.get("content-disposition");
  const contentLength = upstream.headers.get("content-length");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (contentDisposition) {
    headers.set("content-disposition", contentDisposition);
  }

  if (contentLength) {
    headers.set("content-length", contentLength);
  }

  headers.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
