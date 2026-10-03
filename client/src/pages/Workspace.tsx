import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CreateBallotModal } from "@/components/CreateBallotModal";
import { VerificationBanner } from "@/components/VerificationBanner";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  LockKeyhole,
  Plus,
  Share2,
  UsersRound,
  Vote,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import OrganizationWorkspace from "./OrganizationWorkspace";

export default function Workspace() {
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const organizationId = new URLSearchParams(search).get("org");

  const [createBallotOpen, setCreateBallotOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ballots" | "organizations">("ballots");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const myBallots = trpc.elections.myBallots.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const organizations = trpc.organizations.listMine.useQuery(undefined, {
    enabled: Boolean(user),
  });

  if (organizationId) return <OrganizationWorkspace />;
  if (loading)
    return (
      <div className="app-loading">
        <Loader2 className="animate-spin" /> Preparing your workspace
      </div>
    );
  if (!user)
    return (
      <div className="app-loading">
        <div>
          <h1>Sign in to Ballotly</h1>
          <p>Create ballots, share links, and view live results.</p>
          <Button onClick={() => setLocation("/account")} className="button-ink">
            Sign in <ArrowRight size={17} />
          </Button>
        </div>
      </div>
    );

  const handleCopyLink = (electionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/ballot/${electionId}`);
    setCopiedId(electionId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusBadge = (status: string) => {
    if (status === "open") {
      return (
        <span
          style={{
            background: "#e3f4ec",
            color: "#186546",
            padding: "3px 9px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          ● Live Voting
        </span>
      );
    }
    if (status === "draft") {
      return (
        <span
          style={{
            background: "#fef6e5",
            color: "#8a5e00",
            padding: "3px 9px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Draft
        </span>
      );
    }
    return (
      <span
        style={{
          background: "#eceef0",
          color: "#53636b",
          padding: "3px 9px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <button className="brand-lockup" onClick={() => setLocation("/")}>
          <span className="logo-mark">
            <i />
            <i />
            <i />
          </span>
          <span>ballotly</span>
        </button>
        <div className="header-account-actions">
          <button
            className="header-account"
            onClick={() => setLocation("/account/security")}
            aria-label="Open account security settings"
          >
            <span className="account-initial">
              {user.name?.slice(0, 1).toUpperCase() || "U"}
            </span>
            <span>{user.name || user.email || "Member"}</span>
          </button>
          <button
            className="header-signout"
            onClick={async () => {
              await logout();
              setLocation("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <VerificationBanner />

      <main className="workspace-main">
        {/* Workspace Top Intro */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "20px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="section-label">BALLOT DESK</span>
            <h1 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: "36px", margin: "6px 0", color: "#11383e" }}>
              Your ballots
            </h1>
            <p style={{ margin: 0, color: "#5d7276", fontSize: "14px" }}>
              Create, publish, and share voting links in seconds.
            </p>
          </div>

          <Button
            className="button-ink"
            onClick={() => setCreateBallotOpen(true)}
            style={{ gap: "8px", height: "42px", padding: "0 20px" }}
          >
            <Plus size={18} /> Create a Ballot
          </Button>
        </div>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "18px",
            borderBottom: "1px solid #dfd4c1",
            paddingBottom: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("ballots")}
            style={{
              background: "transparent",
              border: 0,
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: 700,
              color: activeTab === "ballots" ? "#114b54" : "#6f8285",
              borderBottom: activeTab === "ballots" ? "2px solid #114b54" : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Vote size={15} /> All Ballots ({myBallots.data?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("organizations")}
            style={{
              background: "transparent",
              border: 0,
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: 700,
              color: activeTab === "organizations" ? "#114b54" : "#6f8285",
              borderBottom: activeTab === "organizations" ? "2px solid #114b54" : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Building2 size={15} /> Workspaces ({organizations.data?.length ?? 0})
          </button>
        </div>

        {/* TAB 1: BALLOTS LIST */}
        {activeTab === "ballots" && (
          <div>
            {myBallots.isLoading ? (
              <div className="workspace-empty">
                <Loader2 className="animate-spin" /> Loading your ballots…
              </div>
            ) : myBallots.data?.length ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {myBallots.data.map((election) => (
                  <div
                    key={election.id}
                    onClick={() => setLocation(`/elections/${election.id}`)}
                    style={{
                      background: "#fffaf0",
                      border: "1px solid #d8ccb6",
                      borderRadius: "8px",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      cursor: "pointer",
                      transition: "border-color 140ms, transform 140ms",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "grid", gap: "6px", flex: 1, minWidth: "260px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        {statusBadge(election.status)}
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#5f7579",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {election.ballotMode === "anonymous" ? (
                            <LockKeyhole size={13} />
                          ) : (
                            <UsersRound size={13} />
                          )}
                          {election.ballotMode === "anonymous" ? "Anonymous" : "Visible"}
                        </span>
                        <span style={{ fontSize: "12px", color: "#8a9a9d" }}>
                          {(election as any).candidateCount ?? election.candidates?.length ?? 0} options
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: (election as any).totalVotes ? "#196b4b" : "#7e9195" }}>
                          {(election as any).totalVotes ?? 0} votes cast
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: "17px", color: "#11383e", fontWeight: 700 }}>
                        {election.title}
                      </h3>
                      {election.description && (
                        <p style={{ margin: 0, fontSize: "12px", color: "#6e8388", lineClamp: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {election.description}
                        </p>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleCopyLink(election.id, e)}
                        style={{ height: "34px", padding: "0 12px", borderColor: "#c8baa4", gap: "5px", fontSize: "12px" }}
                        title="Copy direct voting link"
                      >
                        {copiedId === election.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedId === election.id ? "Copied" : "Copy link"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/ballot/${election.id}`, "_blank")}
                        style={{ height: "34px", padding: "0 10px", borderColor: "#c8baa4" }}
                        title="Preview voting page"
                      >
                        <ExternalLink size={14} />
                      </Button>
                      <Button
                        size="sm"
                        className="button-ink"
                        onClick={() => setLocation(`/elections/${election.id}`)}
                        style={{ height: "34px", padding: "0 14px", gap: "4px", fontSize: "12px" }}
                      >
                        Desk <ArrowRight size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <section className="workspace-empty" style={{ padding: "48px 24px", textAlign: "center" }}>
                <Vote size={36} style={{ color: "#16515b", margin: "0 auto 12px" }} />
                <span className="section-label">GET STARTED IN SECONDS</span>
                <h2 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: "28px", margin: "8px 0" }}>
                  Create your first ballot
                </h2>
                <p style={{ maxWidth: "460px", margin: "0 auto 20px", color: "#5d7377", fontSize: "14px" }}>
                  Ask a question, add your choices, pick anonymous or visible voting, and get an instant shareable link.
                </p>
                <Button onClick={() => setCreateBallotOpen(true)} className="button-ink">
                  <Plus size={18} /> Create a Ballot
                </Button>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: ORGANIZATIONS & WORKSPACES */}
        {activeTab === "organizations" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", color: "#5b7074" }}>
                Manage workspaces and shared governance roles
              </span>
            </div>
            {organizations.data?.length ? (
              <div className="organization-list">
                {organizations.data.map(({ organization, membership }, index) => (
                  <button
                    className="organization-card"
                    key={organization.id}
                    onClick={() => setLocation(`/workspace?org=${organization.id}`)}
                  >
                    <span className={`org-index org-index-${index % 3}`}>
                      {organization.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="org-card-copy">
                      <span className="org-card-name">{organization.name}</span>
                      <span>{organization.description || "Election workspace"}</span>
                    </span>
                    <span className="role-chip">{membership.role}</span>
                    <ArrowRight className="card-arrow" size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <section className="workspace-empty">
                <Building2 size={32} />
                <p>No multi-member workspaces yet.</p>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Quick Ballot Creation Dialog */}
      <CreateBallotModal
        open={createBallotOpen}
        onOpenChange={setCreateBallotOpen}
        onSuccess={(id) => setLocation(`/elections/${id}`)}
      />
    </div>
  );
}
