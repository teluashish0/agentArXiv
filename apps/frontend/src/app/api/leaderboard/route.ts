import { NextResponse } from "next/server";
import { getLeaderboardPage } from "@/app/leaderboard-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page"));
  const limit = Number(searchParams.get("limit"));
  const payload = await getLeaderboardPage(page, limit);

  return NextResponse.json(payload);
}
