import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js v5 configuration for profile claim verification.
 *
 * GitHub OAuth is used for claim verification only, not general authentication.
 * Users can verify their profile ownership by matching their GitHub login
 * to the GitHub URL on their profile.
 */

export const config: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID ?? "",
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Include user.email for profile matching
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
    async jwt({ token, account }) {
      // Store GitHub login on initial sign in
      if (account?.provider === "github" && account.providerAccountId) {
        token.githubLogin = account.username ?? null;
      }
      return token;
    },
  },
  pages: {
    // No custom pages - OAuth flow is transient for verification
    signIn: undefined,
    error: undefined,
  },
  // JWT secret for session encryption (also used for email verification tokens)
  secret: process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET,
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);