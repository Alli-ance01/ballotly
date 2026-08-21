import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarClock, CheckCircle2, ChevronRight, Download, Eye, FileClock, LockKeyhole, Plus, Send, ShieldAlert, Trash2, Upload, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";

const statusOptions = ["draft", "scheduled", "open", "closed", "archived"] as const;
const localDateTime = (value?: Date | string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";

export default function ElectionManager() {
  const [, params] = useRoute("/elections/:electionId");
  const electionId = params?.electionId ?? "";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const electionQuery = trpc.elections.get.useQuery({ electionId }, { enabled: Boolean(electionId) });
  const voters = trpc.elections.listVoters.useQuery({ electionId }, { enabled: Boolean(electionId) });
  const audit = trpc.elections.audit.useQuery({ electionId }, { enabled: Boolean(electionId) });
  const election = electionQuery.data;
  const results = trpc.elections.results.useQuery({ electionId }, { enabled: Boolean(election && (election.status === "closed" || election.status === "archived" || election.resultsVisibility !== "after_close")) });
  const refreshElection = () => { utils.elections.get.invalidate({ electionId }); utils.elections.listVoters.invalidate({ electionId }); audit.refetch(); };
  const updateStatus = trpc.elections.updateStatus.useMutation({ onSuccess: refreshElection });
  const updateMode = trpc.elections.updateBallotMode.useMutation({ onSuccess: refreshElection });
  const updateSchedule = trpc.elections.updateSchedule.useMutation({ onSuccess: refreshElection });
  const updateResultsVisibility = trpc.elections.updateResultsVisibility.useMutation({ onSuccess: refreshElection });
  const addCandidate = trpc.elections.addCandidate.useMutation({ onSuccess: refreshElection });
  const removeCandidate = trpc.elections.removeCandidate.useMutation({ onSuccess: refreshElection });
  const enrollVoter = trpc.elections.enrollVoter.useMutation({ onSuccess: refreshElection });
  const importVoters = trpc.elections.importVoters.useMutation({ onSuccess: refreshElection });
  const removeVoter = trpc.elections.removeVoter.useMutation({ onSuccess: refreshElection });
  const exportRecord = trpc.elections.exportRecord.useQuery({ electionId }, { enabled: false });

  const [candidateName, setCandidateName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [voterName, setVoterName] = useState("");
  const [roster, setRoster] = useState("");
  const [pendingStatus, setPendingStatus] = useState<typeof statusOptions[number] | null>(null);
  const [candidateToRemove, setCandidateToRemove] = useState<{ id: string; name: string } | null>(null);
  const [voterToRemove, setVoterToRemove] = useState<{ id: string; name: string } | null>(null);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");

  useEffect(() => {
    if (election) {
      setOpensAt(localDateTime(election.opensAt));
      setClosesAt(localDateTime(election.closesAt));
    }
  }, [election?.id, election?.opensAt, election?.closesAt]);

  if (electionQuery.isLoading) return <div className="app-loading">Opening the election desk…</div>;
  if (!election) return <div className="app-loading"><div><h1>Election not found</h1><Button className="button-ink" onClick={() => setLocation("/workspace")}>Return to workspace</Button></div></div>;

  const isConfigurable = election.status === "draft" || election.status === "scheduled";
  const isDraft = election.status === "draft";
  const transitionCopy = pendingStatus === "open" ? "Opening confirms the candidates, voter roster, and privacy configuration. Eligibility will then lock." : pendingStatus === "closed" ? "Closing stops new ballots and makes final totals available according to the results rule." : `Move this election to ${pendingStatus ?? "the selected state"}?`;
  const submitCandidate = (event: FormEvent) => { event.preventDefault(); addCandidate.mutate({ electionId, name: candidateName }, { onSuccess: () => setCandidateName("") }); };
  const submitVoter = (event: FormEvent) => { event.preventDefault(); enrollVoter.mutate({ electionId, email: voterEmail, displayName: voterName || undefined }, { onSuccess: () => { setVoterEmail(""); setVoterName(""); } }); };
  const submitRoster = (event: FormEvent) => { event.preventDefault(); importVoters.mutate({ electionId, roster }, { onSuccess: () => setRoster("") }); };
  const downloadRecord = async () => {
    const response = await exportRecord.refetch();
    if (!response.data) return;
    const record = response.data;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${election.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-record.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="workspace-shell election-shell">
    <header className="workspace-header"><button className="brand-lockup" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="quiet-back" onClick={() => setLocation(`/workspace?org=${election.organizationId}`)}><ArrowLeft size={16} /> Election boards</button></header>
    <main className="election-main">
      <div className="election-hero"><div><div className="crumb">ELECTION DESK <ChevronRight size={14} /> {election.status}</div><h1>{election.title}</h1><p>{election.description || election.ballotPrompt}</p></div><div className="election-controls"><label>Status<select value={election.status} disabled={updateStatus.isPending} onChange={event => setPendingStatus(event.target.value as typeof statusOptions[number])}>{statusOptions.map(status => <option key={status} value={status}>{status}</option>)}</select></label><Button className="button-ink" onClick={() => setLocation(`/ballot/${election.id}`)}>Preview ballot <Send size={16} /></Button></div></div>

      <section className="production-review"><div><span className="section-label">CONTROLLED ELECTION SETUP</span><h2>Review before you open.</h2><p>Opening requires at least two candidates and one eligible voter. Once opened, the roster, ballot choices, privacy model, and results rule become read-only.</p></div><div className="review-chips"><span className={election.candidates.length >= 2 ? "ready" : "needs-work"}>{election.candidates.length >= 2 ? "✓" : "!"} {election.candidates.length} candidates</span><span className={(voters.data?.length ?? 0) >= 1 ? "ready" : "needs-work"}>{(voters.data?.length ?? 0) >= 1 ? "✓" : "!"} {voters.data?.length ?? 0} voters</span><span className="ready"><LockKeyhole size={13} /> {election.ballotMode}</span></div></section>

      <section className="privacy-control"><div className="privacy-control-title">{election.ballotMode === "anonymous" ? <LockKeyhole size={21} /> : <Eye size={21} />}<div><span>VOTER DISCLOSURE</span><h3>{election.ballotMode === "anonymous" ? "Anonymous ballot" : "Attributable ballot"}</h3></div></div><p>{election.ballotMode === "anonymous" ? "Voter identity confirms eligibility. The stored vote does not retain a voter-to-selection link." : "Voters are shown a required acknowledgement that administrators can view their recorded choice."}</p>{isDraft && <div className="privacy-options"><button className={election.ballotMode === "anonymous" ? "active" : ""} onClick={() => updateMode.mutate({ electionId, ballotMode: "anonymous" })}><LockKeyhole size={15} /> Anonymous</button><button className={election.ballotMode === "attributable" ? "active" : ""} onClick={() => updateMode.mutate({ electionId, ballotMode: "attributable" })}><UsersRound size={15} /> Attributable</button><small>Locks as soon as the first voter is enrolled.</small></div>}{updateMode.error && <p className="form-error">{updateMode.error.message}</p>}</section>

      {isConfigurable && <section className="admin-panel lifecycle-panel"><div className="panel-heading"><div><span className="section-label">TIMING & RESULTS</span><h2>Set the operating rules</h2></div><CalendarClock size={20} /></div><div className="form-grid"><div><Label htmlFor="desk-opens">Opens at <small>Optional</small></Label><Input id="desk-opens" type="datetime-local" value={opensAt} onChange={event => setOpensAt(event.target.value)} /></div><div><Label htmlFor="desk-closes">Closes at <small>Optional</small></Label><Input id="desk-closes" type="datetime-local" value={closesAt} onChange={event => setClosesAt(event.target.value)} /></div></div><div className="lifecycle-actions"><label>Administrator results view<select value={election.resultsVisibility} onChange={event => updateResultsVisibility.mutate({ electionId, resultsVisibility: event.target.value as "after_close" | "always" | "admins_only" })}><option value="after_close">Available after the election closes</option><option value="admins_only">Restricted to administrators</option><option value="always">Available to administrators throughout</option></select></label><Button type="button" variant="outline" onClick={() => updateSchedule.mutate({ electionId, opensAt: opensAt ? new Date(opensAt) : null, closesAt: closesAt ? new Date(closesAt) : null })} disabled={updateSchedule.isPending}>Save schedule</Button></div>{(updateSchedule.error || updateResultsVisibility.error) && <p className="form-error">{updateSchedule.error?.message || updateResultsVisibility.error?.message}</p>}</section>}

      <div className="election-grid">
        <section className="admin-panel candidate-panel"><div className="panel-heading"><div><span className="section-label">THE BALLOT</span><h2>{election.ballotPrompt}</h2></div><span className="panel-count">{election.candidates.length} candidate{election.candidates.length === 1 ? "" : "s"}</span></div><div className="candidate-admin-list">{election.candidates.map((candidate, index) => <div key={candidate.id} className="candidate-admin"><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{candidate.name}</strong><small>{candidate.biography || "Candidate profile to be added"}</small></div>{isConfigurable && <button className="icon-danger" aria-label={`Remove ${candidate.name}`} onClick={() => setCandidateToRemove(candidate)}><Trash2 size={16} /></button>}</div>)}</div>{isConfigurable && <form className="inline-form" onSubmit={submitCandidate}><Input value={candidateName} onChange={event => setCandidateName(event.target.value)} placeholder="Candidate name" required /><Button type="submit" disabled={addCandidate.isPending} className="square-button"><Plus size={18} /></Button></form>}{addCandidate.error && <p className="form-error">{addCandidate.error.message}</p>}</section>
        <section className="admin-panel voter-panel"><div className="panel-heading"><div><span className="section-label">ELIGIBILITY</span><h2>People who can vote</h2></div><span className="panel-count">{voters.data?.length ?? 0} enrolled</span></div><div className="voter-list">{voters.data?.length ? voters.data.map(voter => <div key={voter.id}><span className="voter-dot">{voter.displayName?.slice(0, 1).toUpperCase() || voter.email.slice(0, 1).toUpperCase()}</span><span><strong>{voter.displayName || voter.email}</strong><small>{voter.hasVoted ? "Ballot submitted" : voter.invitationStatus === "revoked" ? "Invitation revoked" : voter.invitationStatus === "expired" ? "Invitation expired" : voter.activationStatus === "active" ? "Invitation accepted · eligible" : "Invitation pending · awaiting account sign-in"}</small></span>{voter.hasVoted ? <CheckCircle2 size={16} /> : isConfigurable && voter.invitationStatus !== "revoked" && <button className="icon-danger" aria-label={`Revoke ${voter.email}`} onClick={() => setVoterToRemove({ id: voter.id, name: voter.displayName || voter.email })}><Trash2 size={16} /></button>}</div>) : <p className="muted-copy">No enrolled voters yet.</p>}</div>{isConfigurable && <><form className="enroll-form" onSubmit={submitVoter}><div><Label htmlFor="voter-email">Voter email</Label><Input id="voter-email" type="email" value={voterEmail} onChange={event => setVoterEmail(event.target.value)} required /></div><div><Label htmlFor="voter-name">Name <small>Optional</small></Label><Input id="voter-name" value={voterName} onChange={event => setVoterName(event.target.value)} /></div><Button type="submit" disabled={enrollVoter.isPending} className="button-ink"><UserPlus size={16} /> Create voter invitation</Button></form><form className="roster-import" onSubmit={submitRoster}><Label htmlFor="roster">Import invitations <small>Paste CSV: email,name</small></Label><Textarea id="roster" value={roster} onChange={event => setRoster(event.target.value)} placeholder={"member@example.org, Jordan Lee\nsecond@example.org, Sam Patel"} /><Button variant="outline" type="submit" disabled={importVoters.isPending || !roster.trim()}><Upload size={15} /> {importVoters.isPending ? "Checking roster…" : "Validate & import"}</Button></form></>}{(enrollVoter.error || importVoters.error) && <p className="form-error">{enrollVoter.error?.message || importVoters.error?.message}</p>}</section>
      </div>
      {(election.status === "closed" || election.status === "archived") && <section className="results-panel"><div><span className="section-label">OFFICIAL RESULT</span><h2>Vote totals</h2><p>{results.data?.eligibleVoters ?? 0} eligible voters</p></div><div className="result-bars">{results.data?.candidateResults.map(result => <div key={result.candidateId}><span>{result.candidateName}</span><i style={{ width: `${Math.max(8, (result.voteCount / Math.max(1, results.data?.eligibleVoters ?? 1)) * 100)}%` }} /><strong>{result.voteCount}</strong></div>)}</div></section>}
      <section className="records-panel"><div><div><span className="section-label">ELECTION RECORD</span><h2>Audit & operational record</h2><p>Export records exclude anonymous voter-to-selection links. Administrative actions are kept separately from ballot selections.</p></div><Button variant="outline" onClick={downloadRecord} disabled={exportRecord.isFetching}><Download size={16} /> {exportRecord.isFetching ? "Preparing…" : "Export JSON"}</Button></div><details><summary><FileClock size={16} /> {audit.data?.length ?? 0} logged administrative events</summary><div className="audit-list">{audit.data?.slice(0, 12).map(event => <div key={event.id}><strong>{event.eventType.replaceAll("_", " ")}</strong><span>{new Date(event.createdAt).toLocaleString()}</span></div>) || <p className="muted-copy">No audit events yet.</p>}</div></details>{exportRecord.error && <p className="form-error">{exportRecord.error.message}</p>}</section>
    </main>
    <AlertDialog open={Boolean(pendingStatus)} onOpenChange={open => !open && setPendingStatus(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm election status</AlertDialogTitle><AlertDialogDescription>{transitionCopy}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep current status</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingStatus) updateStatus.mutate({ electionId, status: pendingStatus }); setPendingStatus(null); }}>Confirm status change</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(candidateToRemove)} onOpenChange={open => !open && setCandidateToRemove(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove candidate?</AlertDialogTitle><AlertDialogDescription>{candidateToRemove?.name} will be removed from this draft ballot. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (candidateToRemove) removeCandidate.mutate({ electionId, candidateId: candidateToRemove.id }); setCandidateToRemove(null); }}>Remove candidate</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(voterToRemove)} onOpenChange={open => !open && setVoterToRemove(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove voter?</AlertDialogTitle><AlertDialogDescription>{voterToRemove?.name} will lose eligibility for this election. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (voterToRemove) removeVoter.mutate({ electionId, voterId: voterToRemove.id }); setVoterToRemove(null); }}>Remove voter</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
