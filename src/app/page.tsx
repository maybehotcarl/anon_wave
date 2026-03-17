import Link from "next/link";
import { SubmitForm } from "@/components/SubmitForm";
import { getPublicAppConfig } from "@/lib/env";

export default function Home() {
  const config = getPublicAppConfig();

  return (
    <main className="page-shell">
      <nav className="nav">
        <Link className="nav-brand" href="/">anonwave.live</Link>
        <ul className="nav-links">
          <li><a href="https://6529.io" target="_blank" rel="noopener noreferrer">6529.io</a></li>
        </ul>
      </nav>

      <div className="page-content">
        <section className="hero">
          <h1>Post to the Anon Wave without an account.</h1>
          <p className="lede">
            Write it, pass the captcha, and the site posts your message into the
            live 6529 wave. No wallet. No login. Just the post.
          </p>
          <div className="pill-row" aria-label="product traits">
            <span>No login</span>
            <span>Captcha protected</span>
            <span>Rate limited</span>
          </div>
        </section>

        <div className="cards-grid">
          <div className="info-card">
            <h2>Target Wave</h2>
            <p>{config.waveId}</p>
          </div>
          <div className="info-card">
            <h2>Posting Mode</h2>
            <p>{config.integrationReady ? "Relay configured" : "Relay pending"}</p>
          </div>
        </div>

        <SubmitForm
          waveId={config.waveId}
          turnstileSiteKey={config.turnstileSiteKey}
          integrationReady={config.integrationReady}
        />
      </div>

      <footer className="site-footer">
        <p>anonwave.live &middot; 1% of nothing &middot; <a href="https://6529.io" target="_blank" rel="noopener noreferrer">6529.io</a></p>
      </footer>
    </main>
  );
}
