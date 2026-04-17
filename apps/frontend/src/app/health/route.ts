import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "agentarxiv-frontend",
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
