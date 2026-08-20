import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Building2, Loader2, Plus, Settings2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import OrganizationWorkspace from "./OrganizationWorkspace";
import { workspaceLocationForNewOrganization } from "../onboardingRules";

export default function Workspace() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const organizationId = new URLSearchParams(location.split("?")[1] ?? "").get("org");
  const organizations = trpc.organizations.listMine.useQuery(undefined, { enabled: Boolean(user) });
  const utils = trpc.useUtils();
  const createOrganization = trpc.organizations.create.useMutation({ onSuccess: () => utils.organizations.listMine.invalidate() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  if (organizationId) return <OrganizationWorkspace />;
  if (loading) return <div className="app-loading"><Loader2 className="animate-spin" /> Preparing your workspace</div>;
  if (!user) return <div className="app-loading"><div><h1>Sign in to make decisions count.</h1><p>Ballotly workspaces are private to your organization.</p><Button onClick={() => setLocation("/account")} className="button-ink">Sign in <ArrowRight size={17} /></Button></div></div>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createOrganization.mutate({ name, slug, description: description || undefined }, { onSuccess: organization => { setDialogOpen(false); setLocation(workspaceLocationForNewOrganization(organization.id)); } });
  };

  return <div className="workspace-shell">
    <header className="workspace-header"><button className="brand-lockup" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><div className="header-account"><span className="account-initial">{user.name?.slice(0, 1).toUpperCase() || "U"}</span><span>{user.name || user.email || "Member"}</span></div></header>
    <main className="workspace-main">
      <div className="workspace-intro"><div><span className="section-label">YOUR ORGANIZATIONS</span><h1>Good decisions<br /><em>begin here.</em></h1></div><p>Every workspace is a separate home for the people, process, and record of your organization’s elections.</p></div>
      <div className="workspace-toolbar"><span>{organizations.data?.length ?? 0} organization{organizations.data?.length === 1 ? "" : "s"}</span><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button className="button-ink"><Plus size={17} /> New organization</Button></DialogTrigger><DialogContent className="ballot-dialog"><DialogHeader><DialogTitle>Create an organization</DialogTitle><DialogDescription>Step 1 of 2. Give your election board a private home. You will set up the board itself next.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={submit}><div><Label htmlFor="org-name">Organization name</Label><Input id="org-name" value={name} onChange={event => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")); }} required /></div><div><Label htmlFor="org-slug">Workspace address</Label><div className="slug-field"><Input id="org-slug" value={slug} onChange={event => setSlug(event.target.value)} required /><span>ballotly</span></div></div><div><Label htmlFor="org-description">What is this organization for? <small>Optional</small></Label><Textarea id="org-description" value={description} onChange={event => setDescription(event.target.value)} /></div>{createOrganization.error && <p className="form-error">{createOrganization.error.message}</p>}<Button disabled={createOrganization.isPending} className="button-ink" type="submit">{createOrganization.isPending ? "Creating…" : "Continue to board setup"}<ArrowRight size={17} /></Button></form></DialogContent></Dialog></div>
      {organizations.isLoading ? <div className="workspace-empty"><Loader2 className="animate-spin" /> Loading your organizations</div> : organizations.data?.length ? <div className="organization-list">{organizations.data.map(({ organization, membership }, index) => <button className="organization-card" key={organization.id} onClick={() => setLocation(`/workspace?org=${organization.id}`)}><span className={`org-index org-index-${index % 3}`}>{organization.name.slice(0, 2).toUpperCase()}</span><span className="org-card-copy"><span className="org-card-name">{organization.name}</span><span>{organization.description || "Election workspace"}</span></span><span className="role-chip">{membership.role}</span><ArrowRight className="card-arrow" size={18} /></button>)}</div> : <section className="workspace-empty"><Building2 size={32} /><span className="section-label">YOUR FIRST ELECTION BOARD</span><h2>Start by naming<br />the organization behind it.</h2><p>Every board belongs to an organization. Create the workspace now, then Ballotly will take you directly to election-board setup.</p><Button onClick={() => setDialogOpen(true)} className="button-ink"><Plus size={17} /> Create my first election board</Button></section>}
      <div className="workspace-note"><Settings2 size={16} /> Ballot privacy must be chosen before voter enrollment begins. Once people are enrolled, the election’s privacy model is locked.</div>
    </main>
  </div>;
}
