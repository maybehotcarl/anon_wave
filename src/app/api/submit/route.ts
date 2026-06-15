import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { formatWaveMessageWithLevel } from "@/lib/level-buckets";
import { shouldSilentlyDropMessage } from "@/lib/message-policy";
import { consumeSubmissionQuota } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { postToWave } from "@/lib/wave-adapter";
import {
  verifyLevelProofDetailed,
  type VerifyLevelProofResult,
} from "@/lib/zk-level-verification";

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

function getLevelProofError(result: VerifyLevelProofResult) {
  if (result.ok) {
    return "";
  }

  const detail = result.detail?.toLowerCase() ?? "";

  if (detail.includes("nullifier") || detail.includes("replay")) {
    return "Level proof was already used. Verify again and submit with the new proof.";
  }

  if (result.reason === "stale_root") {
    return "Level proof is from an older 6529 tree. Verify again and submit with the new proof.";
  }

  if (
    result.reason === "root_http_error" ||
    result.reason === "root_request_failed" ||
    result.reason === "root_response_malformed"
  ) {
    return "Current 6529 level tree could not be checked. Try again, or use Level 0.";
  }

  if (result.reason === "verify_request_failed") {
    return "Level proof verification did not finish. Verify again, or use Level 0.";
  }

  return "Level proof could not be verified. Verify again or use Level 0.";
}

function classifyLevelProofDetail(detail?: string) {
  const lowerDetail = detail?.toLowerCase() ?? "";

  if (!lowerDetail) {
    return undefined;
  }

  if (lowerDetail.includes("nullifier") || lowerDetail.includes("replay")) {
    return "replay_or_nullifier";
  }

  if (lowerDetail.includes("invalid")) {
    return "invalid_proof";
  }

  if (lowerDetail.includes("stale") || lowerDetail.includes("expired")) {
    return "stale_or_expired";
  }

  return "provided";
}

export async function POST(request: NextRequest) {
  let payload: { message?: unknown; turnstileToken?: unknown; zkLevelProof?: unknown };

  try {
    payload = (await request.json()) as {
      message?: unknown;
      turnstileToken?: unknown;
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
  const hasLevelProof =
    payload.zkLevelProof !== undefined && payload.zkLevelProof !== null;
  const levelProofResult = await verifyLevelProofDetailed(payload.zkLevelProof);

  if (hasLevelProof && !levelProofResult.ok) {
    logSubmitIssue("level_proof_failed", {
      detail: classifyLevelProofDetail(levelProofResult.detail),
      reason: levelProofResult.reason,
      status: levelProofResult.status,
    });

    return NextResponse.json(
      {
        error: getLevelProofError(levelProofResult),
      },
      { status: 400 },
    );
  }

  const postResult = await postToWave({
    message: formatWaveMessageWithLevel(message, levelProofResult.levelLabel),
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
