import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { formatWaveMessageWithLevel } from "@/lib/level-buckets";
import { shouldSilentlyDropMessage } from "@/lib/message-policy";
import { consumeSingleUseToken, consumeSubmissionQuota } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { postToWave } from "@/lib/wave-adapter";
import {
  verifyLevelAttestationDetailed,
  type VerifyLevelAttestationResult,
} from "@/lib/zk-level-attestation";

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

function logSubmitIssue(
  reason: string,
  metadata: Record<string, boolean | number | string | string[] | undefined> = {},
) {
  console.warn("[anonwave_submit]", {
    reason,
    ...metadata,
  });
}

function getLevelAttestationError(result: VerifyLevelAttestationResult) {
  if (result.ok) {
    return "";
  }

  if (result.reason === "expired") {
    return "Level receipt expired. Verify again or use Level 0.";
  }

  return "Level receipt could not be verified. Verify again or use Level 0.";
}

export async function POST(request: NextRequest) {
  let payload: {
    message?: unknown;
    turnstileToken?: unknown;
    zkLevelAttestation?: unknown;
    zkLevelProof?: unknown;
  };

  try {
    payload = (await request.json()) as {
      message?: unknown;
      turnstileToken?: unknown;
      zkLevelAttestation?: unknown;
      zkLevelProof?: unknown;
    };
  } catch {
    logSubmitIssue("malformed_json");
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const rawMessage = typeof payload.message === "string" ? payload.message : "";
  const turnstileToken =
    typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
  const message = sanitizeMessage(rawMessage);

  if (!message) {
    logSubmitIssue("empty_message");
    return NextResponse.json(
      { error: "Message content is required." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    logSubmitIssue("message_too_long", { length: message.length });
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
    logSubmitIssue("turnstile_failed", {
      codes: turnstileResult.errorCodes,
      status: turnstileResult.status,
    });
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

    logSubmitIssue("rate_limited", { retryAfter });

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

  if (shouldSilentlyDropMessage(message)) {
    console.info("[anonwave_submit]", { reason: "silent_policy_drop" });
    return NextResponse.json({ ok: true });
  }

  const env = getServerEnv();
  const hasLegacyLevelProof =
    payload.zkLevelProof !== undefined && payload.zkLevelProof !== null;
  const hasLevelAttestation =
    payload.zkLevelAttestation !== undefined && payload.zkLevelAttestation !== null;
  const levelAttestationResult = hasLevelAttestation
    ? verifyLevelAttestationDetailed(payload.zkLevelAttestation)
    : null;

  if (hasLegacyLevelProof && !hasLevelAttestation) {
    logSubmitIssue("legacy_level_proof_rejected");

    return NextResponse.json(
      {
        error: "Level proof must be verified with zkyc first. Verify again or use Level 0.",
      },
      { status: 400 },
    );
  }

  if (levelAttestationResult && !levelAttestationResult.ok) {
    logSubmitIssue("level_attestation_failed", {
      reason: levelAttestationResult.reason,
    });

    return NextResponse.json(
      {
        error: getLevelAttestationError(levelAttestationResult),
      },
      { status: 400 },
    );
  }

  if (levelAttestationResult?.ok) {
    const consumed = await consumeSingleUseToken({
      expiresAtMs: levelAttestationResult.expiresAtMs,
      scope: "level-attestation",
      tokenId: levelAttestationResult.jti,
    });

    if (!consumed) {
      logSubmitIssue("level_attestation_replay");

      return NextResponse.json(
        {
          error: "Level receipt was already used. Verify again or use Level 0.",
        },
        { status: 400 },
      );
    }
  }

  const postResult = await postToWave({
    message: formatWaveMessageWithLevel(
      message,
      levelAttestationResult?.levelLabel ?? "0",
    ),
    waveId: env.waveId,
  });

  if (!postResult.ok) {
    logSubmitIssue("wave_post_failed", { status: postResult.status });
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
  });
}
