import { useEffect, useState } from "react";
import { api, formatApiError, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Copy, CheckCircle2, Clock, Upload } from "lucide-react";
import { toast } from "sonner";

const FILE_URL = (fid) => `${process.env.REACT_APP_BACKEND_URL}/api/onboarding/files/${fid}`;
const LABELS = [["name", "Name"], ["contact", "Contact"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["emergency_relationship", "Relationship"], ["emergency_contact", "Emergency contact"], ["designation", "Designation"], ["salary", "Salary (₹)"]];
const PROOFS = [["aadhaar", "Aadhaar card"], ["pan", "PAN card"], ["passbook", "Bank passbook"], ["licence", "Driving licence"]];

// canUpload: lets HR/Admin upload a proof photo themselves — e.g. the candidate
// marked it "Not available" and later shared the photo outside the app.
// onChanged: called after a successful upload so the parent can refetch.
export function OnboardingView({ ob, canUpload = false, onChanged }) {
  const [uploading, setUploading] = useState({});
  if (!ob) return null;
  if (ob.status !== "submitted") return <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><Clock className="w-4 h-4" /> Link sent on {formatDateTime(ob.created_at)}. Waiting for the candidate to submit.</div>;
  const a = ob.answers || {};

  const handleFile = async (proofKey, file) => {
    if (!file) return;
    setUploading((u) => ({ ...u, [proofKey]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/onboarding/${ob.id}/upload?proof=${proofKey}`, fd);
      toast.success("Photo uploaded");
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setUploading((u) => ({ ...u, [proofKey]: false }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Submitted on {formatDateTime(ob.submitted_at)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LABELS.map(([k, l]) => <div key={k}><div className="text-xs uppercase tracking-wide text-slate-400">{l}</div><div className="text-slate-800 break-words">{a[k] || "—"}</div></div>)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PROOFS.map(([k, l]) => { const p = (a.proofs || {})[k] || {}; return (
          <div key={k} className="border border-slate-200 rounded-lg p-3">
            <div className="text-sm font-medium text-slate-700 mb-2">{l}</div>
            {p.file_id
              ? <a href={FILE_URL(p.file_id)} target="_blank" rel="noreferrer"><img src={FILE_URL(p.file_id)} alt={l} className="w-full max-h-48 object-contain rounded" /></a>
              : (
                <div className="space-y-2">
                  <div className="text-sm text-amber-700">Not available: {p.reason || "—"}</div>
                  {canUpload && (
                    <label data-testid={`onboarding-upload-${k}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                      {uploading[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploading[k] ? "Uploading..." : "Upload photo"}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading[k]} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(k, f); }} />
                    </label>
                  )}
                </div>
              )}
          </div>); })}
      </div>
    </div>
  );
}

export function OnboardingTab({ candidate, canSend }) {
  const [ob, setOb] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const load = () => api.get("/onboarding").then((r) => setOb(r.data.find((o) => o.candidate_id === candidate.id) || null)).catch(() => setOb(null));
  useEffect(() => { load(); }, [candidate.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/candidates/${candidate.id}/onboarding-link`);
      setLink(data.link);
      window.open(data.whatsapp_url, "_blank");
      toast.success("WhatsApp opened with the onboarding link");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  if (ob === undefined) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  const showSend = canSend && candidate.status === "Joined" && (!ob || ob.status !== "submitted");
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      {candidate.status !== "Joined" && !ob && <p className="text-sm text-slate-500">The onboarding link can be sent once the candidate is marked as Joined.</p>}
      {showSend && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={send} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {ob ? "Resend on WhatsApp" : "Send Onboarding Link"}</Button>
          {link && <Button variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }} className="gap-1.5"><Copy className="w-4 h-4" /> Copy link</Button>}
        </div>
      )}
      <OnboardingView ob={ob} canUpload={canSend} onChanged={load} />
    </div>
  );
}
