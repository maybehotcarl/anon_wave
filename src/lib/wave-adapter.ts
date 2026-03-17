import { Wallet } from "ethers";
import { getServerEnv } from "@/lib/env";

type WaveSubmission = {
  message: string;
  waveId: string;
};

type WavePostResult = {
  downstreamId?: string;
  error: string;
  ok: boolean;
  status?: number;
};

const BASE_URL = "https://api.6529.io/api";

type NonceResponse = {
  nonce?: string;
  server_signature?: string;
};

type LoginResponse = {
  token?: string;
};

type JwtPayload = {
  exp?: number;
};

type CachedToken = {
  expiresAt: number;
  token: string;
};

let cachedJwtToken: CachedToken | null = null;

function getCachedJwtToken() {
  if (!cachedJwtToken) {
    return null;
  }

  if (cachedJwtToken.expiresAt <= Date.now()) {
    cachedJwtToken = null;
    return null;
  }

  return cachedJwtToken.token;
}

function setCachedJwtToken(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    cachedJwtToken = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      token,
    };
    return;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload;
    cachedJwtToken = {
      expiresAt:
        typeof decoded.exp === "number"
          ? decoded.exp * 1000 - 60 * 1000
          : Date.now() + 5 * 60 * 1000,
      token,
    };
  } catch {
    cachedJwtToken = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      token,
    };
  }
}

async function authenticateWith6529(privateKey: string) {
  const cachedToken = getCachedJwtToken();

  if (cachedToken) {
    return cachedToken;
  }

  const wallet = new Wallet(privateKey);
  const signerAddress = wallet.address;

  const nonceUrl = new URL(`${BASE_URL}/auth/nonce`);
  nonceUrl.searchParams.set("signer_address", signerAddress);
  nonceUrl.searchParams.set("short_nonce", "true");

  const nonceResponse = await fetch(nonceUrl, {
    cache: "no-store",
  });

  if (!nonceResponse.ok) {
    throw new Error(`6529 nonce request failed with status ${nonceResponse.status}.`);
  }

  const noncePayload = (await nonceResponse.json()) as NonceResponse;

  if (!noncePayload.nonce || !noncePayload.server_signature) {
    throw new Error("6529 nonce response was missing required fields.");
  }

  const clientSignature = await wallet.signMessage(noncePayload.nonce);
  const loginUrl = new URL(`${BASE_URL}/auth/login`);
  loginUrl.searchParams.set("signer_address", signerAddress);

  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_signature: clientSignature,
      server_signature: noncePayload.server_signature,
    }),
  });

  if (!loginResponse.ok) {
    throw new Error(`6529 login failed with status ${loginResponse.status}.`);
  }

  const loginPayload = (await loginResponse.json()) as LoginResponse;

  if (!loginPayload.token) {
    throw new Error("6529 login response did not return a JWT token.");
  }

  setCachedJwtToken(loginPayload.token);
  return loginPayload.token;
}

async function postTo6529Wave(submission: WaveSubmission): Promise<WavePostResult> {
  const env = getServerEnv();

  if (!env.waveSignerPrivateKey) {
    return {
      error:
        "The 6529 signer wallet is not configured. Add WAVE_SIGNER_PRIVATE_KEY or PRIVATE_KEY.",
      ok: false,
      status: 503,
    };
  }

  try {
    const jwtToken = await authenticateWith6529(env.waveSignerPrivateKey);
    const response = await fetch(`${BASE_URL}/drops`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        drop_type: "CHAT",
        parts: [
          {
            content: submission.message,
          },
        ],
        wave_id: submission.waveId,
      }),
    });

    let payload: { id?: string } | null = null;

    try {
      payload = (await response.json()) as { id?: string };
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        downstreamId: payload?.id,
        error: `6529 rejected the drop with status ${response.status}.`,
        ok: false,
        status: response.status,
      };
    }

    return {
      downstreamId: payload?.id,
      error: "",
      ok: true,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while posting to 6529.",
      ok: false,
      status: 502,
    };
  }
}

export async function postToWave(submission: WaveSubmission): Promise<WavePostResult> {
  const env = getServerEnv();

  if (env.wavePostMode === "6529") {
    return postTo6529Wave(submission);
  }

  if (env.wavePostMode === "webhook" && env.wavePostWebhookUrl) {
    const response = await fetch(env.wavePostWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.wavePostBearerToken
          ? { Authorization: `Bearer ${env.wavePostBearerToken}` }
          : {}),
      },
      body: JSON.stringify({
        ...submission,
        source: "anonwave.live",
      }),
    });

    let downstreamId: string | undefined;

    try {
      const payload = (await response.json()) as { id?: string };
      downstreamId = payload.id;
    } catch {
      downstreamId = undefined;
    }

    if (!response.ok) {
      return {
        downstreamId,
        error: `Downstream relay rejected the submission with status ${response.status}.`,
        ok: false,
        status: response.status,
      };
    }

    return {
      downstreamId,
      error: "",
      ok: true,
    };
  }

  return {
    error:
      "No downstream posting mode is configured. Use WAVE_POST_MODE=6529 with a dedicated signer wallet.",
    ok: false,
    status: 503,
  };
}
