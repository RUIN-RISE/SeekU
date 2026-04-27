import { describe, expect, it } from "vitest";

describe("HybridRetriever keyword SQL typing", () => {
  it("does not coerce floating score weights into integer parameters", async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }

    const [{ createDatabaseConnection }, { HybridRetriever }] = await Promise.all([
      import("@seeku/db"),
      import("../retriever.js")
    ]);

    const { db, close } = createDatabaseConnection();

    try {
      const retriever = new HybridRetriever({
        db,
        provider: {} as any,
        limit: 10
      });

      const results = await retriever.retrieveKeyword({
        rawQuery: "找一个浙大同学",
        roles: ["student"],
        skills: [],
        locations: ["hangzhou"],
        mustHaves: ["zhejiang university"],
        niceToHaves: []
      });

      expect(Array.isArray(results)).toBe(true);
    } finally {
      await close();
    }
  });
});
