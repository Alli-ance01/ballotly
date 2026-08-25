import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation, useSearch } from "wouter";
import "../account.css";

export default function EmailAction({ kind }: { kind: "verify" | "reset" }) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const verify = trpc.auth.verifyEmail.useMutation({ onSuccess: () => setLocation("/workspace") });
  const resend = trpc.auth.resendVerification.useMutation();
  const requestReset = trpc.auth.requestPasswordReset.useMutation();
  const reset = trpc.auth.resetPassword.useMutation({ onSuccess: () => setLocation("/workspace") });
  const error = verify.error || resend.error || requestReset.error || reset.error;

  const submit = (event: FormEvent) => { event.preventDefault(); if (kind === "verify") verify.mutate({ token }); else if (token) reset.mutate({ token, newPassword: password }); else requestReset.mutate({ email }); };
  const title = kind === "verify" ? "Confirm your email." : token ? "Choose a new password." : "Recover your account.";
  const description = kind === "verify" ? "Your account is ready once you confirm the address that belongs to it." : token ? "Use a unique password with at least 12 characters." : "Enter your account email and we will send a private, one-time recovery link.";
  const success = kind === "verify" ? verify.isSuccess || resend.isSuccess : requestReset.isSuccess || reset.isSuccess;

  return <div className="account-page"><header className="account-header"><button className="brand-lockup brand-light" onClick={() => setLocation("/")}><span className="logo-mark"><i /><i /><i /></span><span>ballotly</span></button><button className="account-back" onClick={() => setLocation("/account")}><ArrowLeft size={16} /> Back to account</button></header><main className="account-layout"><section className="account-manifesto"><div><span className="account-kicker">ACCOUNT SECURITY</span><h1>One clear<br /><em>next step.</em></h1><p>Ballotly verifies account ownership before allowing access to private election workspaces.</p></div><div className="account-principles"><div><ShieldCheck size={18} /><span><strong>One-time links</strong><small>Every verification and recovery link is short-lived and single-use.</small></span></div></div></section><section className="account-card-wrap"><div className="account-card"><div className="account-card-copy"><span className="section-label">SECURE ACCOUNT ACCESS</span><h2>{title}</h2><p>{description}</p></div>{success ? <div className="account-note"><CheckCircle2 size={15} /><span>{kind === "verify" ? "Your email has been confirmed." : token ? "Your password has been updated." : "If an account exists for that address, a recovery link is on its way."}</span></div> : <form className="account-form" onSubmit={submit}>{kind === "verify" && !token && <p className="account-error">This verification link is missing or incomplete. Sign in, then request a new verification email.</p>}{kind === "verify" && token && <Button className="button-ink account-submit" type="submit" disabled={verify.isPending}>{verify.isPending ? "Confirming…" : "Confirm my email"}<MailCheck size={17} /></Button>}{kind === "reset" && !token && <><div><Label htmlFor="recovery-email">Email address</Label><Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div><Button className="button-ink account-submit" type="submit" disabled={requestReset.isPending}>{requestReset.isPending ? "Sending…" : "Send recovery link"}</Button></>}{kind === "reset" && token && <><div><Label htmlFor="reset-password">New password <small>At least 12 characters</small></Label><Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /></div><Button className="button-ink account-submit" type="submit" disabled={reset.isPending}>{reset.isPending ? "Updating…" : "Update password"}</Button></>}{error && <p className="account-error">{error.message}</p>}</form>}{kind === "verify" && !success && <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>{resend.isPending ? "Sending…" : "Send a new verification email"}</Button>}</div></section></main></div>;
}
