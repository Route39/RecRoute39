import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatINR, timeAgo } from "@/lib/api";
import { SourceBadge } from "@/components/Badges";
import { Skeleton, EmptyState, InitialsAvatar } from "@/components/Primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, RotateCcw, Loader2, FileText, MapPin, GraduationCap, Eye } from "lucide-react";
import { toast } from "sonner";

export default function Approvals() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [decision, setDecision] = useState(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/approvals").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const decide = async () => {
    setBusy(true);
    try {
      await api.post(`/candidates/${decision.id}/decision`, { decision: decision.type, comment });
      toast.success(`Candidate ${decision.type === "Approve" ? "approved successfully" : decision.type === "Reject" ? "rejected" : "sent back"}`);
      setDecision(null); setComment(""); load();
    } catch (e) { toast.error("Action failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="animate-in-up">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Review candidates recommended by HR for final selection.</p>
      </div>

      {!rows ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState testid="approvals-empty" icon={CheckCircle2} title="You're all caught up" description="No candidates are waiting for management approval right now." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
          {rows.map((c) => (
            <div key={c.id} data-testid={`approval-card-${c.id}`} className="relative overflow-hidden bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 p-5">
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-orange-100/40 blur-2xl" aria-hidden />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={c.name} size="md" />
                  <div>
                    <div className="font-display font-semibold text-slate-900">{c.name}</div>
                    <div className="text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      <span>{c.designation}</span>
                      {c.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{c.city}</span>}
                      {c.experience && <span className="inline-flex items-center gap-1"><GraduationCap className="w-3 h-3" />{c.experience}</span>}
                    </div>
                  </div>
                </div>
                <SourceBadge source={c.source} />
              </div>

              <div className="relative grid grid-cols-3 gap-3 mt-4 text-sm">
                <Cell label="Expected" value={formatINR(c.expected_salary)} />
                <Cell label="Recommended" value={formatINR(c.approval?.recommended_salary)} />
                <Cell label="HR" value={c.approval?.sent_by_name} />
              </div>
              {c.approval?.hr_remark && <p className="relative text-sm text-slate-600 mt-3 bg-slate-50 rounded-lg p-3 border border-slate-100 italic">"{c.approval.hr_remark}"</p>}
              <div className="relative flex items-center gap-2 mt-4">
                <div className="text-xs text-slate-400 flex items-center gap-1 mr-auto">{c.has_resume ? <><FileText className="w-3.5 h-3.5 text-emerald-500" /> Resume attached</> : <>No resume</>}</div>
                <Button data-testid={`review-button-${c.id}`} variant="outline" size="sm" onClick={() => navigate(`/candidates/${c.id}`)} className="gap-1.5"><Eye className="w-4 h-4" /> Review</Button>
                <Button data-testid={`approve-button-${c.id}`} size="sm" onClick={() => setDecision({ id: c.id, type: "Approve" })} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"><CheckCircle2 className="w-4 h-4" /> Approve</Button>
                <Button data-testid={`reject-button-${c.id}`} size="sm" variant="outline" onClick={() => setDecision({ id: c.id, type: "Reject" })} className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 gap-1.5"><XCircle className="w-4 h-4" /></Button>
                <Button data-testid={`sendback-button-${c.id}`} size="sm" variant="outline" onClick={() => setDecision({ id: c.id, type: "Send Back" })} className="gap-1.5"><RotateCcw className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="bg-white" data-testid="approval-decision-modal">
          <DialogHeader><DialogTitle className="font-display">{decision?.type} Candidate</DialogTitle><DialogDescription>This decision is recorded with your name, date and time.</DialogDescription></DialogHeader>
          <div className="space-y-1.5 py-2"><Label>Comment</Label><Textarea data-testid="approval-comment-input" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Add a comment" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button data-testid="confirm-approval-decision" onClick={decide} disabled={busy} className={decision?.type === "Reject" ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cell({ label, value }) {
  return <div><div className="text-xs text-slate-400">{label}</div><div className="font-medium text-slate-800 truncate">{value || "—"}</div></div>;
}
