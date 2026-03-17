import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { consumeSubmissionQuota } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { postToWave } from "@/lib/wave-adapter";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1500;

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function sanitizeMessage(message: string) {
  return message.replace(/\r\n/g, "\n").trim();
}

export async function POST(request: NextRequest) {
  let payload: { message?: unknown; turnstileToken?: unknown };

  try {
    payload = (await request.json()) as { message?: unknown; turnstileToken?: unknown };
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const rawMessage = typeof payload.message === "string" ? payload.message : "";
  const turnstileToken =
    typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
  const message = sanitizeMessage(rawMessage);

  if (!message) {
    return NextResponse.json(
      { error: "Message content is required." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const clientIp = getClientIp(request);
  const turnstileResult = await verifyTurnstile({
    ip: clientIp,
    token: turnstileToken,
  });

  if (!turnstileResult.ok) {
    return NextResponse.json(
      { error: turnstileResult.error },
      { status: turnstileResult.status },
    );
  }

  const rateLimitResult = await consumeSubmissionQuota(clientIp);

  if (!rateLimitResult.success) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
    );

    return NextResponse.json(
      {
        error: `Too many submissions from this IP. Try again in about ${retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  const env = getServerEnv();
  const postResult = await postToWave({
    message,
    waveId: env.waveId,
  });

  if (!postResult.ok) {
    return NextResponse.json(
      {
        error: postResult.error,
      },
      {
        status: postResult.status ?? 503,
      },
    );
  }

  return NextResponse.json({
    ok: true,
    downstreamId: postResult.downstreamId,
  });
}
