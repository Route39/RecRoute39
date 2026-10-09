import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Loader2, Camera, Upload, CheckCircle2, XCircle, FileText } from "lucide-react";

const isExperienced = (f) => f.experience === "Experienced";

// Set to false if the backend rejects the "bank_statement" proof key
const SHOW_BANK_STATEMENT = true;

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
  ...(SHOW_BANK_STATEMENT ? [{ key: "bank_statement", label: "Bank statement" }] : []),
];

// Only for "Experienced" — photo mandatory
const PAYSLIPS = [
  { key: "payslip1", label: "Payslip – latest month" },
  { key: "payslip2", label: "Payslip – 2nd last month" },
  { key: "payslip3", label: "Payslip – 3rd last month" },
];

const RELATIONS = ["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Guardian", "Friend", "Relative", "Other"];

// Wizard steps (UI only)
const STEP_NAMES = ["Personal details", "Emergency & work", "Documents"];
const STEP_SUBS = ["Tell us how we can reach you.", "Emergency contact, location and experience.", "Upload a clear photo, PDF or ZIP, or take a photo with the camera."];
const STEP_KEYS = [
  ["name", "contact", "whatsapp", "email"],
  ["emergency_contact", "emergency_relationship", "location", "experience", "experience_years", "experience_months"],
  [...PROOFS.map((p) => p.key), ...PAYSLIPS.map((p) => p.key)],
];

const INPUT_CLS = "h-[52px] rounded-[14px] border-[1.5px] border-slate-200 bg-white px-4 text-[15px] font-medium focus-visible:border-[#d62828] focus-visible:ring-4 focus-visible:ring-[#d62828]/10 focus-visible:ring-offset-0";
const SELECT_CLS = "w-full h-[52px] rounded-[14px] border-[1.5px] border-slate-200 bg-white px-4 text-[15px] font-medium outline-none focus:border-[#d62828] focus:ring-4 focus:ring-[#d62828]/10";

function Card({ id, error, children }) {
  return <div id={id} className={`bg-white rounded-2xl border p-5 ${error ? "border-[#d62828]" : "border-slate-200"}`}>{children}{error && <p className="text-sm text-[#d62828] mt-2">{error}</p>}</div>;
}

function Field({ id, label, required, error, children }) {
  return (
    <div id={id} className="mb-5">
      <label className="block text-[13px] font-bold text-slate-900 mb-2">{label} {required && <span className="text-[#d62828]">*</span>}</label>
      {children}
      {error && <p className="text-xs font-semibold text-[#d62828] mt-1.5">{error}</p>}
    </div>
  );
}

