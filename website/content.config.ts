import { defineContentConfig, defineCollection, z } from "@nuxt/content";
import path from "path";

export default defineContentConfig({
  collections: {
    meetings: defineCollection({
      type: "page",
      source: {
        cwd: path.resolve(__dirname, "../data/meetings"),
        include: "**/*.md",
      },
      schema: z.object({
        title: z.string(),
        room: z.string(),
        chair: z.string(),
        chairId: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        duration: z.string(),
        participants: z.array(z.string()),
        participantStats: z.array(z.object({
          userId: z.string(),
          displayName: z.string(),
          messageCount: z.number(),
        })),
        roomId: z.string(),
        published: z.string(),
      }),
    }),
  },
});
