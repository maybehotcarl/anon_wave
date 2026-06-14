"use client";

import { ZKSiteClient, type BrowserProofResult } from "@6529/zk-service/browser";
import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  UNVERIFIED_LEVEL_LABEL,
  VERIFIED_LEVEL_BUCKETS,
  type LevelBucket,
  type LevelLabel,
} from "@/lib/level-buckets";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId?: string) => void;
    };
  }
}

type SubmitFormProps = {
  integrationReady: boolean;
  turnstileSiteKey?: string;
  waveId: string;
};

const MAX_MESSAGE_LENGTH = 1500;
const ZK_API_URL = "https://zkyc.solutions";
const ZK_ARTIFACT_BASE_URL = "https://zkyc.solutions/api/artifacts";

type VerifiedLevelProof = {
  bucket: LevelBucket;
  proofResult: BrowserProofResult;
};

export function SubmitForm({
  integrationReady,
  turnstileSiteKey,
  waveId,
}: SubmitFormProps) {
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isVerifyingLevel, setIsVerifyingLevel] = useState(false);
  const [levelProof, setLevelProof] = useState<VerifiedLevelProof | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<{
    tone: "idle" | "success" | "error";
    text: string;
  }>({
    tone: "idle",
    text: "Optional: verify a 6529 level bucket privately. Skip it to post as level 0.",
  });
  const [status, setStatus] = useState<{
    tone: "idle" | "success" | "error";
    text: string;
  }>({
    tone: "idle",
    text: "Your post goes straight into the wave. No account is linked, no identity is attached.",
  });
  const [isPending, startTransition] = useTransition();

  const turnstileNodeRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const walletProofJwtRef = useRef<string | null>(null);
  const zkClientRef = useRef<ZKSiteClient | null>(null);

  useEffect(() => {
    if (
      !turnstileSiteKey ||
      !scriptLoaded ||
      !turnstileNodeRef.current ||
      !window.turnstile ||
      widgetIdRef.current
    ) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(turnstileNodeRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token: string) => {
        setTurnstileToken(token);
      },
      "expired-callback": () => {
        setTurnstileToken("");
      },
      "error-callback": () => {
        setTurnstileToken("");
      },
      theme: "auto",
    });

    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = null;
    };
  }, [scriptLoaded, turnstileSiteKey]);

  function getZkClient() {
    if (!zkClientRef.current) {
      zkClientRef.current = new ZKSiteClient({
        apiUrl: ZK_API_URL,
        artifactBaseUrl: ZK_ARTIFACT_BASE_URL,
        getAuthToken: () => walletProofJwtRef.current,
        timeoutMs: 15000,
        retries: 2,
        retryDelayMs: 250,
      });
    }

    return zkClientRef.current;
  }

  function getLevelLabel(): LevelLabel {
    return levelProof?.bucket.label ?? UNVERIFIED_LEVEL_LABEL;
  }

  const remainingChars = MAX_MESSAGE_LENGTH - message.length;
  const canSubmit =
    message.trim().length > 0 &&
    message.length <= MAX_MESSAGE_LENGTH &&
    !isPending &&
    !isVerifyingLevel &&
    (!turnstileSiteKey || turnstileToken.length > 0);

  async function requestWalletAddress() {
    const provider = window.ethereum;

    if (!provider) {
      throw new Error("No browser wallet found.");
    }

    const accounts = await provider.request({ method: "eth_requestAccounts" });

    if (
      !Array.isArray(accounts) ||
      typeof accounts[0] !== "string" ||
      !accounts[0]
    ) {
      throw new Error("No wallet account was selected.");
    }

    return accounts[0];
  }

  async function signWalletMessage(walletAddress: string, messageToSign: string) {
    const provider = window.ethereum;

    if (!provider) {
      throw new Error("No browser wallet found.");
    }

    const signature = await provider.request({
      method: "personal_sign",
      params: [messageToSign, walletAddress],
    });

    if (typeof signature !== "string") {
      throw new Error("Wallet did not return a signature.");
    }

    return signature;
  }

  async function verifyLevelBucket() {
    setIsVerifyingLevel(true);
    setLevelProof(null);
    setVerificationStatus({
      tone: "idle",
      text: "Waiting for wallet signature...",
    });

    try {
      const walletAddress = await requestWalletAddress();
      const zk = getZkClient();
      const tokenResult = await zk.getWalletProofToken({
        walletAddress,
        chainId: 1,
        signMessage: (messageToSign) =>
          signWalletMessage(walletAddress, messageToSign),
      });

      walletProofJwtRef.current = tokenResult.token;

      for (const bucket of VERIFIED_LEVEL_BUCKETS) {
        setVerificationStatus({
          tone: "idle",
          text: `Checking level ${bucket.label}...`,
        });

        const gate = await zk.checkLevelRange(
          {
            walletAddress,
            levelMin: bucket.min,
            levelMax: bucket.max,
          },
          (stage) => {
            if (stage === "proving") {
              setVerificationStatus({
                tone: "idle",
                text: `Proving level ${bucket.label} privately...`,
              });
            }
          },
        );

        if (gate.status === "verified" && gate.proofResult) {
          setLevelProof({ bucket, proofResult: gate.proofResult });
          setVerificationStatus({
            tone: "success",
            text: `Verified 6529 level ${bucket.label}.`,
          });
          return;
        }
      }

      setVerificationStatus({
        tone: "error",
        text: "Could not verify a 6529 level bucket. Your post can still go out as level 0.",
      });
    } catch (error) {
      setVerificationStatus({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Level verification failed. Your post can still go out as level 0.",
      });
    } finally {
      setIsVerifyingLevel(false);
    }
  }

  function clearLevelProof() {
    setLevelProof(null);
    setVerificationStatus({
      tone: "idle",
      text: "Optional: verify a 6529 level bucket privately. Skip it to post as level 0.",
    });
  }

  async function submitMessage() {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        turnstileToken,
        zkLevelProof: levelProof?.proofResult,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; ok?: boolean }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Submission failed.");
    }

    setMessage("");
    clearLevelProof();
    setTurnstileToken("");
    if (widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
    }

    setStatus({
      tone: "success",
      text: "Sent. Your anonymous drop should appear in the wave shortly.",
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setStatus({
      tone: "idle",
      text: "Dropping your message into the wave...",
    });

    startTransition(async () => {
      try {
        await submitMessage();
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Submission failed unexpectedly.";

        setStatus({
          tone: "error",
          text,
        });
      }
    });
  }

  return (
    <>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
        />
      ) : null}

      <form className="form-card" onSubmit={handleSubmit}>
        <div>
          <h2 className="card-title">Drop something anonymous</h2>
          <p className="card-copy">
            Tough feedback, rumors, gossip — whatever needs saying. Posted to wave <strong>{waveId}</strong>.
          </p>
        </div>

        {!integrationReady ? (
          <div className="notice warning">
            <p className="helper-copy">
              The UI is ready, but the final 6529 posting credential still needs to
              be wired in. Until then, submissions will fail closed.
            </p>
          </div>
        ) : null}

        <div className="verification-panel">
          <div>
            <h3>6529 level</h3>
            <p>
              Wave output will show level <strong>{getLevelLabel()}</strong>.
            </p>
          </div>
          <div className="verification-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isVerifyingLevel || isPending}
              onClick={verifyLevelBucket}
            >
              {isVerifyingLevel ? "Verifying..." : "Verify Privately"}
            </button>
            {levelProof ? (
              <button
                className="text-button"
                type="button"
                disabled={isVerifyingLevel || isPending}
                onClick={clearLevelProof}
              >
                Use Level 0
              </button>
            ) : null}
          </div>
          <div
            className={
              verificationStatus.tone === "success"
                ? "notice success"
                : verificationStatus.tone === "error"
                  ? "notice error"
                  : "notice"
            }
          >
            <p className="status-line">{verificationStatus.text}</p>
          </div>
        </div>

        <div className="field-shell">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            className="composer"
            placeholder="What needs to be said?"
            value={message}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-describedby="message-policy"
            onChange={(event) => {
              setMessage(event.target.value);
            }}
          />
          <div className="field-meta" id="message-policy">
            <span>Fully anonymous. Your IP is never attached to the post.</span>
            <span>{remainingChars} chars left</span>
          </div>
        </div>

        <div className="submit-row">
          {turnstileSiteKey ? (
            <div className="turnstile-shell" ref={turnstileNodeRef} />
          ) : (
            <div className="notice warning">
              <p className="helper-copy">
                Add Cloudflare Turnstile keys to enable the production captcha
                challenge.
              </p>
            </div>
          )}

          <button className="submit-button" type="submit" disabled={!canSubmit}>
            {isPending ? "Dropping..." : "Drop It"}
          </button>
        </div>

        <div
          className={
            status.tone === "success"
              ? "notice success"
              : status.tone === "error"
                ? "notice error"
                : "notice"
          }
        >
          <p className="status-line">{status.text}</p>
        </div>

        <p className="microcopy">
          Be honest, not harmful. No doxxing, no personal addresses or phone
          numbers, no threats. This site is for candid talk — not for ruining
          lives. Messages are rate limited and capped at {MAX_MESSAGE_LENGTH} characters.
        </p>
      </form>
    </>
  );
}
