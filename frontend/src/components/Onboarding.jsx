import { useEffect, useState } from "react";
import { api, formatApiError, formatDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Send, Copy, CheckCircle2, Clock, Upload, Download, FileText } from "lucide-react";
import { toast } from "sonner";

const FILE_PATH = (fid) => `/onboarding/files/${fid}`;
const LABELS = [
  ["name", "Name"],
  ["contact", "Contact"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["emergency_relationship", "Relationship"],
  ["emergency_contact", "Emergency contact"],
  ["location", "Location"],
  ["experience", "Experience"],
  ["experience_years", "Experience years"],
  ["experience_months", "Experience months"],
];
const PROOFS = [
  ["aadhaar", "Aadhaar card"],
  ["pan", "PAN card"],
  ["passbook", "Bank passbook"],
  ["bank_statement", "Bank statement"],
];
const PAYSLIPS = [
  ["payslip1", "Payslip – Latest Month"],
  ["payslip2", "Payslip – 2nd Last Month"],
  ["payslip3", "Payslip – 3rd Last Month"],
];
const EXT = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf", "application/zip": "zip" };
const safe = (s) => (s || "file").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");

async function fetchFileBlob(fid) {
  const r = await api.get(FILE_PATH(fid), { responseType: "blob" });
  return r.data;
}

async function saveFile(fid, baseName) {
  const blob = await fetchFileBlob(fid);
  const ext = EXT[blob.type] || "jpg";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function useFileUrl(fid) {
  const [state, setState] = useState({ url: "", type: "", failed: false });
  useEffect(() => {
    if (!fid) return undefined;
    let alive = true;
    let obj = "";
    setState({ url: "", type: "", failed: false });
    fetchFileBlob(fid)
      .then((b) => {
        obj = URL.createObjectURL(b);
        if (alive) setState({ url: obj, type: b.type || "", failed: false }); else URL.revokeObjectURL(obj);
      })
      .catch(() => { if (alive) setState({ url: "", type: "", failed: true }); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [fid]);
  return state;
}

function DocCard({ fid, label, fileName }) {
  const { url, type, failed } = useFileUrl(fid);
  const isImg = type.startsWith("image/");
  const isPdf = type === "application/pdf";
  const canView = isImg || isPdf;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const download = async () => {
    setSaving(true);
    try { await saveFile(fid, fileName); } catch (e) { toast.error("Download failed"); } finally { setSaving(false); }
  };
  const view = () => { if (url && canView) setOpen(true); };
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="text-sm font-medium text-slate-700 mb-2">{label}</div>
      <button type="button" onClick={view} className="w-full h-52 flex items-center justify-center rounded-lg bg-slate-50 border overflow-hidden cursor-zoom-in">
        {!url ? (failed ? <span className="text-sm text-red-500">Could not load</span> : <Loader2 className="w-5 h-5 animate-spin text-slate-400" />)
          : isImg ? <img src={url} alt={label} className="w-full h-full object-contain" />
          : <div className="flex flex-col items-center gap-1 text-slate-500"><FileText className="w-10 h-10" /><span className="text-xs font-semibold">{isPdf ? "PDF file" : "ZIP / file"}</span></div>}
      </button>
      <div className="flex gap-2 mt-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" disabled={!url || !canView} onClick={view}>View full</Button>
        <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" disabled={saving} onClick={download}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
          {url && isImg && <img src={url} alt={label} className="w-full max-h-[75vh] object-contain rounded-lg bg-slate-50" />}
          {url && isPdf && <iframe src={url} title={label} className="w-full h-[75vh] rounded-lg border" />}
          <div className="flex justify-end">
            <Button type="button" onClick={download} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// canUpload: lets HR/Admin upload a proof photo themselves — e.g. the candidate
// marked it "Not available" and later shared the photo outside the app.
// onChanged: called after a successful upload so the parent can refetch.
export function OnboardingView({ ob, canUpload = false, onChanged }) {
  const [uploading, setUploading] = useState({});
  const [dlAll, setDlAll] = useState(false);
  if (!ob) return null;
  if (ob.status !== "submitted") return <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><Clock className="w-4 h-4" /> Link sent on {formatDateTime(ob.created_at)}. Waiting for the candidate to submit.</div>;
  const a = ob.answers || {};
  const proofs = a.proofs || {};
  const experienced = a.experience === "Experienced";
  const docs = [...(experienced ? PAYSLIPS : []), ...PROOFS].filter(([k]) => proofs[k]?.file_id);

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

  const downloadAll = async () => {
    setDlAll(true);
    for (const [k, l] of docs) {
      try { await saveFile(proofs[k].file_id, `${safe(ob.candidate_name)}_${safe(l)}`); } catch (e) { toast.error(`${l}: download failed`); }
      await new Promise((r) => setTimeout(r, 500));
    }
    setDlAll(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Submitted on {formatDateTime(ob.submitted_at)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LABELS.map(([k, l]) => <div key={k}><div className="text-xs uppercase tracking-wide text-slate-400">{l}</div><div className="text-slate-800 break-words">{a[k] || "—"}</div></div>)}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Documents</div>
        {docs.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={dlAll} onClick={downloadAll}>
            {dlAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download all ({docs.length})
          </Button>
        )}
      </div>

      {experienced && (
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Last 3 Months Payslips</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PAYSLIPS.map(([k, label]) => {
              const p = proofs[k] || {};
              return p.file_id ? (
                <DocCard key={k} fid={p.file_id} label={label} fileName={`${safe(ob.candidate_name)}_${safe(label)}`} />
              ) : (
                <div key={k} className="border border-slate-200 rounded-xl p-3">
                  <div className="text-sm font-medium text-slate-700 mb-2">{label}</div>
                  <div className="h-52 flex items-center justify-center rounded-lg bg-slate-50 border text-sm text-slate-400">Not uploaded</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROOFS.map(([k, l]) => {
          const p = proofs[k] || {};
          return p.file_id ? (
            <DocCard key={k} fid={p.file_id} label={l} fileName={`${safe(ob.candidate_name)}_${safe(l)}`} />
          ) : (
            <div key={k} className="border border-slate-200 rounded-xl p-3">
              <div className="text-sm font-medium text-slate-700 mb-2">{l}</div>
              <div className="space-y-2">
                <div className="text-sm text-amber-700">Not available: {p.reason || "—"}</div>
                {canUpload && (
                  <label data-testid={`onboarding-upload-${k}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                    {uploading[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {uploading[k] ? "Uploading..." : "Upload photo"}
                    <input type="file" accept="image/*,.pdf,.zip" className="hidden" disabled={uploading[k]} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(k, f); }} />
                  </label>
                )}
              </div>
            </div>
          );
        })}
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
