import { handlers } from "@/lib/auth";

/**
 * NextAuth API route handler.
 * Handles all OAuth and session requests under /api/auth/*.
 */
export const { GET, POST } = handlers;