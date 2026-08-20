import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, Check, Eye, Landmark, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const openWorkspace = () => (isAuthenticated ? setLocation("/workspace") : startLogin());

  return (
    <div className="site-shell overflow-hidden">
      <header className="site-nav container">
        <button className="brand-lockup" onClick={() => setLocation("/")} aria-label="Ballotly home">
          <LogoMark /><span>ballotly</span>
        </button>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#ballot-modes">Trust model</a>
          <a href="#for-organizations">For organizations</a>
        </nav>
        <button className="nav-action" onClick={openWorkspace}>{isAuthenticated ? "Go to workspace" : "Sign in"}<ArrowRight size={16} /></button>
      </header>

      <main>
        <section className="hero-section container">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> Election infrastructure for member-led organizations</div>
            <h1>Make every <em>voice</em><br />count.</h1>
            <p className="hero-description">Ballotly gives teams, associations, and communities a calm, credible place to run the decisions that matter.</p>
            <div className="hero-actions">
              <button className="button-ink" onClick={openWorkspace}>Create an election <ArrowRight size={18} /></button>
              <a href="#ballot-modes" className="text-action">See how privacy works <ArrowRight size={16} /></a>
            </div>
            <div className="proof-line"><ShieldCheck size={17} /><span>Privacy mode is disclosed to every voter before they vote.</span></div>
          </div>

          <div className="hero-stage" aria-label="Ballotly election preview">
            <div className="stage-orbit orbit-one" /><div className="stage-orbit orbit-two" />
            <div className="election-preview-card">
              <div className="preview-topline"><span>FELLOW ASSEMBLY</span><span className="status-live">OPEN</span></div>
              <div className="preview-title">2026 Community<br />Council</div>
              <div className="preview-rule" />
              <p>One seat. One clear mandate.</p>
              <div className="candidate-row"><span className="candidate-glyph cyan" />Ariella Finch <span className="vote-count">48%</span></div>
              <div className="candidate-row"><span className="candidate-glyph coral" />Samir Okafor <span className="vote-count">38%</span></div>
              <div className="candidate-row"><span className="candidate-glyph amber" />June Park <span className="vote-count">14%</span></div>
              <div className="preview-footer"><LockKeyhole size={14} /> Anonymous ballot · 6h 42m left</div>
            </div>
            <div className="stage-sticker sticker-top"><Sparkles size={15} /> Built for trust</div>
            <div className="stage-sticker sticker-bottom"><span className="pulse-ring" /> 1,284 enrolled</div>
          </div>
        </section>

        <section className="trust-strip">
          <div className="container trust-grid">
            <div><span className="strip-number">01</span><strong>Set the rules</strong><p>Choose timing, candidates, voter access, and privacy up front.</p></div>
            <div><span className="strip-number">02</span><strong>Invite your people</strong><p>Only enrolled voters can access a live ballot.</p></div>
            <div><span className="strip-number">03</span><strong>Close with clarity</strong><p>Reveal results on your terms, with a complete activity trail.</p></div>
          </div>
        </section>

        <section id="how-it-works" className="container story-section">
          <div className="section-label">THE ESSENTIALS</div>
          <div className="story-heading"><h2>Governance, without the <em>guesswork.</em></h2><p>Every organization gets a private workspace, an intentional election flow, and language that makes the rules legible to everyone involved.</p></div>
          <div className="feature-grid">
            <article className="feature-card wide"><Landmark size={28} /><div><span>ONE HOME FOR EVERY ELECTION</span><h3>Your organization, not a shared spreadsheet.</h3><p>Separate workspaces, role-based administration, and election records that stay in the right hands.</p></div><div className="feature-art organization-art"><span>BR</span><span>△</span><span>62</span></div></article>
            <article className="feature-card"><LockKeyhole size={26} /><span>PRIVACY, EXPLAINED</span><h3>Anonymous by default.</h3><p>Use anonymous voting for sensitive choices. If a ballot is attributable, voters see that plainly before they submit.</p></article>
            <article className="feature-card accent"><Eye size={26} /><span>TRANSPARENT BY DESIGN</span><h3>No hidden switches.</h3><p>Ballot privacy locks once enrollment begins. A new election is required to change the mode.</p></article>
          </div>
        </section>

        <section id="ballot-modes" className="mode-section">
          <div className="container mode-layout">
            <div className="mode-copy"><div className="section-label light">THE TRUST MODEL</div><h2>Privacy is a promise, not a <em>preference.</em></h2><p>Ballotly treats the privacy choice as part of an election’s constitution. Administrators choose it before voter enrollment; voters see it before their ballot.</p><button className="button-paper" onClick={openWorkspace}>Build your first board <ArrowRight size={18} /></button></div>
            <div className="mode-stack">
              <article className="mode-card anonymous"><div className="mode-icon"><LockKeyhole size={22} /></div><div><span>ANONYMOUS BALLOT</span><h3>Eligibility confirmed.<br />Selection protected.</h3><p>Admins can see participation and totals, never a voter-to-choice link.</p></div><Check className="mode-check" size={20} /></article>
              <article className="mode-card attributable"><div className="mode-icon"><Eye size={22} /></div><div><span>ATTRIBUTABLE BALLOT</span><h3>Accountability,<br />made explicit.</h3><p>For formal approvals where administrators and voters both need visibility of recorded choices.</p></div><Check className="mode-check" size={20} /></article>
            </div>
          </div>
        </section>

        <section id="for-organizations" className="container final-cta"><div><div className="section-label">READY WHEN YOUR MEMBERS ARE</div><h2>Run the room with <em>confidence.</em></h2></div><button className="button-ink" onClick={openWorkspace}>Start with Ballotly <ArrowRight size={18} /></button></section>
      </main>
      <footer className="site-footer container"><div className="brand-lockup"><LogoMark /><span>ballotly</span></div><span>Deliberate voting for organizations that care.</span><span>© 2026</span></footer>
    </div>
  );
}
