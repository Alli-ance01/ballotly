import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, LockKeyhole, Plus, Send, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation, useRoute } from "wouter";

const statusOptions = ["draft", "scheduled", "open", "closed", "archived"] as const;

export default function ElectionManager() {
  const [, params] = useRoute("/elections/:electionId");
  const electionId = params?.electionId ?? "";
  const [, setLocation] = useLocation();
  const electionQuery = trpc.elections.get.useQuery({ electionId }, { enabled: Boolean(electionId) });
  const utils = trpc.useUtils();
  const updateStatus = trpc.elections.updateStatus.useMutation({ onSuccess: () => utils.elections.get.invalidate({ electionId }) });
  const updateMode = trpc.elections.updateBallotMode.useMutation({ onSuccess: () => utils.elections.get.invalidate({ electionId }) });
  const addCandidate = trpc.elections.addCandidate.useMutation({ onSuccess: () => utils.elections.get.invalidate({ electionId }) });
  const enrollVoter = trpc.elections.enrollVoter.useMutation({ onSuccess: () => utils.elections.listVoters.invalidate({ electionId }) });
  const voters = trpc.elections.listVoters.useQuery({ electionId }, { enabled: Boolean(electionId) });
  const [candidateName, setCandidateName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [voterName, setVoterName] = useState("");
  const election = electionQuery.data;
  const results = trpc.elections.results.useQuery({ electionId }, { enabled: Boolean(election && (election.status === "closed" || election.status === "archived" || election.resultsVisibility !== "after_close")) });

  if (electionQuery.isLoading) return <div className="app-loading">Opening the election desk…</div>;
  if (!election) return <div className="app-loading"><div><h1>Election not found</h1><Button className="button-ink" onClick={() => setLocation("/workspace")}>Return to workspace</Button></div></div>;
  const isDraft = election.status === "draft";
  const addCandidateSubmit = (event: FormEvent) => { event.preventDefault(); addCandidate.mutate({ electionId, name: candidateName }, { onSuccess: () => setCandidateName("") }); };
  const addVoterSubmit = (event: FormEvent) => { event.preventDefault(); enrollVoter.mutate({ electionId, email: voterEmail, displayName: voterName || undefined }, { onSuccess: () => { setVoterEmail(""); setVoterName(""); } }); };

  return <div className="workspace-shell election-shell">
    <header className="workspace-header"><button className="brand-lockup" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="quiet-back" onClick={() => setLocation(`/workspace?org=${election.organizationId}`)}><ArrowLeft size={16} /> Election boards</button></header>
    <main className="election-main">
      <div className="election-hero"><div><div className="crumb">ELECTION DESK <ChevronRight size={14} /> {election.status}</div><h1>{election.title}</h1><p>{election.description || election.ballotPrompt}</p></div><div className="election-controls"><label>Status<select value={election.status} disabled={updateStatus.isPending} onChange={event => updateStatus.mutate({ electionId, status: event.target.value as typeof statusOptions[number] })}>{statusOptions.map(status => <option key={status} value={status}>{status}</option>)}</select></label><Button className="button-ink" onClick={() => setLocation(`/ballot/${election.id}`)}>Preview ballot <Send size={16} /></Button></div></div>
      <section className="privacy-control"><div className="privacy-control-title">{election.ballotMode === "anonymous" ? <LockKeyhole size={21} /> : <Eye size={21} />}<div><span>VOTER DISCLOSURE</span><h3>{election.ballotMode === "anonymous" ? "Anonymous ballot" : "Attributable ballot"}</h3></div></div><p>{election.ballotMode === "anonymous" ? "Voter identity confirms eligibility. The stored vote does not retain a voter-to-selection link." : "Voters are shown a required acknowledgement that administrators can view their recorded choice."}</p>{isDraft && <div className="privacy-options"><button className={election.ballotMode === "anonymous" ? "active" : ""} onClick={() => updateMode.mutate({ electionId, ballotMode: "anonymous" })}><LockKeyhole size={15} /> Anonymous</button><button className={election.ballotMode === "attributable" ? "active" : ""} onClick={() => updateMode.mutate({ electionId, ballotMode: "attributable" })}><UsersRound size={15} /> Attributable</button><small>Locks as soon as the first voter is enrolled.</small></div>}{updateMode.error && <p className="form-error">{updateMode.error.message}</p>}</section>
      <div className="election-grid">
        <section className="admin-panel candidate-panel"><div className="panel-heading"><div><span className="section-label">THE BALLOT</span><h2>{election.ballotPrompt}</h2></div><span className="panel-count">{election.candidates.length} candidate{election.candidates.length === 1 ? "" : "s"}</span></div><div className="candidate-admin-list">{election.candidates.map((candidate, index) => <div key={candidate.id} className="candidate-admin"><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{candidate.name}</strong><small>{candidate.biography || "Candidate profile to be added"}</small></div></div>)}</div>{isDraft && <form className="inline-form" onSubmit={addCandidateSubmit}><Input value={candidateName} onChange={event => setCandidateName(event.target.value)} placeholder="Candidate name" required /><Button type="submit" disabled={addCandidate.isPending} className="square-button"><Plus size={18} /></Button></form>}{addCandidate.error && <p className="form-error">{addCandidate.error.message}</p>}</section>
        <section className="admin-panel voter-panel"><div className="panel-heading"><div><span className="section-label">ELIGIBILITY</span><h2>People who can vote</h2></div><span className="panel-count">{voters.data?.length ?? 0} enrolled</span></div><div className="voter-list">{voters.data?.length ? voters.data.map(voter => <div key={voter.id}><span className="voter-dot">{voter.displayName?.slice(0, 1).toUpperCase() || voter.email.slice(0, 1).toUpperCase()}</span><span><strong>{voter.displayName || voter.email}</strong><small>{voter.displayName ? voter.email : voter.hasVoted ? "Ballot submitted" : "Eligible"}</small></span>{voter.hasVoted && <CheckCircle2 size={16} />}</div>) : <p className="muted-copy">No enrolled voters yet.</p>}</div>{isDraft && <form className="enroll-form" onSubmit={addVoterSubmit}><div><Label htmlFor="voter-email">Voter email</Label><Input id="voter-email" type="email" value={voterEmail} onChange={event => setVoterEmail(event.target.value)} required /></div><div><Label htmlFor="voter-name">Name <small>Optional</small></Label><Input id="voter-name" value={voterName} onChange={event => setVoterName(event.target.value)} /></div><Button type="submit" disabled={enrollVoter.isPending} className="button-ink"><UserPlus size={16} /> Enroll voter</Button></form>}{enrollVoter.error && <p className="form-error">{enrollVoter.error.message}</p>}</section>
      </div>
      {(election.status === "closed" || election.status === "archived") && <section className="results-panel"><div><span className="section-label">OFFICIAL RESULT</span><h2>Vote totals</h2><p>{results.data?.eligibleVoters ?? 0} eligible voters</p></div><div className="result-bars">{results.data?.candidateResults.map(result => <div key={result.candidateId}><span>{result.candidateName}</span><i style={{ width: `${Math.max(8, (result.voteCount / Math.max(1, results.data?.eligibleVoters ?? 1)) * 100)}%` }} /><strong>{result.voteCount}</strong></div>)}</div></section>}
    </main>
  </div>;
}
