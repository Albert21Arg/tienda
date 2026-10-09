import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    const { env } = getCloudflareContext();
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaD1(env.DB),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function getD1Database() {
  return getCloudflareContext().env.DB;
}

export class D1AtomicAssertionError extends Error {
  constructor() {
    super("D1_ATOMIC_ASSERT");
    this.name = "D1AtomicAssertionError";
  }
}

export async function runD1Batch(statements: ReturnType<D1Database["prepare"]>[]) {
  if (!statements.length) return [];
  try {
    return await getD1Database().batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes("D1_ATOMIC_ASSERT")) {
      throw new D1AtomicAssertionError();
    }
    throw error;
  }
}

export function d1Statement(sql: string, ...values: unknown[]) {
  return getD1Database().prepare(sql).bind(...values);
}

export function d1ExpectChanges(statements: ReturnType<D1Database["prepare"]>[], expected = 1) {
  statements.push(d1Statement(
    'INSERT INTO "_D1AtomicGuard" ("id") SELECT CASE WHEN changes() = ? THEN 1 ELSE 0 END',
    expected,
  ));
  statements.push(d1Statement('DELETE FROM "_D1AtomicGuard"'));
}
