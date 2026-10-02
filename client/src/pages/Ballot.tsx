import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  Info,
  LockKeyhole,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";

export default function Ballot() {
  const [, params] = useRoute("/ballot/:electionId");
  const electionId = params?.electionId ?? "";
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const ballot = trpc.voting.ballot.useQuery(
    { electionId },
    { enabled: Boolean(electionId && user) }
  );
  const castVote = trpc.voting.cast.useMutation({
    onSuccess: () => ballot.refetch(),
  });
  const results = trpc.elections.results.useQuery(
    { electionId },
    { enabled: Boolean(electionId && ballot.data?.eligibility?.hasVoted) }
  );

  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [showResultsView, setShowResultsView] = useState(false);

  // If user is not signed in, show a dedicated voter sign-in prompt
  if (!user) {
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
        <main
          className="ballot-main"
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "60vh",
            padding: "20px",
          }}
        >
          <div
            style={{
              maxWidth: "440px",
              textAlign: "center",
              padding: "36px 28px",
              background: "#fffaf0",
              border: "1px solid #d8cdb8",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(18, 56, 62, 0.06)",
            }}
          >
            <Vote
              size={40}
              style={{ color: "#114b54", margin: "0 auto 14px" }}
            />
            <h1
              style={{
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontSize: "26px",
                margin: "6px 0",
                color: "#11383e",
              }}
            >
              Sign in to cast your ballot
            </h1>
            <p
              style={{
                color: "#5a7074",
                fontSize: "14px",
                lineHeight: 1.5,
                margin: "12px 0 24px",
              }}
            >
              Ballotly enforces strict one-person-one-vote rules to keep elections
              honest and verified. Sign in or register in 15 seconds to cast your
              vote.
            </p>
            <Button
              onClick={() =>
                setLocation(`/account?redirect=/ballot/${electionId}`)
              }
              className="button-ink"
              style={{ width: "100%", gap: "8px", height: "44px" }}
            >
              Sign in or register to vote <ArrowRight size={16} />
            </Button>
          </div>
        </main>
      </div>
    );
  }

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
            onClick={() => setLocation("/workspace")}
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
        attributableDisclosureAcknowledged: acknowledged,
      });
    }
  };

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
        <button
          className="quiet-back"
          onClick={() => setLocation(`/elections/${election.id}`)}
        >
          <ArrowLeft size={16} /> Leave ballot
        </button>
      </header>

      <main className="ballot-main">
        <div className="ballot-meta">
          <span>
            {isManagerPreview
              ? "ADMIN PREVIEW"
              : election.status === "open"
              ? "LIVE BALLOT"
              : "BALLOT PREVIEW"}
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
                administrator and not casting a vote, submission is disabled.
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
            <CheckCircle2 size={38} style={{ color: "#196b4b" }} />
            <h2>Your vote has been submitted!</h2>
            <p>Thank you for participating in {election.title}.</p>

            {results.data && (
              <div style={{ marginTop: "20px", textAlign: "left", width: "100%" }}>
                <Button
                  variant="outline"
                  onClick={() => setShowResultsView(!showResultsView)}
                  style={{ marginBottom: "16px", borderColor: "#c2b49c" }}
                >
                  {showResultsView ? "Hide live totals" : "View current vote totals"}
                </Button>

                {showResultsView && (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #d5c8b2",
                      borderRadius: "8px",
                      padding: "16px 20px",
                    }}
                  >
                    <h3 style={{ fontSize: "15px", margin: "0 0 12px", color: "#11383e" }}>
                      Current Results ({results.data.eligibleVoters} total votes)
                    </h3>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {results.data.candidateResults.map((cand) => (
                        <div key={cand.candidateId}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "13px",
                              marginBottom: "4px",
                            }}
                          >
                            <span>{cand.candidateName}</span>
                            <strong>{cand.voteCount} votes</strong>
                          </div>
                          <div
                            style={{
                              height: "8px",
                              background: "#e8edea",
                              borderRadius: "999px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                background: "#16515b",
                                width: `${Math.max(
                                  4,
                                  (cand.voteCount /
                                    Math.max(1, results.data!.eligibleVoters)) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
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
                <span>One ballot per enrolled voter</span>
              </div>
              <Button
                disabled={
                  isManagerPreview ||
                  !selectedCandidate ||
                  !eligibility.isOpen ||
                  (attributable && !acknowledged) ||
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
