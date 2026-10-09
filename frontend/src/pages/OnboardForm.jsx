import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, Image as ImageIcon, CheckCircle2, XCircle } from "lucide-react";

const isExperienced = (f) => f.experience === "Experienced";

const LOCATIONS = ["Bangalore", "Coimbatore", "Tirupur", "Chennai"];
const getUrlLocation = () => {
  const v = (new URLSearchParams(window.location.search).get("location") || "").trim().toLowerCase();
  return LOCATIONS.find((l) => l.toLowerCase() === v) || "";
};

const FIELDS = [
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "contact", label: "Contact number", type: "tel", required: true },
  { key: "whatsapp", label: "WhatsApp number", type: "tel", required: true },
  { key: "email", label: "Email address", type: "email", required: false },
  { key: "emergency_contact", label: "Emergency contact (name & number)", type: "text", required: true },
  { key: "emergency_relationship", label: "Relationship with emergency contact", type: "relationship", required: true },

  { key: "location", label: "Location", type: "text", required: true },
  { key: "experience", label: "Experience", type: "select", options: ["Fresher", "Experienced"], required: true },
  { key: "experience_years", label: "Years of experience", type: "years", required: true, showIf: isExperienced },
  { key: "experience_months", label: "Months of experience", type: "select", options: ["0","1","2","3","4","5","6","7","8","9","10","11"], required: true, showIf: isExperienced },
];

// Always required — photo upload only
const PROOFS = [
  { key: "aadhaar", label: "Aadhaar card" },
  { key: "pan", label: "PAN card" },
  { key: "passbook", label: "Bank passbook" },
];

// Only for "Experienced" — photo mandatory
const PAYSLIPS = [
  { key: "payslip1", label: "Payslip – latest month" },
  { key: "payslip2", label: "Payslip – 2nd last month" },
  { key: "payslip3", label: "Payslip – 3rd last month" },
];

const RELATIONS = ["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Guardian", "Friend", "Relative", "Other"];

function Card({ id, error, children }) {
  return <div id={id} className={`bg-white rounded-xl border p-5 ${error ? "border-rose-400" : "border-slate-200"}`}>{children}{error && <p className="text-sm text-rose-600 mt-2">{error}</p>}</div>;
}

function ProofField({ pr, value, onChange, token, error, allowNA = true }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [upErr, setUpErr] = useState("");
  const base = token ? `/public/onboarding/${token}` : "/public/onboarding-open";
  const upload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setUpErr("Image must be under 5 MB"); return; }
    setBusy(true); setUpErr("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post(`${base}/upload`, fd, { params: { proof: pr.key } });
      onChange({ file_id: data.file_id, preview: URL.createObjectURL(file), na: false, reason: "" });
    } catch (e) { setUpErr(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  return (
    <Card id={`q-${pr.key}`} error={error || upErr}>
      <div className="font-medium text-slate-800 mb-3">{pr.label} <span className="text-rose-500">*</span></div>
      {value.preview && <img src={value.preview} alt={pr.label} className="w-full max-h-56 object-contain rounded-lg border mb-3" />}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => galleryRef.current?.click()} className="gap-1.5"><ImageIcon className="w-4 h-4" /> Gallery</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => cameraRef.current?.click()} className="gap-1.5"><Camera className="w-4 h-4" /> Camera</Button>
      </div>
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
      {busy && <div className="flex items-center gap-2 text-sm text-slate-500 mt-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</div>}
    </Card>
  );
}

