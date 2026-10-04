import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Info,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  Trophy,
  BarChart3,
  Clock,
  Users,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { QRCodeModal } from "@/components/QRCodeModal";

const getOrCreateVoterToken = () => {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem("ballotly_voter_token");
  if (!token) {
    token = "vt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("ballotly_voter_token", token);
  }
  return token;
};

const PALETTE = [
  "#16515b",
  "#c75945",
  "#d4a82b",
  "#2a7c67",
  "#7b4f9a",
  "#d96b37",
];

export default function Ballot() {
  const [, params] = useRoute("/ballot/:electionId");
  const electionId = params?.electionId ?? "";
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [voterToken] = useState(() => getOrCreateVoterToken());
  const [guestName, setGuestName] = useState(user?.name || "");

  const ballot = trpc.voting.ballot.useQuery(
    { electionId, voterToken },
    { enabled: Boolean(electionId) }
  );
  const castVote = trpc.voting.cast.useMutation({
    onSuccess: () => {
      ballot.refetch();
      results.refetch();
    },
  });

  // Load results if: voted, OR election is closed/archived
  const shouldLoadResults = Boolean(
    electionId &&
      (ballot.data?.eligibility?.hasVoted ||
        ballot.data?.election?.status === "closed" ||
        ballot.data?.election?.status === "archived")
  );
  const results = trpc.elections.results.useQuery(
    { electionId },
    { enabled: shouldLoadResults }
  );

  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  if (ballot.isLoading) {
    return (
      <div className="ballot-loading-screen">
        <div className="ballot-loading-inner">
          <span className="logo-mark" style={{ transform: "scale(1.4)" }}>
            <i />
            <i />
            <i />
          </span>
          <p>Preparing your ballot…</p>
        </div>
      </div>
    );
  }

  const data = ballot.data;
  if (!data) {
    return (
      <div className="ballot-page">
        <header className="ballot-header">
          <button className="brand-lockup" onClick={() => setLocation("/")}>
            <span className="logo-mark">
              <i />
              <i />
              <i />
            </span>
            <span>ballotly</span>
          </button>
        </header>
        <div className="ballot-unavailable">
          <div className="ballot-unavailable-card">
            <span className="ballot-unavail-icon">
              <Clock size={32} />
            </span>
            <h1>Ballot unavailable</h1>
            <p>
              {ballot.error?.message ||
                "This ballot is either not yet open or could not be found."}
            </p>
            <Button className="button-ink" onClick={() => setLocation("/")}>
              Return to Ballotly
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { election, eligibility, disclosure } = data;
  const attributable = election.ballotMode === "attributable";
  const isManagerPreview = Boolean((eligibility as any).isManagerPreview);
  const isClosed =
    election.status === "closed" || election.status === "archived";

  const submit = () => {
    if (isManagerPreview) return;
    if (selectedCandidate) {
      castVote.mutate({
        electionId,
        candidateId: selectedCandidate,
        voterToken,
        voterName: guestName.trim() || undefined,
        attributableDisclosureAcknowledged: acknowledged,
      });
    }
  };

  const totalVotesCast =
    (results.data as any)?.totalVotes ??
    results.data?.candidateResults?.reduce(
      (sum: number, c: any) => sum + c.voteCount,
      0
    ) ??
    0;

  const winner =
    results.data?.candidateResults && results.data.candidateResults.length > 0
      ? results.data.candidateResults.reduce((best: any, c: any) =>
          c.voteCount > best.voteCount ? c : best
        )
      : undefined;

  // ── CLOSED STATE ──────────────────────────────────────────────────────────
  if (isClosed) {
    return (
      <div className="ballot-page ballot-page--closed">
        <header className="ballot-header">
          <button className="brand-lockup" onClick={() => setLocation("/")}>
            <span className="logo-mark">
              <i />
              <i />
              <i />
            </span>
            <span>ballotly</span>
          </button>
          {user && (
            <button
              className="quiet-back"
              onClick={() => setLocation(`/elections/${election.id}`)}
            >
              <ArrowLeft size={16} /> Return to election desk
            </button>
          )}
        </header>

        <main className="ballot-main ballot-closed-main">
          {/* Status strip */}
          <div className="ballot-closed-strip">
            <span className="ballot-closed-pill">
              {election.status === "archived" ? "ARCHIVED" : "ELECTION CLOSED"}
            </span>
            <span className="ballot-closed-date">
              Results are now official
            </span>
          </div>

          {/* Hero */}
          <div className="ballot-closed-hero">
            <p className="ballot-meta-label">
              {attributable ? "ATTRIBUTABLE BALLOT" : "ANONYMOUS BALLOT"}
            </p>
            <h1 className="ballot-closed-title">{election.title}</h1>
            {election.description && (
              <p className="ballot-closed-desc">{election.description}</p>
            )}
          </div>

          {/* Stats row */}
          {results.data && (
            <div className="ballot-stats-row">
              <div className="ballot-stat-card">
                <Users size={18} />
                <div>
                  <strong>{results.data.eligibleVoters}</strong>
                  <span>Eligible voters</span>
                </div>
              </div>
              <div className="ballot-stat-card">
                <BarChart3 size={18} />
                <div>
                  <strong>{totalVotesCast}</strong>
                  <span>Votes cast</span>
                </div>
              </div>
              <div className="ballot-stat-card">
                <TrendingUp size={18} />
                <div>
                  <strong>
                    {results.data.eligibleVoters > 0
                      ? Math.round(
                          (totalVotesCast / results.data.eligibleVoters) * 100
                        )
                      : 0}
                    %
                  </strong>
                  <span>Turnout</span>
                </div>
              </div>
            </div>
          )}

          {/* Winner callout */}
          {results.data && winner && totalVotesCast > 0 && (
            <div className="ballot-winner-card">
              <div className="ballot-winner-badge">
                <Trophy size={20} />
                <span>WINNER</span>
              </div>
              <div className="ballot-winner-name">{winner.candidateName}</div>
              <div className="ballot-winner-sub">
                {winner.voteCount} votes ·{" "}
                {Math.round((winner.voteCount / totalVotesCast) * 100)}% of
                ballots
              </div>
            </div>
          )}

          {/* Full results breakdown */}
          {results.data && (
            <div className="ballot-results-panel">
              <div className="ballot-results-header">
                <span className="ballot-results-label">FULL RESULTS</span>
                <span className="ballot-results-note">
                  {election.resultsVisibility === "always"
                    ? "Results visible to all"
                    : "Official final results"}
                </span>
              </div>

              <div className="ballot-results-list">
                {results.data.candidateResults
                  .slice()
                  .sort((a, b) => b.voteCount - a.voteCount)
                  .map((cand, idx) => {
                    const pct =
                      totalVotesCast > 0
                        ? Math.round((cand.voteCount / totalVotesCast) * 100)
                        : 0;
                    const isTopCand = cand.candidateId === winner?.candidateId;
                    return (
                      <div
                        className={`ballot-result-row ${isTopCand ? "ballot-result-row--winner" : ""}`}
                        key={cand.candidateId}
                      >
                        <div className="ballot-result-rank">
                          {idx + 1 === 1 && totalVotesCast > 0 ? (
                            <Trophy size={14} />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>
                        <div className="ballot-result-info">
                          <div className="ballot-result-nameline">
                            <strong>{cand.candidateName}</strong>
                            <span className="ballot-result-pct">{pct}%</span>
                          </div>
                          <div className="ballot-result-track">
                            <div
                              className="ballot-result-fill"
                              style={{
                                width: `${Math.max(cand.voteCount > 0 ? 3 : 0, pct)}%`,
                                background:
                                  PALETTE[idx % PALETTE.length],
                              }}
                            />
                          </div>
                        </div>
                        <div className="ballot-result-count">
                          {cand.voteCount}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {results.error && (
            <div className="ballot-results-hidden">
              <LockKeyhole size={24} />
              <p>
                {results.error.message ||
                  "Results are not available for this election."}
              </p>
            </div>
          )}

          {/* Voted confirmation */}
          {eligibility.hasVoted && (
            <div className="ballot-voted-confirm">
              <CheckCircle2 size={16} />
              <span>Your vote was recorded for this election.</span>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── OPEN / DRAFT BALLOT ──────────────────────────────────────────────────
  return (
    <div className="ballot-page">
      <header className="ballot-header">
        <button className="brand-lockup" onClick={() => setLocation("/")}>
          <span className="logo-mark">
            <i />
            <i />
            <i />
          </span>
          <span>ballotly</span>
        </button>
        {user && (
          <button
            className="quiet-back"
            onClick={() => setLocation(`/elections/${election.id}`)}
          >
            <ArrowLeft size={16} /> Return to election desk
          </button>
        )}
        {election.status === "open" && (
          <button
            className="quiet-back"
            onClick={() => setQrOpen(true)}
            style={{ color: "#16515b", fontWeight: 700 }}
          >
            <QrCode size={16} /> QR Code
          </button>
        )}
      </header>

      <main className="ballot-main">
        <div className="ballot-meta">
          <span>
            {isManagerPreview
              ? "ADMIN PREVIEW"
              : election.status === "open"
              ? "LIVE BALLOT"
              : "BALLOT OVERVIEW"}
          </span>
          <span>01 / 01</span>
        </div>

        <div className="ballot-title">
          <h1>{election.title}</h1>
          <p>{election.description || "Please make your selection below."}</p>
        </div>

        {isManagerPreview && (
          <section
            className="disclosure-banner"
            style={{
              borderColor: "#c9933b",
              background: "#fdf8ee",
              color: "#614002",
            }}
          >
            <Info size={22} style={{ color: "#a56f17" }} />
            <div>
              <strong>Administrator Preview</strong>
              <p>
                You are previewing how voters see this ballot. Voting is
                disabled in preview mode.
              </p>
            </div>
          </section>
        )}

        <section
          className={`disclosure-banner ${attributable ? "attributable" : "anonymous"}`}
        >
          {attributable ? <Eye size={22} /> : <LockKeyhole size={22} />}
          <div>
            <strong>
              {attributable
                ? "This ballot is attributable"
                : "This ballot is fully anonymous"}
            </strong>
            <p>{disclosure}</p>
          </div>
        </section>

        {/* POST-VOTE STATE (while election is still open) */}
        {eligibility.hasVoted ? (
          <section className="vote-success">
            <CheckCircle2
              size={44}
              style={{ color: "#196b4b", marginBottom: "8px" }}
            />
            <h2>Your vote has been submitted!</h2>
            <p>Thank you for participating in {election.title}.</p>

            {results.data && (
              <div className="vote-success-results">
                <div className="vote-success-results-header">
                  <span>INTERIM RESULTS</span>
                  <span>{totalVotesCast} votes cast</span>
                </div>
                <div className="vote-success-bars">
                  {results.data.candidateResults
                    .slice()
                    .sort((a, b) => b.voteCount - a.voteCount)
                    .map((cand, idx) => {
                      const pct =
                        totalVotesCast > 0
                          ? Math.round(
                              (cand.voteCount / totalVotesCast) * 100
                            )
                          : 0;
                      return (
                        <div
                          key={cand.candidateId}
                          className="vote-success-bar-row"
                        >
                          <span className="vote-success-bar-label">
                            {cand.candidateName}
                          </span>
                          <div className="vote-success-bar-track">
                            <div
                              className="vote-success-bar-fill"
                              style={{
                                width: `${Math.max(cand.voteCount > 0 ? 4 : 0, pct)}%`,
                                background: PALETTE[idx % PALETTE.length],
                              }}
                            />
                          </div>
                          <span className="vote-success-bar-pct">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {results.error && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#7a8e8f",
                  marginTop: "16px",
                }}
              >
                Results will be shown when the election closes.
              </p>
            )}
          </section>
        ) : (
          <>
            {/* Attributable ballot: name capture */}
            {attributable && (
              <div className="voter-name-panel">
                <Label htmlFor="voterName" className="voter-name-label">
                  Your Name
                  <small>This will be recorded alongside your vote</small>
                </Label>
                <Input
                  id="voterName"
                  placeholder="Enter your name or handle"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="voter-name-input"
                />
              </div>
            )}

            <section className="ballot-question">
              <span>YOUR QUESTION</span>
              <h2>{election.ballotPrompt}</h2>
            </section>

            <div
              className="ballot-options"
              role="radiogroup"
              aria-label={election.ballotPrompt}
            >
              {election.candidates.map((candidate, index) => (
                <button
                  className={`ballot-option ${
                    selectedCandidate === candidate.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedCandidate(candidate.id)}
                  role="radio"
                  aria-checked={selectedCandidate === candidate.id}
                  key={candidate.id}
                >
                  <span className="option-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>{candidate.biography || "Option"}</small>
                  </span>
                  <span className="radio-visual" />
                </button>
              ))}
            </div>

            {attributable && (
              <label className="acknowledgement">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(value) => setAcknowledged(value === true)}
                />
                <span>
                  I understand that election administrators can view my recorded
                  choice in this election.
                </span>
              </label>
            )}

            {castVote.error && (
              <p className="form-error">{castVote.error.message}</p>
            )}

            <div className="ballot-submit">
              <div>
                <ShieldCheck size={17} />
                <span>
                  {attributable ? "Securely attributed" : "Fully anonymous"}
                </span>
              </div>
              <Button
                disabled={
                  isManagerPreview ||
                  !selectedCandidate ||
                  !eligibility.isOpen ||
                  (attributable && !acknowledged) ||
                  (attributable && !guestName.trim()) ||
                  castVote.isPending
                }
                onClick={submit}
                className="button-ink"
              >
                {isManagerPreview
                  ? "Voting disabled (preview mode)"
                  : castVote.isPending
                  ? "Submitting ballot…"
                  : attributable
                  ? "Acknowledge & submit"
                  : "Submit anonymous ballot"}
              </Button>
            </div>
          </>
        )}
      </main>

      <QRCodeModal
        open={qrOpen}
        onOpenChange={setQrOpen}
        electionId={election.id}
        title={election.title}
        ballotMode={election.ballotMode}
      />
    </div>
  );
}
