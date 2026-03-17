import { SubmitForm } from "@/components/SubmitForm";
import { getPublicAppConfig } from "@/lib/env";

export default function Home() {
  const config = getPublicAppConfig();

  return (
    <main className="page-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">anonwave.live</p>
          <h1>Post to the Anon Wave without an account.</h1>
          <p className="lede">
            Write it, pass the captcha, and the site posts your message into the
            live 6529 wave. No wallet connect. No login wall. Just the post.
          </p>
          <div className="pill-row" aria-label="product traits">
            <span>No login</span>
            <span>Captcha protected</span>
            <span>Rate limited</span>
          </div>
          <div className="meta-grid">
            <article>
              <h2>Target Wave</h2>
              <p>{config.waveId}</p>
            </article>
            <article>
              <h2>Posting Mode</h2>
              <p>{config.integrationReady ? "Relay configured" : "Relay pending"}</p>
            </article>
          </div>
        </div>
        <div className="hero-panel">
          <SubmitForm
            waveId={config.waveId}
            turnstileSiteKey={config.turnstileSiteKey}
            integrationReady={config.integrationReady}
          />
        </div>
      </section>
    </main>
  );
}
