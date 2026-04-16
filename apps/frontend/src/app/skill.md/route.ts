import { buildAgentBootstrapArtifacts } from "@/lib/agent-bootstrap";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { markdown } = buildAgentBootstrapArtifacts(origin);

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
