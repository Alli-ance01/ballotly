import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileClock,
  LockKeyhole,
  Plus,
  QrCode,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { QRCodeModal } from "@/components/QRCodeModal";

const statusOptions = [
  "draft",
  "scheduled",
  "open",
  "closed",
  "archived",
] as const;

type ElectionStatusOption = (typeof statusOptions)[number];

const allowedNext: Record<ElectionStatusOption, readonly ElectionStatusOption[]> = {
  draft: ["draft", "scheduled", "open", "archived"],
  scheduled: ["scheduled", "draft", "open", "archived"],
  open: ["open", "closed"],
  closed: ["closed", "archived"],
  archived: ["archived"],
};

const statusLabel: Record<ElectionStatusOption, string> = {
  draft: "Draft (setup)",
  scheduled: "Scheduled",
  open: "Open (live voting)",
  closed: "Closed (tallying)",
  archived: "Archived",
};

const localDateTime = (value?: Date | string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

export default function ElectionManager() {
  const [, params] = useRoute("/elections/:electionId");
  const electionId = params?.electionId ?? "";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const electionQuery = trpc.elections.get.useQuery(
    { electionId },
    { enabled: Boolean(electionId) }
  );
  const readiness = trpc.elections.readiness.useQuery(
    { electionId },
    { enabled: Boolean(electionId) }
  );
  const voters = trpc.elections.listVoters.useQuery(
    { electionId },
    { enabled: Boolean(electionId) }
  );
  const audit = trpc.elections.audit.useQuery(
    { electionId },
    { enabled: Boolean(electionId) }
  );
  const election = electionQuery.data;
  const results = trpc.elections.results.useQuery(
    { electionId },
    { enabled: Boolean(electionId) }
  );
  const refreshElection = () => {
    utils.elections.get.invalidate({ electionId });
    utils.elections.listVoters.invalidate({ electionId });
    results.refetch();
    audit.refetch();
  };
  const updateStatus = trpc.elections.updateStatus.useMutation({
    onSuccess: (data) => {
      refreshElection();
      const label = statusLabel[data.status as ElectionStatusOption] || data.status;
      toast.success(`Ballot status changed to ${label}`, {
        description:
          data.status === "open"
            ? "Voting is now live and accepting ballots."
            : data.status === "closed"
              ? "Voting has ended. Official results are now finalized."
              : data.status === "scheduled"
                ? "Ballot is scheduled according to timeframe rules."
                : `Election marked as ${label.toLowerCase()}.`,
      });
    },
    onError: (error) => {
      toast.error("Could not update status", {
        description: error.message || "Failed to update election status.",
      });
    },
  });
  const updateMode = trpc.elections.updateBallotMode.useMutation({
    onSuccess: (data) => {
      refreshElection();
      toast.success(`Ballot mode updated to ${data.ballotMode}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateSchedule = trpc.elections.updateSchedule.useMutation({
    onSuccess: () => {
      refreshElection();
      toast.success("Election schedule saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateResultsVisibility =
    trpc.elections.updateResultsVisibility.useMutation({
      onSuccess: () => {
        refreshElection();
        toast.success("Results visibility updated");
      },
      onError: (err) => toast.error(err.message),
    });
  const addCandidate = trpc.elections.addCandidate.useMutation({
    onSuccess: () => {
      refreshElection();
      toast.success("Candidate added");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeCandidate = trpc.elections.removeCandidate.useMutation({
    onSuccess: () => {
      refreshElection();
      toast.success("Candidate removed");
    },
    onError: (err) => toast.error(err.message),
  });
  const enrollVoter = trpc.elections.enrollVoter.useMutation({
    onSuccess: () => {
      refreshElection();
      readiness.refetch();
      toast.success("Voter enrolled");
    },
    onError: (err) => toast.error(err.message),
  });
  const sendInvitation = trpc.elections.sendInvitation.useMutation({
    onSuccess: () => {
      refreshElection();
      readiness.refetch();
      toast.success("Invitation sent");
    },
    onError: (err) => toast.error(err.message),
  });
  const importVoters = trpc.elections.importVoters.useMutation({
    onSuccess: (data) => {
      refreshElection();
      toast.success(`Roster imported (${data?.length ?? 0} voters)`);
    },
    onError: (err) => toast.error(err.message),
  });
  const removeVoter = trpc.elections.removeVoter.useMutation({
    onSuccess: () => {
      refreshElection();
      toast.success("Voter removed");
    },
    onError: (err) => toast.error(err.message),
  });
  const exportRecord = trpc.elections.exportRecord.useQuery(
    { electionId },
    { enabled: false }
  );

  const [candidateName, setCandidateName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [voterName, setVoterName] = useState("");
  const [roster, setRoster] = useState("");
  const [candidateToRemove, setCandidateToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [voterToRemove, setVoterToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [resendingVoterId, setResendingVoterId] = useState<string | null>(null);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/ballot/${electionId}`);
    setCopiedLink(true);
    toast.success("Ballot link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    if (election) {
      setOpensAt(localDateTime(election.opensAt));
      setClosesAt(localDateTime(election.closesAt));
    }
  }, [election?.id, election?.opensAt, election?.closesAt]);

  if (electionQuery.isLoading)
    return <div className="app-loading">Opening the election desk…</div>;
  if (!election)
    return (
      <div className="app-loading">
        <div>
          <h1>Election not found</h1>
          <Button
            className="button-ink"
            onClick={() => setLocation("/workspace")}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    );

  const isConfigurable =
    election.status === "draft" || election.status === "scheduled";
  const isDraft = election.status === "draft";
  const submitCandidate = (event: FormEvent) => {
    event.preventDefault();
    addCandidate.mutate(
      { electionId, name: candidateName },
      { onSuccess: () => setCandidateName("") }
    );
  };
  const submitVoter = (event: FormEvent) => {
    event.preventDefault();
    enrollVoter.mutate(
      { electionId, email: voterEmail, displayName: voterName || undefined },
      {
        onSuccess: () => {
          setVoterEmail("");
          setVoterName("");
        },
      }
    );
  };
  const submitRoster = (event: FormEvent) => {
    event.preventDefault();
    importVoters.mutate(
      { electionId, roster },
      { onSuccess: () => setRoster("") }
    );
  };
  const downloadRecord = async () => {
    const response = await exportRecord.refetch();
    if (!response.data) return;
    const record = response.data;
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${election.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-record.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="workspace-shell election-shell">
      <header className="workspace-header">
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
          onClick={() => setLocation("/workspace")}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </header>
      <main className="election-main">
        <div className="election-hero">
          <div>
            <div className="crumb">
              ELECTION DESK <ChevronRight size={14} /> {election.status}
            </div>
            <h1>{election.title}</h1>
            <p>{election.description || election.ballotPrompt}</p>
          </div>
          <div className="election-controls">
            <label>
              Status
              <select
                value={election.status}
                disabled={updateStatus.isPending}
                onChange={event => {
                  const newStatus = event.target.value as (typeof statusOptions)[number];
                  if (newStatus !== election.status) {
                    updateStatus.mutate({ electionId, status: newStatus });
                  }
                }}
              >
                {(allowedNext[election.status as ElectionStatusOption] || statusOptions).map(status => (
                  <option key={status} value={status}>
                    {statusLabel[status] || status}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="button-ink"
              onClick={() => setLocation(`/ballot/${election.id}`)}
            >
              Preview ballot <Send size={16} />
            </Button>
          </div>
          {updateStatus.error && (
            <p className="form-error">{updateStatus.error.message}</p>
          )}
        </div>

        {/* BALLOT LIFECYCLE & SHARING BANNER */}
        <section
          style={{
            margin: "20px 0",
            background: election.status === "open" ? "#eef8f6" : "#fdf9f0",
            border:
              election.status === "open"
                ? "1.5px solid #6ec1b1"
                : "1.5px solid #dcd0ba",
            borderRadius: "10px",
            padding: "20px 24px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    background:
                      election.status === "open"
                        ? "#196b4b"
                        : election.status === "draft"
                        ? "#b58728"
                        : "#66777b",
                    color: "#fff",
                  }}
                >
                  {election.status === "open"
                    ? "● Live Voting"
                    : election.status === "draft"
                    ? "Draft Ballot"
                    : election.status === "closed"
                    ? "Voting Closed"
                    : election.status}
                </span>
                <span style={{ fontSize: "12px", color: "#607477" }}>
                  {election.ballotMode === "anonymous"
                    ? "🔒 Anonymous (Secret Ballot)"
                    : "👁️ Visible Roll Call"}
                </span>
              </div>
              <h2
                style={{
                  fontFamily: '"DM Serif Display", Georgia, serif',
                  fontSize: "22px",
                  margin: "4px 0",
                  color: "#11383e",
                }}
              >
                {election.status === "draft"
                  ? "Ready to publish and share?"
                  : election.status === "open"
                  ? "Your ballot is live and accepting votes!"
                  : "This election is completed."}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#566b70",
                  maxWidth: "600px",
                }}
              >
                {election.status === "draft"
                  ? "Review your candidates and rules below. When you're ready, publish your ballot to unlock the shareable voting link."
                  : election.status === "open"
                  ? "Copy your unique voting link and share it on Slack, WhatsApp, email, or social media. Anyone with the link can cast one vote."
                  : "Final vote totals have been recorded. You can view the results breakdown or export the record below."}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="outline"
                onClick={() => setLocation(`/ballot/${election.id}`)}
                style={{ borderColor: "#c4b59b", gap: "6px" }}
              >
                <Eye size={16} /> Preview ballot
              </Button>
              {election.status === "draft" && (
                <Button
                  className="button-ink"
                  onClick={() =>
                    updateStatus.mutate({ electionId, status: "open" })
                  }
                  disabled={
                    updateStatus.isPending || election.candidates.length < 2
                  }
                  style={{ gap: "6px" }}
                >
                  {updateStatus.isPending ? "Publishing…" : "Publish ballot now"}
                  <ArrowRight size={16} />
                </Button>
              )}
              {election.status === "open" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    updateStatus.mutate({ electionId, status: "closed" })
                  }
                  disabled={updateStatus.isPending}
                  style={{ borderColor: "#d89e90", color: "#8a3528" }}
                >
                  {updateStatus.isPending ? "Closing…" : "Close voting"}
                </Button>
              )}
            </div>
          </div>

          {/* Share Link Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "#fff",
              border: "1px solid #d5cbb8",
              borderRadius: "8px",
              padding: "8px 12px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flex: 1,
                minWidth: "240px",
              }}
            >
              <Share2 size={16} style={{ color: "#196b4b", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#163a40",
                  flexShrink: 0,
                }}
              >
                Voting link:
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: "#2a545c",
                  fontFamily: "monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {window.location.origin}/ballot/{election.id}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                size="sm"
                onClick={handleCopyLink}
                className="button-ink"
                style={{ height: "34px", padding: "0 14px", gap: "6px" }}
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedLink ? "Link copied!" : "Copy link"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQrModalOpen(true)}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  gap: "6px",
                  borderColor: "#c8baa2",
                  color: "#114b54",
                  fontWeight: 650,
                }}
                title="Display QR code for phone scanning"
              >
                <QrCode size={15} />
                <span>QR Code</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/ballot/${election.id}`, "_blank")}
                style={{
                  height: "34px",
                  padding: "0 10px",
                  borderColor: "#c8baa2",
                }}
                title="Open voting page in new tab"
              >
                <ExternalLink size={14} />
              </Button>
            </div>
          </div>

          {/* Live Votes Summary Card */}
          {results.data && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #d5cbb8",
                borderRadius: "8px",
                padding: "16px 18px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      color: "#5c7176",
                      textTransform: "uppercase",
                    }}
                  >
                    {election.status === "open"
                      ? "LIVE VOTE TALLY"
                      : "RECORDED VOTE TALLY"}
                  </span>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "#11383e",
                      marginTop: "2px",
                    }}
                  >
                    {(results.data as any).totalVotes ??
                      results.data.candidateResults.reduce(
                        (sum, c) => sum + c.voteCount,
                        0
                      )}{" "}
                    total votes cast
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => results.refetch()}
                  style={{
                    height: "30px",
                    fontSize: "12px",
                    borderColor: "#c8baa2",
                  }}
                >
                  Refresh tally
                </Button>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {results.data.candidateResults.map((result) => {
                  const total =
                    (results.data as any).totalVotes ??
                    results.data.candidateResults.reduce(
                      (sum, c) => sum + c.voteCount,
                      0
                    ) ??
                    0;
                  const pct =
                    total > 0
                      ? Math.round((result.voteCount / total) * 100)
                      : 0;
                  return (
                    <div key={result.candidateId}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "13px",
                          marginBottom: "4px",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "#163a40" }}>
                          {result.candidateName}
                        </span>
                        <span style={{ color: "#566b70" }}>
                          <strong>{result.voteCount}</strong> ({pct}%)
                        </span>
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
                            width: `${Math.max(result.voteCount > 0 ? 5 : 0, pct)}%`,
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
        </section>

        <section className="privacy-control">
          <div className="privacy-control-title">
            {election.ballotMode === "anonymous" ? (
              <LockKeyhole size={21} />
            ) : (
              <Eye size={21} />
            )}
            <div>
              <span>VOTER DISCLOSURE</span>
              <h3>
                {election.ballotMode === "anonymous"
                  ? "Anonymous ballot"
                  : "Attributable ballot"}
              </h3>
            </div>
          </div>
          <p>
            {election.ballotMode === "anonymous"
              ? "Voter identity confirms eligibility. The stored vote does not retain a voter-to-selection link."
              : "Voters are shown a required acknowledgement that administrators can view their recorded choice."}
          </p>
          {isDraft && (
            <div className="privacy-options">
              <button
                className={election.ballotMode === "anonymous" ? "active" : ""}
                onClick={() =>
                  updateMode.mutate({ electionId, ballotMode: "anonymous" })
                }
              >
                <LockKeyhole size={15} /> Anonymous
              </button>
              <button
                className={
                  election.ballotMode === "attributable" ? "active" : ""
                }
                onClick={() =>
                  updateMode.mutate({ electionId, ballotMode: "attributable" })
                }
              >
                <UsersRound size={15} /> Attributable
              </button>
              <small>Locks as soon as the first voter is enrolled.</small>
            </div>
          )}
          {updateMode.error && (
            <p className="form-error">{updateMode.error.message}</p>
          )}
        </section>

        {isConfigurable && (
          <section className="admin-panel lifecycle-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">TIMING & RESULTS</span>
                <h2>Set the operating rules</h2>
              </div>
              <CalendarClock size={20} />
            </div>
            <div className="form-grid">
              <div>
                <Label htmlFor="desk-opens">
                  Opens at <small>Optional</small>
                </Label>
                <Input
                  id="desk-opens"
                  type="datetime-local"
                  value={opensAt}
                  onChange={event => setOpensAt(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="desk-closes">
                  Closes at <small>Optional</small>
                </Label>
                <Input
                  id="desk-closes"
                  type="datetime-local"
                  value={closesAt}
                  onChange={event => setClosesAt(event.target.value)}
                />
              </div>
            </div>
            <div className="lifecycle-actions">
              <label>
                Administrator results view
                <select
                  value={election.resultsVisibility}
                  onChange={event =>
                    updateResultsVisibility.mutate({
                      electionId,
                      resultsVisibility: event.target.value as
                        | "after_close"
                        | "always"
                        | "admins_only",
                    })
                  }
                >
                  <option value="after_close">
                    Available after the election closes
                  </option>
                  <option value="admins_only">
                    Restricted to administrators
                  </option>
                  <option value="always">
                    Available to administrators throughout
                  </option>
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateSchedule.mutate({
                    electionId,
                    opensAt: opensAt ? new Date(opensAt) : null,
                    closesAt: closesAt ? new Date(closesAt) : null,
                  })
                }
                disabled={updateSchedule.isPending}
              >
                Save schedule
              </Button>
            </div>
            {(updateSchedule.error || updateResultsVisibility.error) && (
              <p className="form-error">
                {updateSchedule.error?.message ||
                  updateResultsVisibility.error?.message}
              </p>
            )}
          </section>
        )}

        <div className="election-grid">
          <section className="admin-panel candidate-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">THE BALLOT</span>
                <h2>{election.ballotPrompt}</h2>
              </div>
              <span className="panel-count">
                {election.candidates.length} candidate
                {election.candidates.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="candidate-admin-list">
              {election.candidates.map((candidate, index) => (
                <div key={candidate.id} className="candidate-admin">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{candidate.name}</strong>
                    <small>
                      {candidate.biography || "Candidate profile to be added"}
                    </small>
                  </div>
                  {isConfigurable && (
                    <button
                      className="icon-danger"
                      aria-label={`Remove ${candidate.name}`}
                      onClick={() => setCandidateToRemove(candidate)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isConfigurable && (
              <form className="inline-form" onSubmit={submitCandidate}>
                <Input
                  value={candidateName}
                  onChange={event => setCandidateName(event.target.value)}
                  placeholder="Candidate name"
                  required
                />
                <Button
                  type="submit"
                  disabled={addCandidate.isPending}
                  className="square-button"
                >
                  <Plus size={18} />
                </Button>
              </form>
            )}
            {(addCandidate.error || removeCandidate.error) && (
              <p className="form-error">
                {addCandidate.error?.message || removeCandidate.error?.message}
              </p>
            )}
          </section>
          <section className="admin-panel voter-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">ELIGIBILITY</span>
                <h2>Voter enrollment</h2>
              </div>
              <span className="panel-count">
                {voters.data?.length ?? 0} enrolled
              </span>
            </div>

            {election.ballotMode === "anonymous" ? (
              /* ── ANONYMOUS MODE: privacy shield, no individual names ── */
              <div className="anon-voter-shield">
                <div className="anon-shield-icon"><LockKeyhole size={22} /></div>
                <div className="anon-shield-body">
                  <strong>Voter identities are protected</strong>
                  <p>
                    This is an anonymous ballot. Individual voter names and
                    selections are not displayed — even to administrators — to
                    preserve ballot integrity.
                  </p>
                  <div className="anon-turnout-stats">
                    <div>
                      <strong>{voters.data?.length ?? 0}</strong>
                      <span>Enrolled</span>
                    </div>
                    <div>
                      <strong>
                        {(results.data as any)?.totalVotes ??
                          results.data?.candidateResults?.reduce(
                            (s: number, c: any) => s + c.voteCount,
                            0
                          ) ??
                          0}
                      </strong>
                      <span>Votes Cast</span>
                    </div>
                    <div>
                      <strong>
                        {(() => {
                          const enrolled = voters.data?.length ?? 0;
                          const cast =
                            (results.data as any)?.totalVotes ??
                            results.data?.candidateResults?.reduce(
                              (s: number, c: any) => s + c.voteCount,
                              0
                            ) ??
                            0;
                          if (enrolled > 0) return `${Math.round((cast / enrolled) * 100)}%`;
                          return `${cast} cast`;
                        })()}
                      </strong>
                      <span>Turnout</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── ATTRIBUTABLE MODE: show full voter list ── */
              <div className="voter-list">
                {voters.data?.length ? (
                  voters.data.map(voter => (
                    <div key={voter.id}>
                      <span className="voter-dot">
                        {voter.displayName?.slice(0, 1).toUpperCase() ||
                          voter.email.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{voter.displayName || voter.email}</strong>
                        <small>
                          {voter.hasVoted
                            ? "Ballot submitted"
                            : voter.invitationStatus === "revoked"
                              ? "Invitation revoked"
                              : voter.invitationStatus === "expired"
                                ? "Invitation expired"
                                : voter.activationStatus === "active"
                                  ? "Invitation accepted · eligible"
                                  : "Invitation pending · awaiting account sign-in"}
                        </small>
                      </span>
                      {voter.hasVoted ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        isConfigurable &&
                        voter.invitationStatus !== "revoked" && (
                          <div className="voter-actions">
                            <button
                              className="quiet-action"
                              disabled={sendInvitation.isPending && resendingVoterId === voter.id}
                              onClick={() => {
                                setResendingVoterId(voter.id);
                                sendInvitation.mutate(
                                  { electionId, voterId: voter.id },
                                  { onSettled: () => setResendingVoterId(null) }
                                );
                              }}
                            >
                              {sendInvitation.isPending && resendingVoterId === voter.id
                                ? "Sending…"
                                : voter.activationStatus === "active"
                                  ? "Resend"
                                  : "Invite"}
                            </button>
                            <button
                              className="icon-danger"
                              aria-label={`Revoke ${voter.email}`}
                              onClick={() =>
                                setVoterToRemove({
                                  id: voter.id,
                                  name: voter.displayName || voter.email,
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">No enrolled voters yet.</p>
                )}
              </div>
            )}

            {isConfigurable && (
              <>
                <form className="enroll-form" onSubmit={submitVoter}>
                  <div>
                    <Label htmlFor="voter-email">Voter email</Label>
                    <Input
                      id="voter-email"
                      type="email"
                      value={voterEmail}
                      onChange={event => setVoterEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="voter-name">
                      Name <small>Optional</small>
                    </Label>
                    <Input
                      id="voter-name"
                      value={voterName}
                      onChange={event => setVoterName(event.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={enrollVoter.isPending}
                    className="button-ink"
                  >
                    <UserPlus size={16} /> Create voter invitation
                  </Button>
                </form>
                <form className="roster-import" onSubmit={submitRoster}>
                  <Label htmlFor="roster">
                    Import invitations <small>Paste CSV: email,name</small>
                  </Label>
                  <Textarea
                    id="roster"
                    value={roster}
                    onChange={event => setRoster(event.target.value)}
                    placeholder={
                      "member@example.org, Jordan Lee\nsecond@example.org, Sam Patel"
                    }
                  />
                  <Button
                    variant="outline"
                    type="submit"
                    disabled={importVoters.isPending || !roster.trim()}
                  >
                    <Upload size={15} />{" "}
                    {importVoters.isPending
                      ? "Checking roster…"
                      : "Validate & import"}
                  </Button>
                </form>
              </>
            )}
            {(enrollVoter.error ||
              importVoters.error ||
              sendInvitation.error ||
              removeVoter.error) && (
              <p className="form-error">
                {enrollVoter.error?.message ||
                  importVoters.error?.message ||
                  sendInvitation.error?.message ||
                  removeVoter.error?.message}
              </p>
            )}
          </section>
        </div>
        {results.data && (() => {
          const totalVotes =
            (results.data as any).totalVotes ??
            results.data.candidateResults.reduce(
              (s: number, c: any) => s + c.voteCount,
              0
            );
          const sorted = results.data.candidateResults
            .slice()
            .sort((a, b) => b.voteCount - a.voteCount);
          const topCandidate = sorted[0];
          const BARS = ["#16515b","#c75945","#d4a82b","#2a7c67","#7b4f9a","#d96b37"];
          return (
            <section className="results-panel results-panel--rich">
              <div className="results-panel-head">
                <div>
                  <span className="section-label">
                    {election.status === "open" ? "LIVE INTERIM RESULTS" : "OFFICIAL RESULT"}
                  </span>
                  <h2>{election.status === "open" ? "Live vote totals" : "Final results"}</h2>
                  <p>
                    {totalVotes} votes cast · {results.data.eligibleVoters} registered voters
                    {results.data.eligibleVoters > 0 && (
                      <> · {Math.round((totalVotes / results.data.eligibleVoters) * 100)}% turnout</>
                    )}
                  </p>
                </div>
                {topCandidate && totalVotes > 0 && election.status !== "open" && (
                  <div className="results-winner-chip">
                    <span>🏆 {topCandidate.candidateName}</span>
                    <small>
                      {Math.round((topCandidate.voteCount / totalVotes) * 100)}% of votes
                    </small>
                  </div>
                )}
              </div>
              <div className="result-bars result-bars--rich">
                {sorted.map((result, idx) => {
                  const pct = totalVotes > 0 ? Math.round((result.voteCount / totalVotes) * 100) : 0;
                  return (
                    <div
                      key={result.candidateId}
                      className={idx === 0 && totalVotes > 0 ? "result-bar-top" : ""}
                    >
                      <span>{result.candidateName}</span>
                      <i style={{ width: `${Math.max(result.voteCount > 0 ? 8 : 0, pct)}%`, background: BARS[idx % BARS.length] }} />
                      <strong>{result.voteCount} ({pct}%)</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}
        <section className="records-panel">
          <div>
            <div>
              <span className="section-label">ELECTION RECORD</span>
              <h2>Audit & operational record</h2>
              <p>
                Export records exclude anonymous voter-to-selection links.
                Administrative actions are kept separately from ballot
                selections.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={downloadRecord}
              disabled={exportRecord.isFetching}
            >
              <Download size={16} />{" "}
              {exportRecord.isFetching ? "Preparing…" : "Export JSON"}
            </Button>
          </div>
          <details>
            <summary>
              <FileClock size={16} /> {audit.data?.length ?? 0} logged
              administrative events
            </summary>
            <div className="audit-list">
              {audit.data?.slice(0, 12).map(event => (
                <div key={event.id}>
                  <strong>{event.eventType.replaceAll("_", " ")}</strong>
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              )) || <p className="muted-copy">No audit events yet.</p>}
            </div>
          </details>
          {exportRecord.error && (
            <p className="form-error">{exportRecord.error.message}</p>
          )}
        </section>
      </main>
      <AlertDialog
        open={Boolean(candidateToRemove)}
        onOpenChange={open => !open && setCandidateToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              {candidateToRemove?.name} will be removed from this draft ballot.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (candidateToRemove)
                  removeCandidate.mutate({
                    electionId,
                    candidateId: candidateToRemove.id,
                  });
                setCandidateToRemove(null);
              }}
            >
              Remove candidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(voterToRemove)}
        onOpenChange={open => !open && setVoterToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove voter?</AlertDialogTitle>
            <AlertDialogDescription>
              {voterToRemove?.name} will lose eligibility for this election.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (voterToRemove)
                  removeVoter.mutate({ electionId, voterId: voterToRemove.id });
                setVoterToRemove(null);
              }}
            >
              Remove voter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QRCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        electionId={election.id}
        title={election.title}
        ballotMode={election.ballotMode}
      />
    </div>
  );
}
