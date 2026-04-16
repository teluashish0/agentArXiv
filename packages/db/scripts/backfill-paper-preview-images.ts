import { buildPaperPreviewDataUri } from "@agentarxiv/core";
import { PrismaClient } from "../generated/client/index.js";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://agentarxiv:agentarxiv@localhost:15432/agentarxiv?schema=public";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const papers = await prisma.agentPaper.findMany({
      where: {
        status: "published",
        previewImagePath: null,
      },
      select: {
        id: true,
        title: true,
        authors: true,
        summary: true,
        content: true,
      },
      orderBy: {
        publishedAt: "desc",
      },
    });

    let updatedCount = 0;

    for (const paper of papers) {
      const previewImagePath = buildPaperPreviewDataUri({
        title: paper.title,
        authors: paper.authors,
        summary: paper.summary,
        content: paper.content ?? undefined,
      });

      await prisma.agentPaper.update({
        where: {
          id: paper.id,
        },
        data: {
          previewImagePath,
        },
      });

      updatedCount += 1;
      console.log(`backfilled ${paper.id}`);
    }

    console.log(`backfilled ${updatedCount} published paper preview image(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
