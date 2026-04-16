import { NextResponse } from "next/server";
import { getExplorePaperDetail } from "@/app/paper-detail-model";

export async function GET(
  _: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    const { paperId } = await context.params;
    return NextResponse.json(await getExplorePaperDetail(paperId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paper not found" },
      { status: 404 },
    );
  }
}
