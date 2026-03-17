"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";

declare global {
  interface Window {
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

export function SubmitForm({
  integrationReady,
  turnstileSiteKey,
  waveId,
}: SubmitFormProps) {
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [scriptLoaded, setScriptLoaded] = useState(false);
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

  const remainingChars = MAX_MESSAGE_LENGTH - message.length;
  const canSubmit =
    message.trim().length > 0 &&
    message.length <= MAX_MESSAGE_LENGTH &&
    !isPending &&
    (!turnstileSiteKey || turnstileToken.length > 0);

  async function submitMessage() {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        turnstileToken,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; ok?: boolean }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Submission failed.");
    }

    setMessage("");
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

        <div className="field-shell">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            className="composer"
            placeholder="What needs to be said?"
            value={message}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(event) => {
              setMessage(event.target.value);
            }}
          />
          <div className="field-meta">
            <span>
              Fully anonymous. Your IP is never attached to the post.
            </span>
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
