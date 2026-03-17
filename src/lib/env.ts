const DEFAULT_WAVE_ID = "3464b59a-132b-4cd9-894d-c8b8e277187d";
const DEFAULT_SITE_URL = "https://anonwave.live";
const MEMORY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MEMORY_RATE_LIMIT_MAX_REQUESTS = 5;

export type WavePostMode = "6529" | "disabled" | "webhook";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function getServerEnv() {
  const wavePostMode = (readEnv("WAVE_POST_MODE") ?? "disabled") as WavePostMode;
  const upstashUrl = readEnv("UPSTASH_REDIS_REST_URL");
  const upstashToken = readEnv("UPSTASH_REDIS_REST_TOKEN");
  const waveSignerPrivateKey =
    readEnv("WAVE_SIGNER_PRIVATE_KEY") ?? readEnv("PRIVATE_KEY");

  return {
    siteUrl: readEnv("NEXT_PUBLIC_SITE_URL") ?? DEFAULT_SITE_URL,
    turnstileSecretKey: readEnv("TURNSTILE_SECRET_KEY"),
    turnstileSiteKey: readEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    upstashToken,
    upstashUrl,
    waveId: readEnv("ANON_WAVE_ID") ?? DEFAULT_WAVE_ID,
    wavePostBearerToken: readEnv("WAVE_POST_BEARER_TOKEN"),
    wavePostMode,
    waveSignerPrivateKey,
    wavePostWebhookUrl: readEnv("WAVE_POST_WEBHOOK_URL"),
    rateLimitMode: upstashUrl && upstashToken ? "upstash" : "memory",
    memoryRateLimitMaxRequests: MEMORY_RATE_LIMIT_MAX_REQUESTS,
    memoryRateLimitWindowMs: MEMORY_RATE_LIMIT_WINDOW_MS,
  };
}

export function getPublicAppConfig() {
  const env = getServerEnv();
  const integrationReady =
    (env.wavePostMode === "6529" && Boolean(env.waveSignerPrivateKey)) ||
    (env.wavePostMode === "webhook" && Boolean(env.wavePostWebhookUrl));

  return {
    integrationReady,
    siteUrl: env.siteUrl,
    turnstileSiteKey: env.turnstileSiteKey,
    waveId: env.waveId,
  };
}
