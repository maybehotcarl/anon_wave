import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/env";

type RateLimitResult = {
  limit: number;
  remaining: number;
  resetAt: number;
  success: boolean;
};

type LocalBucket = {
  count: number;
  resetAt: number;
};

const localBuckets = new Map<string, LocalBucket>();
const localSingleUseTokens = new Map<string, number>();
let upstashRedis: Redis | null = null;
let upstashLimiter: Ratelimit | null = null;

function getUpstashRedis() {
  if (upstashRedis) {
    return upstashRedis;
  }

  const env = getServerEnv();

  if (!env.upstashUrl || !env.upstashToken) {
    return null;
  }

  upstashRedis = new Redis({
    token: env.upstashToken,
    url: env.upstashUrl,
  });

  return upstashRedis;
}

function getUpstashLimiter() {
  if (upstashLimiter) {
    return upstashLimiter;
  }

  const redis = getUpstashRedis();
  if (!redis) {
    return null;
  }

  const env = getServerEnv();

  upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(
      env.memoryRateLimitMaxRequests,
      `${Math.floor(env.memoryRateLimitWindowMs / 1000)} s`,
    ),
    analytics: false,
    prefix: "anonwave-submit",
  });

  return upstashLimiter;
}

function consumeLocalQuota(identifier: string) {
  const env = getServerEnv();
  const now = Date.now();
  const current = localBuckets.get(identifier);

  if (!current || current.resetAt <= now) {
    const next: LocalBucket = {
      count: 1,
      resetAt: now + env.memoryRateLimitWindowMs,
    };

    localBuckets.set(identifier, next);

    return {
      limit: env.memoryRateLimitMaxRequests,
      remaining: env.memoryRateLimitMaxRequests - next.count,
      resetAt: next.resetAt,
      success: true,
    } satisfies RateLimitResult;
  }

  current.count += 1;
  localBuckets.set(identifier, current);

  return {
    limit: env.memoryRateLimitMaxRequests,
    remaining: Math.max(0, env.memoryRateLimitMaxRequests - current.count),
    resetAt: current.resetAt,
    success: current.count <= env.memoryRateLimitMaxRequests,
  } satisfies RateLimitResult;
}

export async function consumeSubmissionQuota(identifier: string) {
  const limiter = getUpstashLimiter();

  if (!limiter) {
    return consumeLocalQuota(identifier);
  }

  const result = await limiter.limit(identifier);

  return {
    limit: result.limit,
    remaining: result.remaining,
    resetAt: result.reset,
    success: result.success,
  } satisfies RateLimitResult;
}

function consumeLocalSingleUseToken(key: string, expiresAtMs: number) {
  const now = Date.now();

  for (const [tokenKey, tokenExpiresAt] of localSingleUseTokens.entries()) {
    if (tokenExpiresAt <= now) {
      localSingleUseTokens.delete(tokenKey);
    }
  }

  if (localSingleUseTokens.has(key)) {
    return false;
  }

  localSingleUseTokens.set(key, expiresAtMs);
  return true;
}

export async function consumeSingleUseToken(options: {
  expiresAtMs: number;
  scope: string;
  tokenId: string;
}) {
  const key = `${options.scope}:${options.tokenId}`;
  const ttlMs = Math.max(1_000, options.expiresAtMs - Date.now());
  const redis = getUpstashRedis();

  if (!redis) {
    return consumeLocalSingleUseToken(key, Date.now() + ttlMs);
  }

  const result = await redis.set(key, "1", {
    nx: true,
    px: ttlMs,
  });

  return result === "OK";
}
