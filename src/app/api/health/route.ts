import { NextResponse } from "next/server";
import { getPublicAppConfig, getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicConfig = getPublicAppConfig();
  const env = getServerEnv();

  return NextResponse.json({
    ok: true,
    targetWaveId: publicConfig.waveId,
    integrationReady: publicConfig.integrationReady,
    captchaConfigured: Boolean(env.turnstileSecretKey && publicConfig.turnstileSiteKey),
    rateLimitMode: env.rateLimitMode,
    timestamp: new Date().toISOString(),
  });
}
