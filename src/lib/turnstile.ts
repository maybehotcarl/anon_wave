import { getServerEnv } from "@/lib/env";

type VerifyTurnstileInput = {
  ip: string;
  token: string;
};

type VerifyTurnstileResult = {
  error: string;
  errorCodes?: string[];
  ok: boolean;
  status: number;
};

type TurnstileSiteVerifyResponse = {
  "error-codes"?: string[];
  success: boolean;
};

export async function verifyTurnstile({
  ip,
  token,
}: VerifyTurnstileInput): Promise<VerifyTurnstileResult> {
  const env = getServerEnv();

  if (!env.turnstileSecretKey || !env.turnstileSiteKey) {
    if (process.env.NODE_ENV !== "production") {
      return {
        error: "",
        ok: true,
        status: 200,
      };
    }

    return {
      error: "Captcha is not configured.",
      ok: false,
      status: 503,
    };
  }

  if (!token) {
    return {
      error: "Captcha verification is required.",
      ok: false,
      status: 400,
    };
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        remoteip: ip,
        response: token,
        secret: env.turnstileSecretKey,
      }),
    },
  );

  if (!response.ok) {
    return {
      error: "Captcha verification request failed.",
      ok: false,
      status: 502,
    };
  }

  const result = (await response.json()) as TurnstileSiteVerifyResponse;

  if (!result.success) {
    const errorCodes = result["error-codes"] ?? [];

    return {
      error: errorCodes.includes("timeout-or-duplicate")
        ? "Captcha expired. Please complete it again."
        : errorCodes.join(", ") || "Captcha verification did not succeed.",
      errorCodes,
      ok: false,
      status: 400,
    };
  }

  return {
    error: "",
    ok: true,
    status: 200,
  };
}
