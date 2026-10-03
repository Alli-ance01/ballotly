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
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";

const getOrCreateVoterToken = () => {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem("ballotly_voter_token");
  if (!token) {
    token = "vt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("ballotly_voter_token", token);
  }
  return token;
};

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
  const results = trpc.elections.results.useQuery(
    { electionId },
    { enabled: Boolean(electionId && ballot.data?.eligibility?.hasVoted) }
  );

  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [showResultsView, setShowResultsView] = useState(true);

  if (ballot.isLoading) {
    return <div className="app-loading">Preparing your ballot…</div>;
  }

  const data = ballot.data;
  if (!data) {
    return (
      <div className="app-loading">
        <div>
          <h1>Ballot unavailable</h1>
          <p>
            {ballot.error?.message ||
              "This ballot is either not yet open or unavailable."}
          </p>
          <Button
            className="button-ink"
            onClick={() => setLocation("/")}
          >
            Return to Ballotly
          </Button>
        </div>
      </div>
    );
  }

  const { election, eligibility, disclosure } = data;
  const attributable = election.ballotMode === "attributable";
  const isManagerPreview = Boolean((eligibility as any).isManagerPreview);

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
    results.data?.candidateResults?.reduce((sum, c) => sum + c.voteCount, 0) ??
    0;

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
                You are previewing how voters see this ballot. Because you are an
                administrator and not voting as a participant, voting is in test preview mode.
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
              {attributable ? "This ballot is visible" : "This ballot is anonymous"}
            </strong>
            <p>{disclosure}</p>
          </div>
        </section>

        {eligibility.hasVoted ? (
          <section className="vote-success">
            <CheckCircle2 size={44} style={{ color: "#196b4b", marginBottom: "8px" }} />
            <h2>Your vote has been submitted!</h2>
            <p>Thank you for participating in {election.title}.</p>

            {results.data && (
              <div style={{ marginTop: "24px", textAlign: "left", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontSize: "12px", letterSpacing: "0.08em", fontWeight: 700, color: "#5a7074" }}>
                    LIVE TOTALS ({totalVotesCast} votes cast)
                  </span>
                  <button
                    onClick={() => setShowResultsView(!showResultsView)}
                    style={{ background: "none", border: "none", color: "#114b54", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  >
                    {showResultsView ? "Hide breakdown" : "Show breakdown"}
                  </button>
                </div>

                {showResultsView && (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #d5c8b2",
                      borderRadius: "10px",
                      padding: "18px 20px",
                      boxShadow: "0 4px 16px rgba(18, 56, 62, 0.04)",
                    }}
                  >
                    <div style={{ display: "grid", gap: "14px" }}>
                      {results.data.candidateResults.map((cand) => {
                        const pct = totalVotesCast > 0 ? Math.round((cand.voteCount / totalVotesCast) * 100) : 0;
                        return (
                          <div key={cand.candidateId}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "14px",
                                marginBottom: "6px",
                              }}
                            >
                              <span style={{ fontWeight: 600, color: "#11383e" }}>{cand.candidateName}</span>
                              <span style={{ color: "#5a7074" }}>
                                <strong>{cand.voteCount}</strong> ({pct}%)
                              </span>
                            </div>
                            <div
                              style={{
                                height: "9px",
                                background: "#edf1ee",
                                borderRadius: "999px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  background: "#16515b",
                                  width: `${Math.max(cand.voteCount > 0 ? 5 : 0, pct)}%`,
                                  transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
            {attributable && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #dcd1be",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  marginBottom: "20px",
                  textAlign: "left",
                }}
              >
                <Label
                  htmlFor="voterName"
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#11383e",
                    marginBottom: "6px",
                  }}
                >
                  Your Name (recorded with your vote)
                </Label>
                <Input
                  id="voterName"
                  placeholder="Enter your name or handle"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{
                    fontSize: "15px",
                    height: "42px",
                    borderColor: "#c4b59e",
                  }}
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
                <span>One ballot per voter</span>
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
    </div>
  );
}
