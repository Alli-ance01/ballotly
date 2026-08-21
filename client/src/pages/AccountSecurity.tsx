import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";

export default function AccountSecurity() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/account" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const changePassword = trpc.auth.changePassword.useMutation({ onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setSuccess(true); } });
  const submit = (event: FormEvent) => { event.preventDefault(); setSuccess(false); changePassword.mutate({ currentPassword, newPassword }); };
  if (loading || !user) return <div className="app-loading" role="status">Loading account security…</div>;
  return <div className="account-page security-page"><header className="account-header"><button className="brand-lockup brand-light" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="account-back" onClick={() => setLocation("/workspace")}><ArrowLeft size={16} /> Workspace</button></header><main className="security-main"><section><span className="account-kicker">ACCOUNT SECURITY</span><h1>Keep your<br /><em>access safe.</em></h1><p>Your password protects your Ballotly account and every organization you manage. Changing it signs out older browser sessions automatically.</p><div className="security-facts"><div><ShieldCheck size={17} /><span><strong>Session protection</strong><small>New password, new signed session.</small></span></div><div><KeyRound size={17} /><span><strong>Strong password rule</strong><small>Use at least 12 characters, up to 72.</small></span></div></div></section><section className="security-card"><span className="section-label">PASSWORD</span><h2>Change password</h2><p>For your protection, confirm the current password first.</p><form onSubmit={submit} className="account-form"><div><Label htmlFor="current-password">Current password</Label><Input id="current-password" autoComplete="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div><div><Label htmlFor="new-password">New password <small>At least 12 characters</small></Label><Input id="new-password" autoComplete="new-password" minLength={12} maxLength={72} type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></div>{changePassword.error && <p className="account-error">{changePassword.error.message}</p>}{success && <p className="security-success"><CheckCircle2 size={16} /> Password changed. Older sessions are no longer valid.</p>}<Button className="button-ink account-submit" type="submit" disabled={changePassword.isPending}>{changePassword.isPending ? "Updating…" : "Update password"}</Button></form></section></main></div>;
}
