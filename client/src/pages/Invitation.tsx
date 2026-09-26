import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, Eye, LockKeyhole, MailCheck } from "lucide-react";
import { useLocation, useSearch } from "wouter";

export default function Invitation() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const { user, loading } = useAuth();
  const invitation = trpc.elections.invitation.useQuery(
    { token },
    { enabled: token.length >= 32 }
  );
  const claim = trpc.elections.claimInvitation.useMutation({
    onSuccess: result => setLocation(`/ballot/${result.electionId}`),
  });
  const data = invitation.data;
  const continueToInvitation = () =>
    setLocation(
      `/account?returnTo=${encodeURIComponent(`/ballot/invite?token=${token}`)}`
    );

  if (invitation.isLoading || loading)
    return (
      <div className="app-loading" role="status">
        Preparing your invitation…
      </div>
    );
  if (!token || invitation.error || !data)
    return (
      <div className="app-loading">
        <div>
          <h1>Invitation unavailable</h1>
          <p>
            This invitation may have expired, been revoked, or already been
            used.
          </p>
          <Button className="button-ink" onClick={() => setLocation("/")}>
            Return to Ballotly
          </Button>
        </div>
      </div>
    );
  const attributable = data.election.ballotMode === "attributable";

  return (
    <div className="ballot-page invitation-page">
      <header className="ballot-header">
        <button className="brand-lockup" onClick={() => setLocation("/")}>
          <span className="logo-mark">
            <i />
            <i />
            <i />
          </span>
          <span>ballotly</span>
        </button>
        <span className="invitation-label">ELECTION INVITATION</span>
      </header>
      <main className="invitation-main">
        <span className="section-label">YOU’VE BEEN INVITED TO VOTE</span>
        <h1>{data.election.title}</h1>
        <p className="invitation-lede">
          {data.election.description || data.election.ballotPrompt}
        </p>
        <section
          className={`disclosure-banner ${attributable ? "attributable" : "anonymous"}`}
        >
          {attributable ? <Eye size={22} /> : <LockKeyhole size={22} />}
          <div>
            <strong>
              {attributable ? "Recorded-choice ballot" : "Anonymous ballot"}
            </strong>
            <p>
              {attributable
                ? "Authorized election administrators can view your recorded choice."
                : "Your identity confirms eligibility, but Ballotly does not store a voter-to-selection link."}
            </p>
          </div>
        </section>
        <div className="invitation-facts">
          <div>
            <span>ORGANIZATION</span>
            <strong>
              {data.election.organizationId
                ? "Your organization"
                : "Ballotly organization"}
            </strong>
          </div>
          <div>
            <span>INVITED EMAIL</span>
            <strong>{data.email}</strong>
          </div>
          <div>
            <span>VOTING WINDOW</span>
            <strong>
              {data.election.opensAt
                ? new Date(data.election.opensAt).toLocaleString()
                : "Opening time set by administrator"}
              {data.election.closesAt
                ? ` – ${new Date(data.election.closesAt).toLocaleString()}`
                : ""}
            </strong>
          </div>
        </div>
        {claim.error && <p className="form-error">{claim.error.message}</p>}
        {user ? (
          <Button
            className="button-ink invitation-action"
            onClick={() => claim.mutate({ token })}
            disabled={claim.isPending}
          >
            {claim.isPending
              ? "Opening your ballot…"
              : "Continue to your ballot"}
            <ArrowRight size={17} />
          </Button>
        ) : (
          <Button
            className="button-ink invitation-action"
            onClick={continueToInvitation}
          >
            Sign in or create your account <ArrowRight size={17} />
          </Button>
        )}
        <p className="invitation-note">
          <MailCheck size={16} /> Your account email must match the address that
          received this invitation.
        </p>
      </main>
    </div>
  );
}