function ProofField({ pr, value, onChange, token, error, allowNA = true }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [upErr, setUpErr] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const base = token ? `/public/onboarding/${token}` : "/public/onboarding-open";
  const upload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUpErr("File must be under 10 MB"); return; }
    setBusy(true); setUpErr("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post(`${base}/upload`, fd, { params: { proof: pr.key } });
      onChange({ file_id: data.file_id, preview: URL.createObjectURL(file), isImg: (file.type || "").startsWith("image/"), name: file.name, na: false, reason: "" });
    } catch (e) { setUpErr(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  const done = !!value.file_id;
  const openIt = () => (value.isImg ? setViewOpen(true) : window.open(value.preview, "_blank"));
  const err = error || upErr;
  const btn = "flex-1 h-11 rounded-xl border-[1.5px] border-slate-200 bg-white text-[13.5px] font-bold text-slate-800 flex items-center justify-center gap-1.5 active:bg-red-50 active:border-[#d62828] disabled:opacity-50";
  const act = "flex-1 h-10 rounded-xl border-[1.5px] border-slate-200 bg-white text-[13px] font-bold text-slate-800 flex items-center justify-center gap-1.5";
  return (
    <>
      <div id={`q-${pr.key}`} className={`rounded-2xl border-[1.5px] p-3.5 mb-3 ${err ? "border-[#d62828] bg-red-50" : done ? "border-emerald-300 bg-emerald-50/50" : "border-dashed border-red-200 bg-red-50/30"}`}>
        <div className="flex items-center gap-3">
          <button type="button" disabled={!done} onClick={openIt} className="w-12 h-12 rounded-xl bg-red-50 text-[#d62828] grid place-items-center overflow-hidden shrink-0">
            {value.preview && value.isImg ? <img src={value.preview} alt={pr.label} className="w-full h-full object-cover" /> : <FileText className="w-6 h-6" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{pr.label} <span className="text-[#d62828]">*</span></div>
            <div className={`text-xs truncate ${done ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
              {busy ? "Uploading..." : done ? `✓ ${value.name || "Uploaded"}` : "Photo, PDF or ZIP"}
            </div>
          </div>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-[#d62828]" />}
        </div>
        {!done ? (
          <div className="flex gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => galleryRef.current?.click()} className={btn}><Upload className="w-4 h-4" /> Upload</button>
            <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className={btn}><Camera className="w-4 h-4" /> Camera</button>
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={openIt} className={act}>Open</button>
            <button type="button" onClick={() => { setUpErr(""); onChange({}); }} className={act + " text-[#d62828] border-red-200"}>Remove</button>
          </div>
        )}
        <input ref={galleryRef} type="file" accept="image/*,application/pdf,.pdf,.zip,application/zip,application/x-zip-compressed" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
        {err && <p className="text-xs font-semibold text-[#d62828] mt-2">{err}</p>}
      </div>
      {viewOpen && value.preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-5" onClick={() => setViewOpen(false)}>
          <img src={value.preview} alt={pr.label} className="max-w-full max-h-[72vh] rounded-xl bg-white" onClick={(e) => e.stopPropagation()} />
          <div className="flex gap-3 mt-4" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setViewOpen(false)} className="h-11 px-6 rounded-xl bg-white font-bold">Close</button>
          </div>
        </div>
      )}
    </>
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
  const [step, setStep] = useState(0);
  const [sameWa, setSameWa] = useState(false);

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
    setForm((x) => ({ ...x, [f.key]: v, ...(f.key === "contact" && sameWa ? { whatsapp: v } : {}), ...(f.key === "experience" && v !== "Experienced" ? { experience_years: "", experience_months: "" } : {}) }));
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
      if (!v.file_id && !(v.reason || "").trim()) e[p.key] = "Please upload a file";
    });
    if (experienced) {
      PAYSLIPS.forEach((p) => {
        const v = proofs[p.key] || {};
        if (!v.file_id) e[p.key] = "Please upload this payslip (upload or camera)";
      });
    }
    return e;
  };

  const scrollTo = (k) => setTimeout(() => document.getElementById(`q-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);

  const submit = async () => {
    const e = validateAll(); setErrors(e); setSubmitErr("");
    const first = STEP_KEYS.flat().find((k) => e[k]);
    if (first) {
      const si = STEP_KEYS.findIndex((ks) => ks.includes(first));
      if (si >= 0 && si !== step) setStep(si);
      scrollTo(first);
      return;
    }
    setConfirmOpen(true);
  };

  const goNext = () => {
    const e = validateAll();
    const keys = STEP_KEYS[step];
    const se = {};
    keys.forEach((k) => { if (e[k]) se[k] = e[k]; });
    setErrors(se); setSubmitErr("");
    const first = keys.find((k) => se[k]);
    if (first) { scrollTo(first); return; }
    if (step < 2) { setStep(step + 1); window.scrollTo(0, 0); } else submit();
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

  const page = (children, footer, withProgress) => (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full max-w-lg mx-auto flex-1 flex flex-col">
        <div className="px-5 pt-5">
          <img src="/route39-logo.png" alt="Route39" className="h-10 w-auto" />
          {withProgress && (
            <>
              <div className="flex gap-1.5 mt-5 mb-2">
                {[0, 1, 2].map((i) => <div key={i} className={`flex-1 h-[5px] rounded-full transition-all ${i <= step ? "bg-[#d62828]" : "bg-red-100"}`} />)}
              </div>
              <div className="text-xs font-semibold text-slate-500">Step {step + 1} of 3 · {STEP_NAMES[step]}</div>
            </>
          )}
        </div>
        <div className="px-5 pt-3 pb-6 flex-1">{children}</div>
        {footer}
      </div>
    </div>
  );

  if (state === "loading") return page(<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#d62828]" /></div>);
  if (state === "error") return page(<Card><div className="text-center py-6"><XCircle className="w-12 h-12 text-[#d62828] mx-auto mb-3" /><p className="text-slate-700">{errorMsg}</p></div></Card>);
  if (state === "done") return page(
    <div className="text-center py-16">
      <div className="w-20 h-20 rounded-full bg-[#d62828] text-white grid place-items-center mx-auto mb-5 shadow-lg shadow-red-300/50"><CheckCircle2 className="w-10 h-10" /></div>
      <p className="text-2xl font-extrabold text-slate-900">Thank you!</p>
      <p className="text-sm text-slate-500 mt-2">Your details have been submitted to Route39 HR. We will contact you shortly.</p>
    </div>
  );

  const renderField = (f) => (
    <Field key={f.key} id={`q-${f.key}`} label={f.label} required={f.required} error={errors[f.key]}>
      {f.type === "relationship" ? (
        <div className="space-y-2">
          <select value={form.emergency_relationship} onChange={(e) => setField(f, e.target.value)} className={SELECT_CLS}>
            <option value="">Choose</option>
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {form.emergency_relationship === "Other" && <Input className={INPUT_CLS} value={form.relationship_other} placeholder="Type the relationship" onChange={(e) => { setForm((x) => ({ ...x, relationship_other: e.target.value })); setErrors((er) => ({ ...er, emergency_relationship: "" })); }} />}
        </div>
      ) : f.key === "location" ? (
        getUrlLocation() ? (
          <div className="w-full h-[52px] rounded-[14px] border-[1.5px] border-slate-200 bg-slate-50 px-4 text-[15px] flex items-center text-slate-700">
            <span className="font-semibold">{form.location}</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {LOCATIONS.map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setField(f, l)}
                className={"h-[52px] rounded-[14px] border-[1.5px] text-[15px] font-bold transition-colors " + (form.location === l ? "bg-[#d62828] border-[#d62828] text-white" : "bg-white border-slate-200 text-slate-700 active:bg-red-50")}
              >
                {l}
              </button>
            ))}
          </div>
        )
      ) : f.type === "select" ? (
        <>
          <select value={form[f.key]} onChange={(e) => setField(f, e.target.value)} className={SELECT_CLS}>
            <option value="">Choose</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {f.key === "experience" && experienced && <p className="text-xs text-slate-500 mt-1.5">You'll upload your last 3 months' payslips in the next step.</p>}
        </>
      ) : (
        <>
          <Input className={INPUT_CLS} value={form[f.key]} placeholder={f.type === "years" ? "e.g. 2 or 2.5" : f.type === "tel" ? "10-digit mobile" : "Your answer"} inputMode={f.type === "tel" ? "numeric" : f.type === "years" ? "decimal" : undefined} type={f.type === "email" ? "email" : "text"} onChange={(e) => setField(f, e.target.value)} />
          {f.key === "whatsapp" && (
            <label className="flex items-center gap-2 text-[13px] text-slate-500 mt-2.5">
              <input type="checkbox" className="w-4 h-4 accent-[#d62828]" checked={sameWa} onChange={(e) => { setSameWa(e.target.checked); if (e.target.checked) setForm((x) => ({ ...x, whatsapp: x.contact })); }} />
              Same as contact number
            </label>
          )}
        </>
      )}
    </Field>
  );

  const footer = (
    <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 pt-3 flex gap-2.5" style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}>
      {step > 0 && <button type="button" onClick={() => { setStep(step - 1); window.scrollTo(0, 0); }} className="h-[52px] px-6 rounded-[14px] border-[1.5px] border-slate-200 bg-white font-bold text-slate-800">Back</button>}
      <button type="button" onClick={goNext} disabled={busy} className="flex-1 h-[52px] rounded-[14px] bg-[#d62828] active:bg-[#b01e1e] text-white font-extrabold shadow-lg shadow-red-300/50 flex items-center justify-center gap-2 disabled:opacity-60">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}{step === 2 ? "Submit application" : "Continue →"}
      </button>
    </div>
  );

  const proofChange = (key) => (v) => { setProofs((p) => ({ ...p, [key]: v })); setErrors((e) => ({ ...e, [key]: "" })); };

  return page(
    <>
      <h2 className="text-[26px] font-extrabold tracking-tight text-slate-900 mt-3">{STEP_NAMES[step]}</h2>
      <p className="text-sm text-slate-500 mt-1 mb-6">{STEP_SUBS[step]}</p>

      {step < 2 && visibleFields.filter((f) => STEP_KEYS[step].includes(f.key)).map(renderField)}

      {step === 2 && (
        <>
          {PROOFS.map((pr) => (
            <ProofField key={pr.key} pr={pr} token={token} error={errors[pr.key]} value={proofs[pr.key] || {}} onChange={proofChange(pr.key)} />
          ))}
          {experienced && (
            <>
              <div className="text-[13px] font-extrabold uppercase tracking-wider text-[#d62828] mt-7 mb-3">Last 3 months payslips <span className="normal-case font-medium text-slate-500 tracking-normal">(upload or camera)</span></div>
              {PAYSLIPS.map((pr) => (
                <ProofField key={pr.key} pr={pr} token={token} allowNA={false} error={errors[pr.key]} value={proofs[pr.key] || {}} onChange={proofChange(pr.key)} />
              ))}
            </>
          )}
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="text-lg font-extrabold text-slate-900">Confirm submission</div>
            <p className="text-sm text-slate-600 mt-2">Have you filled in all the details correctly? You cannot edit the form after submitting.</p>
            <div className="flex justify-between gap-3 mt-6">
              <button type="button" onClick={() => setConfirmOpen(false)} className="h-11 px-5 rounded-xl border-[1.5px] border-slate-200 font-bold">Review</button>
              <button type="button" onClick={doSubmit} className="h-11 px-5 rounded-xl bg-[#d62828] text-white font-bold">Confirm & Submit</button>
            </div>
          </div>
        </div>
      )}
      {submitErr && <p className="text-sm font-semibold text-[#d62828]">{submitErr}</p>}
    </>,
    footer,
    true
  );
}