export default function OnboardForm() {
  const { token } = useParams();
  const [state, setState] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({ name: "", contact: "", whatsapp: "", email: "", emergency_relationship: "", relationship_other: "", emergency_contact: "", location: getUrlLocation(), experience: "", experience_years: "", experience_months: "" });
  const [proofs, setProofs] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const experienced = isExperienced(form);
  const visibleFields = FIELDS.filter((f) => !f.showIf || f.showIf(form));

  useEffect(() => {
    if (!token) { setState("form"); return; }
    api.get(`/public/onboarding/${token}`)
      .then((r) => { setForm((f) => ({ ...f, ...r.data, whatsapp: r.data.contact || "", ...(getUrlLocation() ? { location: getUrlLocation() } : {}) })); setState("form"); })
      .catch((e) => { setErrorMsg(formatApiError(e.response?.data?.detail)); setState("error"); });
  }, [token]);

  const setField = (f, v) => {
    if (f.type === "tel") v = v.replace(/\D/g, "").slice(0, 10);
    if (f.type === "years") {
      v = v.replace(/[^\d.]/g, "");
      const i = v.indexOf(".");
      if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
      v = v.slice(0, 5);
    }
    setForm((x) => ({ ...x, [f.key]: v, ...(f.key === "experience" && v !== "Experienced" ? { experience_years: "", experience_months: "" } : {}) }));
    // Fresher selected -> payslips must not be sent / visible
    if (f.key === "experience" && v !== "Experienced") {
      setProofs((p) => { const n = { ...p }; PAYSLIPS.forEach((s) => delete n[s.key]); return n; });
      setErrors((e) => { const n = { ...e }; PAYSLIPS.forEach((s) => delete n[s.key]); delete n.experience_years; return n; });
    }
    setErrors((e) => ({ ...e, [f.key]: "" }));
  };

  const validateAll = () => {
    const e = {};
    visibleFields.forEach((f) => {
      const v = (form[f.key] || "").trim();
      if (f.required && !v) e[f.key] = f.type === "select" ? "Please choose an option" : "This field is required";
      else if (f.type === "tel" && v.length !== 10) e[f.key] = "Enter a valid 10-digit number";
      else if (f.type === "email" && v && !/^\S+@\S+\.\S+$/.test(v)) e[f.key] = "Enter a valid email";
      else if (f.type === "years" && (!(parseFloat(v) > 0) || parseFloat(v) > 60)) e[f.key] = "Enter valid years of experience (e.g. 2 or 2.5)";
      else if (f.key === "experience_months" && (v === "" || parseInt(v, 10) < 0 || parseInt(v, 10) > 11)) e[f.key] = "Select valid months of experience";
    });
    if (form.emergency_relationship === "Other" && !(form.relationship_other || "").trim()) e.emergency_relationship = "Please type the relationship";
    PROOFS.forEach((p) => {
      const v = proofs[p.key] || {};
      if (!v.file_id && !(v.reason || "").trim()) e[p.key] = "Upload a photo";
    });
    if (experienced) {
      PAYSLIPS.forEach((p) => {
        const v = proofs[p.key] || {};
        if (!v.file_id) e[p.key] = "Please upload this payslip (gallery or camera)";
      });
    }
    return e;
  };

  const submit = async () => {
    const e = validateAll(); setErrors(e); setSubmitErr("");
    const order = [...visibleFields.map((f) => f.key), ...(experienced ? PAYSLIPS.map((p) => p.key) : []), ...PROOFS.map((p) => p.key)];
    const first = order.find((k) => e[k]);
    if (first) { document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    setConfirmOpen(true);
  };

  const doSubmit = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const clean = {};
      PROOFS.forEach(({ key }) => { const p = proofs[key] || {}; clean[key] = { file_id: p.file_id || null, reason: p.file_id ? "" : (p.reason || "") }; });
      if (experienced) PAYSLIPS.forEach(({ key }) => { clean[key] = { file_id: (proofs[key] || {}).file_id || null, reason: "" }; });
      await api.post(`${token ? `/public/onboarding/${token}` : "/public/onboarding-open"}/submit`, {
        ...form,
        experience_years: experienced ? form.experience_years : "",
        experience_months: experienced ? form.experience_months : "0",
        emergency_relationship: form.emergency_relationship === "Other" ? form.relationship_other.trim() : form.emergency_relationship,
        proofs: clean,
      });
      setState("done"); window.scrollTo(0, 0);
    } catch (err) { setSubmitErr(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); }
  };

  const header = (
    <div className="bg-white rounded-xl border border-slate-200 border-t-8 border-t-blue-600 p-6">
      <img src="/route39-logo.png" alt="Route39" className="h-10 w-auto mb-4" />
      <div className="font-display text-2xl font-bold text-slate-900">Route39 Onboarding Form</div>
      <div className="text-sm text-slate-500 mt-1">Please fill in your details. Fields marked <span className="text-rose-500">*</span> are required.</div>
    </div>
  );
  const page = (children) => <div className="min-h-screen bg-blue-50/40 py-6 px-4"><div className="max-w-xl mx-auto space-y-3">{header}{children}</div></div>;

  if (state === "loading") return page(<div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>);
  if (state === "error") return page(<Card><div className="text-center py-6"><XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" /><p className="text-slate-700">{errorMsg}</p></div></Card>);
  if (state === "done") return page(<Card><div className="text-center py-6"><CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" /><p className="font-semibold text-slate-800">Thank you!</p><p className="text-sm text-slate-500 mt-1">Your details have been submitted to Route39 HR.</p></div></Card>);

  return page(
    <>
      {visibleFields.map((f) => (
        <Card key={f.key} id={`q-${f.key}`} error={errors[f.key]}>
          <label className="block font-medium text-slate-800 mb-3">{f.label} {f.required && <span className="text-rose-500">*</span>}</label>
          {f.type === "relationship" ? (
            <div className="space-y-2">
              <select value={form.emergency_relationship} onChange={(e) => setField(f, e.target.value)} className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="">Choose</option>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {form.emergency_relationship === "Other" && <Input value={form.relationship_other} placeholder="Type the relationship" onChange={(e) => { setForm((x) => ({ ...x, relationship_other: e.target.value })); setErrors((er) => ({ ...er, emergency_relationship: "" })); }} />}
            </div>
          ) : f.key === "location" ? (
            getUrlLocation() ? (
              <div className="w-full h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm flex items-center text-slate-700">
                <span className="font-medium">{form.location}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {LOCATIONS.map((l) => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => setField(f, l)}
                    className={"h-10 rounded-md border text-sm font-medium transition-colors " + (form.location === l ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )
          ) : f.type === "select" ? (
            <select value={form[f.key]} onChange={(e) => setField(f, e.target.value)} className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
              <option value="">Choose</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <Input value={form[f.key]} placeholder={f.type === "years" ? "e.g. 2 or 2.5" : "Your answer"} inputMode={f.type === "tel" ? "numeric" : f.type === "years" ? "decimal" : undefined} type={f.type === "email" ? "email" : "text"} onChange={(e) => setField(f, e.target.value)} />
          )}
        </Card>
      ))}
      {experienced && (
        <>
          <div className="px-1 pt-2 text-sm font-medium text-slate-700">Last 3 months payslips <span className="text-rose-500">*</span> <span className="font-normal text-slate-500">(upload from gallery or capture with camera)</span></div>
          {PAYSLIPS.map((pr) => (
            <ProofField key={pr.key} pr={pr} token={token} allowNA={false} error={errors[pr.key]} value={proofs[pr.key] || {}}
              onChange={(v) => { setProofs((p) => ({ ...p, [pr.key]: v })); setErrors((e) => ({ ...e, [pr.key]: "" })); }} />
          ))}
        </>
      )}
      {PROOFS.map((pr) => (
        <ProofField key={pr.key} pr={pr} token={token} error={errors[pr.key]} value={proofs[pr.key] || {}}
          onChange={(v) => { setProofs((p) => ({ ...p, [pr.key]: v })); setErrors((e) => ({ ...e, [pr.key]: "" })); }} />
      ))}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="font-display text-lg font-semibold text-slate-900">Confirm submission</div>
            <p className="text-sm text-slate-600 mt-2">Have you filled in all the details correctly? You cannot edit the form after submitting.</p>
            <div className="flex justify-between gap-3 mt-6">
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Review</Button>
              <Button type="button" onClick={doSubmit} className="bg-blue-600 hover:bg-blue-700">Confirm & Submit</Button>
            </div>
          </div>
        </div>
      )}
      {submitErr && <p className="text-sm text-rose-600">{submitErr}</p>}
      <div className="pt-2 pb-8"><Button type="button" onClick={submit} disabled={busy} className="bg-blue-600 hover:bg-blue-700 px-8">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Submit</Button></div>
    </>
  );
}
