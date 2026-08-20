import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import "../account.css";

type AccountMode = "signin" | "create";

export default function Account() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<AccountMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = trpc.auth.register.useMutation({ onSuccess: user => { utils.auth.me.setData(undefined, user); setLocation("/workspace"); } });
  const login = trpc.auth.login.useMutation({ onSuccess: user => { utils.auth.me.setData(undefined, user); setLocation("/workspace"); } });
  const busy = register.isPending || login.isPending;
  const error = register.error ?? login.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "create") register.mutate({ name, email, password });
    else login.mutate({ email, password });
  };

  return <div className="account-page">
    <header className="account-header"><button className="brand-lockup brand-light" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="account-back" onClick={() => setLocation("/")}><ArrowLeft size={16} /> Back to site</button></header>
    <main className="account-layout">
      <section className="account-manifesto"><div><span className="account-kicker">MEMBER-LED DECISIONS</span><h1>Start a better<br /><em>conversation.</em></h1><p>Create a Ballotly account to build election boards, choose a transparent privacy model, and invite your organization when the rules are ready.</p></div><div className="account-principles"><div><ShieldCheck size={18} /><span><strong>Built around consent</strong><small>Voters always know whether their ballot is anonymous.</small></span></div><div><LockKeyhole size={18} /><span><strong>Private by default</strong><small>Anonymous ballots never store a voter-to-selection link.</small></span></div></div></section>
      <section className="account-card-wrap"><div className="account-card"><div className="account-toggle"><button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setPassword(""); }}>Sign in</button><button className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setPassword(""); }}>Create account</button></div><div className="account-card-copy"><span className="section-label">{mode === "signin" ? "WELCOME BACK" : "BEGIN WITH A CLEAR VOTE"}</span><h2>{mode === "signin" ? "Sign in to your workspace." : "Create your Ballotly account."}</h2><p>{mode === "signin" ? "Use the email and password connected to your organization." : "Your first workspace is one thoughtful decision away."}</p></div><form className="account-form" onSubmit={submit}>{mode === "create" && <div><Label htmlFor="account-name">Your name</Label><Input id="account-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required /></div>}<div><Label htmlFor="account-email">Email address</Label><Input id="account-email" autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></div><div><Label htmlFor="account-password">Password {mode === "create" && <small>At least 12 characters</small>}</Label><Input id="account-password" autoComplete={mode === "signin" ? "current-password" : "new-password"} type="password" value={password} onChange={event => setPassword(event.target.value)} required /></div>{error && <p className="account-error">{error.message}</p>}<Button className="button-ink account-submit" type="submit" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight size={17} /></Button></form><div className="account-note"><CheckCircle2 size={15} /> <span>Your account is private to Ballotly. You control the organizations you create.</span></div></div></section>
    </main>
  </div>;
}
