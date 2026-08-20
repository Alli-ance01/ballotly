import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";

export default function Ballot() {
  const [, params] = useRoute("/ballot/:electionId");
  const electionId = params?.electionId ?? "";
  const [, setLocation] = useLocation();
  const ballot = trpc.voting.ballot.useQuery({ electionId }, { enabled: Boolean(electionId) });
  const castVote = trpc.voting.cast.useMutation({ onSuccess: () => ballot.refetch() });
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const data = ballot.data;
  if (ballot.isLoading) return <div className="app-loading">Preparing your ballot…</div>;
  if (!data) return <div className="app-loading"><div><h1>Ballot unavailable</h1><p>You may not be enrolled for this election.</p><Button className="button-ink" onClick={() => setLocation("/workspace")}>Return to Ballotly</Button></div></div>;
  const { election, eligibility, disclosure } = data;
  const attributable = election.ballotMode === "attributable";
  const submit = () => { if (selectedCandidate) castVote.mutate({ electionId, candidateId: selectedCandidate, attributableDisclosureAcknowledged: acknowledged }); };

  return <div className="ballot-page"><header className="ballot-header"><button className="brand-lockup" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="quiet-back" onClick={() => setLocation(`/elections/${election.id}`)}><ArrowLeft size={16} /> Leave ballot</button></header><main className="ballot-main"><div className="ballot-meta"><span>{election.status === "open" ? "LIVE BALLOT" : "BALLOT PREVIEW"}</span><span>01 / 01</span></div><div className="ballot-title"><h1>{election.title}</h1><p>{election.description || "Please make your selection below."}</p></div><section className={`disclosure-banner ${attributable ? "attributable" : "anonymous"}`}>{attributable ? <Eye size={22} /> : <LockKeyhole size={22} />}<div><strong>{attributable ? "This ballot is attributable" : "This ballot is anonymous"}</strong><p>{disclosure}</p></div></section>{eligibility.hasVoted ? <section className="vote-success"><CheckCircle2 size={34} /><h2>Your ballot has been submitted.</h2><p>Thank you for participating in {election.title}.</p></section> : <><section className="ballot-question"><span>YOUR QUESTION</span><h2>{election.ballotPrompt}</h2></section><div className="ballot-options" role="radiogroup" aria-label={election.ballotPrompt}>{election.candidates.map((candidate, index) => <button className={`ballot-option ${selectedCandidate === candidate.id ? "selected" : ""}`} onClick={() => setSelectedCandidate(candidate.id)} role="radio" aria-checked={selectedCandidate === candidate.id} key={candidate.id}><span className="option-index">{String(index + 1).padStart(2, "0")}</span><span><strong>{candidate.name}</strong><small>{candidate.biography || "Candidate"}</small></span><span className="radio-visual" /></button>)}</div>{attributable && <label className="acknowledgement"><Checkbox checked={acknowledged} onCheckedChange={value => setAcknowledged(value === true)} /><span>I understand that election administrators can view my recorded choice in this election.</span></label>}{castVote.error && <p className="form-error">{castVote.error.message}</p>}<div className="ballot-submit"><div><ShieldCheck size={17} /><span>One ballot per enrolled voter</span></div><Button disabled={!selectedCandidate || !eligibility.isOpen || (attributable && !acknowledged) || castVote.isPending} onClick={submit} className="button-ink">{castVote.isPending ? "Submitting ballot…" : attributable ? "Acknowledge & submit" : "Submit anonymous ballot"}</Button></div></>}</main></div>;
}
