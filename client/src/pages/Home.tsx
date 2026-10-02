import { useAuth } from "@/_core/hooks/useAuth";
import { CreateBallotModal } from "@/components/CreateBallotModal";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  LockKeyhole,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Vote,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Interactive hero demo state
  const [demoSelected, setDemoSelected] = useState<number | null>(0);
  const [demoMode, setDemoMode] = useState<"anonymous" | "attributable">(
    "anonymous"
  );
  const [demoCopied, setDemoCopied] = useState(false);

  const demoOptions = [
    { label: "Community Garden & Solar Pavilion", votes: 42 },
    { label: "High-Speed Mesh Network", votes: 29 },
    { label: "Coworking & Maker Workshop", votes: 17 },
  ];

  const handleStartCreation = () => {
    if (isAuthenticated) {
      setCreateModalOpen(true);
    } else {
      setLocation("/account");
    }
  };

  const handleCopyDemoLink = () => {
    setDemoCopied(true);
    setTimeout(() => setDemoCopied(false), 2000);
  };

  return (
    <div className="site-shell overflow-hidden">
      <header className="site-nav container">
        <button
          className="brand-lockup"
          onClick={() => setLocation("/")}
          aria-label="Ballotly home"
        >
          <LogoMark />
          <span>ballotly</span>
        </button>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#ballot-modes">Anonymous vs Visible</a>
          <a href="#features">Why Ballotly</a>
        </nav>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {isAuthenticated ? (
            <button
              className="nav-action"
              onClick={() => setLocation("/workspace")}
            >
              My Ballots <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="nav-action"
              onClick={() => setLocation("/account")}
            >
              Sign in <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero-section container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> Simple, Honest & Instant Voting
            </div>
            <h1>
              Create a ballot in seconds.<br />
              <em>Share the link. People vote.</em>
            </h1>
            <p className="hero-description">
              No spreadsheets to clean up. No chaotic chat polls. Set your
              question, pick anonymous or visible voting, and share a clean link
              with your team, club, or community.
            </p>
            <div className="hero-actions">
              <button className="button-ink" onClick={handleStartCreation}>
                <Plus size={18} /> Create a Ballot
              </button>
              <a href="#how-it-works" className="text-action">
                See how it works <ArrowRight size={16} />
              </a>
            </div>
            <div className="proof-line">
              <ShieldCheck size={17} />
              <span>One person, one vote. Real cryptographic privacy.</span>
            </div>
          </div>

          {/* INTERACTIVE DEMO STAGE */}
          <div className="hero-stage" aria-label="Interactive ballot preview">
            <div className="stage-orbit orbit-one" />
            <div className="stage-orbit orbit-two" />
            <div className="election-preview-card" style={{ maxWidth: "420px" }}>
              <div className="preview-topline">
                <span>INTERACTIVE DEMO</span>
                <span className="status-live">● LIVE VOTING</span>
              </div>
              <div className="preview-title" style={{ fontSize: "20px" }}>
                What project should we fund next?
              </div>
              <div className="preview-rule" />

              {/* Mode switch in demo */}
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  marginBottom: "12px",
                  background: "#eee4cf",
                  padding: "3px",
                  borderRadius: "6px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setDemoMode("anonymous")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    borderRadius: "4px",
                    border: 0,
                    background: demoMode === "anonymous" ? "#fff" : "transparent",
                    color: demoMode === "anonymous" ? "#12383e" : "#627579",
                    cursor: "pointer",
                  }}
                >
                  <LockKeyhole size={12} /> Anonymous
                </button>
                <button
                  type="button"
                  onClick={() => setDemoMode("attributable")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    borderRadius: "4px",
                    border: 0,
                    background: demoMode === "attributable" ? "#fff" : "transparent",
                    color: demoMode === "attributable" ? "#12383e" : "#627579",
                    cursor: "pointer",
                  }}
                >
                  <Eye size={12} /> Visible
                </button>
              </div>

              {/* Demo Options */}
              <div style={{ display: "grid", gap: "8px" }}>
                {demoOptions.map((opt, i) => {
                  const isSelected = demoSelected === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDemoSelected(i)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: "6px",
                        border: isSelected
                          ? "2px solid #114b54"
                          : "1px solid #d5c8b2",
                        background: isSelected ? "#eef5f5" : "#fffbf2",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: isSelected ? 700 : 500,
                          color: "#12383e",
                        }}
                      >
                        {opt.label}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 size={16} style={{ color: "#114b54" }} />
                      ) : (
                        <span
                          style={{
                            width: "14px",
                            height: "14px",
                            borderRadius: "50%",
                            border: "1px solid #c2b59e",
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Share link snippet in demo */}
              <div
                style={{
                  marginTop: "14px",
                  padding: "8px 10px",
                  background: "#eaf0f0",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  fontSize: "12px",
                }}
              >
                <span style={{ color: "#224c52", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ballotly.alliancedev.online/b/demo-2026
                </span>
                <button
                  type="button"
                  onClick={handleCopyDemoLink}
                  style={{
                    background: demoCopied ? "#196b4b" : "#114b54",
                    color: "#fff",
                    border: 0,
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {demoCopied ? <Check size={12} /> : <Copy size={12} />}
                  {demoCopied ? "Copied" : "Copy link"}
                </button>
              </div>

              <div className="preview-footer" style={{ marginTop: "10px" }}>
                {demoMode === "anonymous" ? (
                  <>
                    <LockKeyhole size={13} /> Anonymous ballot · votes are secret
                  </>
                ) : (
                  <>
                    <Eye size={13} /> Visible ballot · voter names shown
                  </>
                )}
              </div>
            </div>

            <div className="stage-sticker sticker-top">
              <Sparkles size={14} /> 30-second setup
            </div>
            <div className="stage-sticker sticker-bottom">
              <span className="pulse-ring" /> Instant share link
            </div>
          </div>
        </section>

        {/* 3-STEP WALKTHROUGH */}
        <section id="how-it-works" className="trust-strip">
          <div className="container trust-grid">
            <div>
              <span className="strip-number">01</span>
              <strong>Create in 30 seconds</strong>
              <p>Type your question, enter your options, and pick anonymous or visible mode.</p>
            </div>
            <div>
              <span className="strip-number">02</span>
              <strong>Preview & Publish</strong>
              <p>Check how it looks, switch from draft to open, and copy your instant voting link.</p>
            </div>
            <div>
              <span className="strip-number">03</span>
              <strong>Share & Count</strong>
              <p>Send the link via WhatsApp, Slack, or email. Watch real-time results roll in.</p>
            </div>
          </div>
        </section>

        {/* ANONYMOUS VS VISIBLE */}
        <section id="ballot-modes" className="mode-section">
          <div className="container mode-layout">
            <div className="mode-copy">
              <div className="section-label light">BALLOT PRIVACY</div>
              <h2>
                Choose how you vote.<br />
                <em>Clear, upfront, honest.</em>
              </h2>
              <p>
                Every decision is different. Choose secret ballots when privacy matters,
                or visible roll calls when transparency is required. Voters are always
                told before they cast a vote.
              </p>
              <button className="button-paper" onClick={handleStartCreation}>
                Start a ballot now <ArrowRight size={18} />
              </button>
            </div>
            <div className="mode-stack">
              <article className="mode-card anonymous">
                <div className="mode-icon">
                  <LockKeyhole size={22} />
                </div>
                <div>
                  <span>SECRET BALLOT</span>
                  <h3>Anonymous voting.</h3>
                  <p>
                    Voter identity confirms eligibility, but selections are stored
                    with zero link to the voter. Even the organizer cannot see who
                    voted for what.
                  </p>
                </div>
                <Check className="mode-check" size={20} />
              </article>
              <article className="mode-card attributable">
                <div className="mode-icon">
                  <Eye size={22} />
                </div>
                <div>
                  <span>PUBLIC ROLL CALL</span>
                  <h3>Visible / Attributable voting.</h3>
                  <p>
                    For board votes, official motions, and approvals where
                    recorded votes should be visible to organizers and attendees.
                  </p>
                </div>
                <Check className="mode-check" size={20} />
              </article>
            </div>
          </div>
        </section>

        {/* WHY BALLOTLY */}
        <section id="features" className="container story-section">
          <div className="section-label">WHY BALLOTLY</div>
          <div className="story-heading">
            <h2>Everything you need. <em>Nothing you don't.</em></h2>
            <p>
              Voting tools are either too clumsy (spreadsheets, chat reactions) or
              too complex (enterprise enterprise suites). Ballotly gives you the sweet spot.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <Share2 size={26} />
              <span>SHARE ANYWHERE</span>
              <h3>One link to vote.</h3>
              <p>Copy your unique link and paste it into WhatsApp, Slack, Discord, SMS, or email.</p>
            </article>
            <article className="feature-card">
              <Vote size={26} />
              <span>INTEGRITY FIRST</span>
              <h3>One person, one vote.</h3>
              <p>Strict verification prevents ballot-box stuffing and double voting.</p>
            </article>
            <article className="feature-card accent">
              <Zap size={26} />
              <span>INSTANT RESULTS</span>
              <h3>Live vote tallies.</h3>
              <p>Real-time visual percentage bars and breakdown ready to screenshot or export.</p>
            </article>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="container final-cta">
          <div>
            <div className="section-label">READY TO DECIDE?</div>
            <h2>Create your ballot in under a minute.</h2>
          </div>
          <button className="button-ink" onClick={handleStartCreation}>
            Create a Ballot <ArrowRight size={18} />
          </button>
        </section>
      </main>

      <footer className="site-footer container">
        <div className="brand-lockup">
          <LogoMark />
          <span>ballotly</span>
        </div>
        <span>Simple, honest voting for teams and communities.</span>
        <span>© 2026</span>
      </footer>

      {/* Quick Ballot Modal */}
      <CreateBallotModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={(id) => setLocation(`/elections/${id}`)}
      />
    </div>
  );
}
