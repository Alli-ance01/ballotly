import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Mail, CheckCircle2, AlertCircle, X } from "lucide-react";
import { useState } from "react";

export function VerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const resend = trpc.auth.resendVerification.useMutation();

  if (!user || user.emailVerifiedAt || dismissed) return null;

  return (
    <div
      role="alert"
      className="verification-banner"
      style={{
        background: "#fef3d6",
        borderBottom: "1px solid #e2c07a",
        color: "#6b4900",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        fontSize: "13px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <Mail size={16} style={{ color: "#a06800", flexShrink: 0 }} />
        <span>
          Your email address (<strong>{user.email}</strong>) is not verified. Check your inbox for a verification link.
        </span>
        {resend.isSuccess ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#196b4b", fontWeight: 650 }}>
            <CheckCircle2 size={14} /> Verification link sent!
          </span>
        ) : (
          <button
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            style={{
              background: "transparent",
              border: "1px solid #b88628",
              borderRadius: "4px",
              padding: "2px 8px",
              color: "#5b3e00",
              fontWeight: 700,
              fontSize: "12px",
              cursor: resend.isPending ? "wait" : "pointer",
            }}
          >
            {resend.isPending ? "Sending…" : "Resend verification email"}
          </button>
        )}
        {resend.error && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#a53727" }}>
            <AlertCircle size={14} /> {resend.error.message}
          </span>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss verification banner"
        style={{
          background: "transparent",
          border: 0,
          color: "#855e0a",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: "4px",
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
