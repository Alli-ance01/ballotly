import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import "../governance.css";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, LockKeyhole, Plus, ShieldAlert, UserCog, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";

const statusClass = (status: string) => `election-status election-status-${status}`;

export default function OrganizationWorkspace() {
  const [location, setLocation] = useLocation();
  const organizationId = new URLSearchParams(location.split("?")[1] ?? "").get("org") ?? "";
  const organizations = trpc.organizations.listMine.useQuery();
  const selected = organizations.data?.find(record => record.organization.id === organizationId);
  const elections = trpc.elections.list.useQuery({ organizationId }, { enabled: Boolean(organizationId) });
  const members = trpc.organizations.members.useQuery({ organizationId }, { enabled: Boolean(organizationId) });
  const utils = trpc.useUtils();
  const createElection = trpc.elections.create.useMutation({ onSuccess: () => utils.elections.list.invalidate({ organizationId }) });
  const assignRole = trpc.organizations.assignRole.useMutation({ onSuccess: () => members.refetch() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("Who should represent the organization?");
  const [ballotMode, setBallotMode] = useState<"anonymous" | "attributable">("anonymous");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [administratorEmail, setAdministratorEmail] = useState("");

  if (!organizationId) return <div className="app-loading"><div><h1>Choose an organization</h1><Button className="button-ink" onClick={() => setLocation("/workspace")}>Return to organizations</Button></div></div>;
  if (organizations.isLoading) return <div className="app-loading">Loading workspace…</div>;
  if (organizations.error) return <div className="app-loading"><div><h1>Unable to load your workspace</h1><p>{organizations.error.message}</p><Button className="button-ink" onClick={() => organizations.refetch()}>Try again</Button></div></div>;
  if (!selected) return <div className="app-loading"><div><h1>Workspace unavailable</h1><Button onClick={() => setLocation("/workspace")} className="button-ink">Return to organizations</Button></div></div>;

  const canManage = selected.membership.role === "owner" || selected.membership.role === "admin";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    createElection.mutate({ organizationId, title, description: description || undefined, ballotPrompt: prompt, ballotMode, resultsVisibility: "after_close", opensAt: opensAt ? new Date(opensAt) : undefined, closesAt: closesAt ? new Date(closesAt) : undefined }, { onSuccess: election => { setDialogOpen(false); setLocation(`/elections/${election.id}`); } });
  };
  const addAdministrator = (event: FormEvent) => {
    event.preventDefault();
    assignRole.mutate({ organizationId, email: administratorEmail, role: "admin" }, { onSuccess: () => setAdministratorEmail("") });
  };

  return <div className="workspace-shell">
    <header className="workspace-header"><button className="brand-lockup" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="quiet-back" onClick={() => setLocation("/workspace")}><ArrowLeft size={16} /> All organizations</button></header>
    <main className="organization-main">
      <div className="organization-heading"><div><div className="crumb">{selected.organization.slug} <ChevronRight size={14} /> election desk</div><h1>{selected.organization.name}</h1><p>{selected.organization.description || "A focused place for your organization’s decisions."}</p></div><span className="role-chip">{selected.membership.role}</span></div>
      <div className="dash-stats"><div><span>ELECTIONS</span><strong>{elections.data?.length ?? 0}</strong></div><div><span>DEFAULT PRIVACY</span><strong>Anonymous</strong></div><div><span>RESULTS</span><strong>After close</strong></div></div>
      <div className="section-split"><div><span className="section-label">YOUR ELECTION BOARDS</span><h2>Every decision<br /><em>has a home.</em></h2></div>{canManage && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button className="button-ink"><Plus size={17} /> New election</Button></DialogTrigger><DialogContent className="ballot-dialog wide-dialog"><DialogHeader><DialogTitle>Set up an election board</DialogTitle><DialogDescription>Choose timing and ballot privacy before you enroll voters. The privacy model is then locked.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={submit}><div className="form-grid"><div><Label htmlFor="election-title">Election title</Label><Input id="election-title" value={title} onChange={event => setTitle(event.target.value)} required /></div><div><Label htmlFor="ballot-question">Ballot question</Label><Input id="ballot-question" value={prompt} onChange={event => setPrompt(event.target.value)} required /></div></div><div><Label htmlFor="election-description">Context for voters <small>Optional</small></Label><Textarea id="election-description" value={description} onChange={event => setDescription(event.target.value)} /></div><div className="form-grid"><div><Label htmlFor="opens-at">Opens at <small>Optional</small></Label><Input id="opens-at" type="datetime-local" value={opensAt} onChange={event => setOpensAt(event.target.value)} /></div><div><Label htmlFor="closes-at">Closes at <small>Optional</small></Label><Input id="closes-at" type="datetime-local" value={closesAt} onChange={event => setClosesAt(event.target.value)} /></div></div><fieldset className="mode-picker"><legend>Privacy mode</legend><label className={ballotMode === "anonymous" ? "selected" : ""}><input type="radio" value="anonymous" checked={ballotMode === "anonymous"} onChange={() => setBallotMode("anonymous")} /><LockKeyhole size={18} /><span><strong>Anonymous ballot</strong><small>Admins see turnout and totals, not voter-to-choice links.</small></span></label><label className={ballotMode === "attributable" ? "selected" : ""}><input type="radio" value="attributable" checked={ballotMode === "attributable"} onChange={() => setBallotMode("attributable")} /><UsersRound size={18} /><span><strong>Attributable ballot</strong><small>Voters are told that administrators can view their recorded choice.</small></span></label></fieldset>{createElection.error && <p className="form-error">{createElection.error.message}</p>}<Button disabled={createElection.isPending} className="button-ink" type="submit">{createElection.isPending ? "Creating…" : "Create election"}<ArrowRight size={17} /></Button></form></DialogContent></Dialog>}</div>
      {elections.error ? <div className="workspace-empty"><ShieldAlert size={25} /><h2>Election boards could not load.</h2><p>{elections.error.message}</p><Button className="button-ink" onClick={() => elections.refetch()}>Try again</Button></div> : elections.data?.length ? <div className="election-list">{elections.data.map(election => <button className="election-row" key={election.id} onClick={() => setLocation(`/elections/${election.id}`)}><span className={statusClass(election.status)}>{election.status}</span><span className="election-row-main"><strong>{election.title}</strong><span>{election.ballotPrompt}</span></span><span className="privacy-tag">{election.ballotMode === "anonymous" ? <LockKeyhole size={14} /> : <UsersRound size={14} />}{election.ballotMode}</span><CalendarDays size={16} /><ArrowRight size={17} /></button>)}</div> : <div className="empty-board"><ShieldAlert size={25} /><div><h3>No election boards yet.</h3><p>Start with an election title, a question, and a privacy promise you can keep.</p></div>{canManage && <Button onClick={() => setDialogOpen(true)} className="button-ink"><Plus size={16} /> Create election</Button>}</div>}
      {selected.membership.role === "owner" && <section className="governance-panel"><div><span className="section-label">GOVERNANCE ROLES</span><h2>Who runs this workspace</h2><p>Administrators can create and operate election boards. People need to sign in once before you can add them.</p></div><div className="governance-people">{members.data?.map(member => <div key={member.id}><span className="voter-dot">{member.name?.slice(0, 1).toUpperCase() || member.email?.slice(0, 1).toUpperCase() || "M"}</span><span><strong>{member.name || member.email}</strong><small>{member.role}</small></span></div>)}<form className="inline-form" onSubmit={addAdministrator}><Input value={administratorEmail} onChange={event => setAdministratorEmail(event.target.value)} type="email" placeholder="Existing member email" required /><Button className="square-button" type="submit" disabled={assignRole.isPending}><UserCog size={17} /></Button></form>{assignRole.error && <p className="form-error">{assignRole.error.message}</p>}</div></section>}
    </main>
  </div>;
}
