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
let upstashLimiter: Ratelimit | null = null;

function getUpstashLimiter() {
  if (upstashLimiter) {
    return upstashLimiter;
  }

  const env = getServerEnv();

  if (!env.upstashUrl || !env.upstashToken) {
    return null;
  }

  const redis = new Redis({
    token: env.upstashToken,
    url: env.upstashUrl,
  });

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
