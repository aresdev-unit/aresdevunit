import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'github' || !profile) return false;

      const githubId = String(account.providerAccountId);
      const ghProfile = profile as { login?: string; avatar_url?: string };

      // Upsert user by github_id
      await prisma.user.upsert({
        where: { githubId },
        update: {
          username: ghProfile.login || user.name || 'unknown',
          email: user.email,
          avatarUrl: ghProfile.avatar_url || user.image,
        },
        create: {
          githubId,
          username: ghProfile.login || user.name || 'unknown',
          email: user.email,
          avatarUrl: ghProfile.avatar_url || user.image,
        },
      });

      return true;
    },

    async jwt({ token, account, profile }) {
      if (account?.provider === 'github' && profile) {
        const githubId = String(account.providerAccountId);
        const dbUser = await prisma.user.findUnique({
          where: { githubId },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.username = dbUser.username;
          token.role = dbUser.role;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.userId as string,
          username: token.username as string,
          role: token.role as string,
        };
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // If there's a callbackUrl containing /device with a user_code,
      // redirect there after login to complete device code flow
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },

  pages: {
    signIn: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Augmented session type with custom user fields
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    username?: string;
    role?: string;
  }
}
