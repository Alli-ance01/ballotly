import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LockKeyhole,
  Eye,
  Zap,
  Calendar,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface CreateBallotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (electionId: string) => void;
}

export function CreateBallotModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateBallotModalProps) {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["Option 1", "Option 2"]);
  const [ballotMode, setBallotMode] = useState<"anonymous" | "attributable">(
    "anonymous"
  );
  const [timing, setTiming] = useState<"manual" | "scheduled">("manual");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [publishNow, setPublishNow] = useState(true);

  const createBallot = trpc.elections.createQuickBallot.useMutation({
    onSuccess: (data) => {
      onOpenChange(false);
      // Reset form
      setTitle("");
      setDescription("");
      setOptions(["Option 1", "Option 2"]);
      if (onSuccess) {
        onSuccess(data.electionId);
      } else {
        setLocation(`/elections/${data.electionId}`);
      }
    },
  });

  const handleAddOption = () => {
    if (options.length < 20) {
      setOptions([...options, `Option ${options.length + 1}`]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) return;

    createBallot.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      ballotMode,
      options: cleanOptions,
      timing,
      opensAt: timing === "scheduled" && opensAt ? new Date(opensAt) : null,
      closesAt: timing === "scheduled" && closesAt ? new Date(closesAt) : null,
      publishNow,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wide-dialog ballot-dialog">
        <DialogHeader>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "#eaf2f3",
                color: "#16515b",
                padding: "3px 9px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <Sparkles size={12} /> Instant Ballot
            </span>
          </div>
          <DialogTitle style={{ fontSize: "24px", fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400, marginTop: "6px" }}>
            Create a new ballot
          </DialogTitle>
          <DialogDescription style={{ color: "#5a7075", fontSize: "14px" }}>
            Set your question, options, and rules. When ready, share the link for people to vote.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="form-stack" style={{ marginTop: "8px", display: "grid", gap: "16px" }}>
          {/* Question / Title */}
          <div>
            <Label htmlFor="ballot-question" style={{ fontSize: "13px", fontWeight: 700, color: "#163c43", marginBottom: "6px", display: "block" }}>
              Ballot question or title
            </Label>
            <Input
              id="ballot-question"
              placeholder="e.g. Who should be our team representative for 2026?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              style={{ fontSize: "15px", padding: "10px 14px", height: "auto" }}
            />
          </div>

          {/* Options / Candidates */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <Label style={{ fontSize: "13px", fontWeight: 700, color: "#163c43" }}>
                Voting options / candidates
              </Label>
              <span style={{ fontSize: "12px", color: "#6e8388" }}>
                {options.length} options (minimum 2)
              </span>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {options.map((option, index) => (
                <div key={index} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "#eef4f4",
                      color: "#1f5660",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Input
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      className="icon-danger"
                      aria-label={`Remove option ${index + 1}`}
                      style={{ flexShrink: 0 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddOption}
              style={{ marginTop: "10px", borderColor: "#c8d9db", color: "#1b4f57", gap: "6px" }}
            >
              <Plus size={14} /> Add another option
            </Button>
          </div>

          {/* Settings Grid: Privacy & Timing */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", paddingTop: "8px", borderTop: "1px solid #e5dfd2" }}>
            {/* Privacy */}
            <div>
              <Label style={{ fontSize: "12px", fontWeight: 700, color: "#163c43", marginBottom: "6px", display: "block" }}>
                Ballot privacy
              </Label>
              <div style={{ display: "grid", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setBallotMode("anonymous")}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: ballotMode === "anonymous" ? "2px solid #16515b" : "1px solid #d5cbba",
                    background: ballotMode === "anonymous" ? "#f2f8f8" : "#fffcf6",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <LockKeyhole size={18} style={{ color: ballotMode === "anonymous" ? "#16515b" : "#72878b", marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px", color: "#11343a" }}>Anonymous</strong>
                    <small style={{ display: "block", fontSize: "11px", color: "#64777b", lineHeight: 1.3 }}>
                      Secret ballot. Selections are 100% confidential.
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBallotMode("attributable")}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: ballotMode === "attributable" ? "2px solid #16515b" : "1px solid #d5cbba",
                    background: ballotMode === "attributable" ? "#f2f8f8" : "#fffcf6",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Eye size={18} style={{ color: ballotMode === "attributable" ? "#16515b" : "#72878b", marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px", color: "#11343a" }}>Visible / Roll call</strong>
                    <small style={{ display: "block", fontSize: "11px", color: "#64777b", lineHeight: 1.3 }}>
                      Public ballot. Names are recorded with votes.
                    </small>
                  </div>
                </button>
              </div>
            </div>

            {/* Timing */}
            <div>
              <Label style={{ fontSize: "12px", fontWeight: 700, color: "#163c43", marginBottom: "6px", display: "block" }}>
                Voting schedule
              </Label>
              <div style={{ display: "grid", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setTiming("manual")}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: timing === "manual" ? "2px solid #16515b" : "1px solid #d5cbba",
                    background: timing === "manual" ? "#f2f8f8" : "#fffcf6",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Zap size={18} style={{ color: timing === "manual" ? "#16515b" : "#72878b", marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px", color: "#11343a" }}>Manual timing</strong>
                    <small style={{ display: "block", fontSize: "11px", color: "#64777b", lineHeight: 1.3 }}>
                      Open now or later. Close whenever you decide.
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTiming("scheduled")}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: timing === "scheduled" ? "2px solid #16515b" : "1px solid #d5cbba",
                    background: timing === "scheduled" ? "#f2f8f8" : "#fffcf6",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Calendar size={18} style={{ color: timing === "scheduled" ? "#16515b" : "#72878b", marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px", color: "#11343a" }}>Scheduled</strong>
                    <small style={{ display: "block", fontSize: "11px", color: "#64777b", lineHeight: 1.3 }}>
                      Set specific opening and closing dates.
                    </small>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Scheduled dates if enabled */}
          {timing === "scheduled" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "12px", background: "#f8f4ec", borderRadius: "6px" }}>
              <div>
                <Label htmlFor="quick-opens" style={{ fontSize: "12px" }}>Opens at (optional)</Label>
                <Input
                  id="quick-opens"
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="quick-closes" style={{ fontSize: "12px" }}>Closes at (optional)</Label>
                <Input
                  id="quick-closes"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Publish now or draft */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#f4f8f8", borderRadius: "6px", border: "1px solid #d8e6e8" }}>
            <input
              type="checkbox"
              id="publish-now-check"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#16515b" }}
            />
            <label htmlFor="publish-now-check" style={{ cursor: "pointer", fontSize: "13px", color: "#163a40" }}>
              <strong>Publish immediately</strong> — open for voting right away so you can copy and share the link.
            </label>
          </div>

          {createBallot.error && (
            <p className="form-error" style={{ color: "#a53727", fontSize: "13px", margin: 0 }}>
              {createBallot.error.message}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="button-ink"
              disabled={createBallot.isPending}
              style={{ minWidth: "160px" }}
            >
              {createBallot.isPending
                ? "Creating ballot…"
                : publishNow
                ? "Publish & get link"
                : "Create draft ballot"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
