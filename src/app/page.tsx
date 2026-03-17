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
          <li><a href="https://6529.io/waves/3464b59a-132b-4cd9-894d-c8b8e277187d" target="_blank" rel="noopener noreferrer">View the Wave</a></li>
          <li><a href="https://6529.io" target="_blank" rel="noopener noreferrer">6529.io</a></li>
        </ul>
      </nav>

      <div className="page-content">
        <section className="hero">
          <h1>Say what you actually think.</h1>
          <p className="lede">
            Share the honest feedback no one will say out loud, the rumors
            worth repeating, and the gossip people need to hear — posted
            anonymously into the 6529 Anon Wave. No wallet. No login. No trail.
          </p>
          <div className="pill-row" aria-label="product traits">
            <span>Fully anonymous</span>
            <span>No wallet required</span>
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
        <p>anonwave.live &middot; Honest talk, not doxxing. &middot; <a href="https://6529.io" target="_blank" rel="noopener noreferrer">6529.io</a></p>
      </footer>
    </main>
  );
}
