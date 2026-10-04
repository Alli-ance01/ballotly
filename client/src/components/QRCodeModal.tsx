import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download, ExternalLink, LockKeyhole, QrCode, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  electionId: string;
  title: string;
  ballotMode?: "anonymous" | "attributable";
}

export function QRCodeModal({
  open,
  onOpenChange,
  electionId,
  title,
  ballotMode = "anonymous",
}: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const ballotUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/ballot/${electionId}`
      : `https://ballotly.alliancedev.online/ballot/${electionId}`;

  // High-resolution SVG QR code via reliable fast generator
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&format=svg&data=${encodeURIComponent(
    ballotUrl
  )}`;
  const qrPngDownloadUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=15&format=png&data=${encodeURIComponent(
    ballotUrl
  )}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(ballotUrl);
    setCopied(true);
    toast.success("Ballot link copied to clipboard!");
    setTimeout(() => setCopied(false), 2200);
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(qrPngDownloadUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ballotly-qr-${electionId.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("QR code downloaded as high-res PNG!");
    } catch {
      window.open(qrPngDownloadUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="qr-modal-content" style={{ maxWidth: "440px", textAlign: "center" }}>
        <DialogHeader style={{ alignItems: "center", textAlign: "center", gap: "6px" }}>
          <div className="qr-badge-strip">
            <span className="live-dot" />
            <span>SCAN TO VOTE LIVE</span>
          </div>
          <DialogTitle
            style={{
              fontFamily: '"DM Serif Display", Georgia, serif',
              fontSize: "24px",
              fontWeight: 400,
              color: "#123b41",
              lineHeight: 1.2,
              marginTop: "4px",
            }}
          >
            {title}
          </DialogTitle>
          <DialogDescription style={{ fontSize: "13px", color: "#5f7478", maxWidth: "340px", margin: "0 auto" }}>
            Point your smartphone camera at this code to open the ballot immediately.
          </DialogDescription>
        </DialogHeader>

        {/* QR Code Card */}
        <div className="qr-card-container">
          <div className="qr-card-frame">
            <img
              src={qrImageUrl}
              alt={`QR Code for ${title}`}
              width={220}
              height={220}
              className="qr-image"
              loading="eager"
            />
          </div>

          {/* Mode Pill */}
          <div className={`qr-privacy-pill ${ballotMode}`}>
            {ballotMode === "anonymous" ? (
              <>
                <LockKeyhole size={14} />
                <span>Anonymous Ballot · Votes remain private</span>
              </>
            ) : (
              <>
                <Users size={14} />
                <span>Attributable Ballot · Identities recorded</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="qr-modal-actions">
          <Button
            variant="outline"
            className="qr-action-btn"
            onClick={handleCopy}
            style={{ borderColor: copied ? "#2a7c67" : "#cfc2ac" }}
          >
            {copied ? <Check size={15} style={{ color: "#2a7c67" }} /> : <Copy size={15} />}
            <span>{copied ? "Link Copied" : "Copy Link"}</span>
          </Button>

          <Button
            variant="outline"
            className="qr-action-btn"
            onClick={handleDownload}
            disabled={downloading}
            style={{ borderColor: "#cfc2ac" }}
          >
            <Download size={15} />
            <span>{downloading ? "Saving…" : "Save Image"}</span>
          </Button>

          <Button
            className="button-ink qr-action-btn"
            onClick={() => window.open(ballotUrl, "_blank")}
          >
            <ExternalLink size={15} />
            <span>Open Ballot</span>
          </Button>
        </div>

        {/* Help footer note */}
        <p className="qr-modal-footnote">
          <ShieldCheck size={14} />
          <span>No app required · Compatible with iOS & Android camera scanners</span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
