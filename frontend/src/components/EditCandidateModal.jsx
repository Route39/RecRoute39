import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, SOURCES, formatApiError } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const BRANCHES = ["Tirupur", "Bangalore", "Coimbatore", "Chennai"];

// Builds the editable form state from an existing candidate record.
// Mirrors the exact field set of AddCandidateModal.jsx.
const toForm = (c) => ({
  name: c?.name || "",
  phone: c?.phone || "",
  email: c?.email || "",
  designation: c?.designation || "",
  city: c?.city || "",
  branch: c?.branch || "",
  source: c?.source || "Naukri",
  current_salary: c?.current_salary != null ? String(c.current_salary) : "",
  expected_salary: c?.expected_salary != null ? String(c.expected_salary) : "",
  experience: c?.experience || "",
  assigned_hr_id: c?.assigned_hr_id || "",
  job_id: c?.job_id || "",
  relevant_job: c?.relevant_job || "",
});

export default function EditCandidateModal({ open, onOpenChange, candidate, onUpdated }) {
  const [form, setForm] = useState(toForm(candidate));
  const [hrs, setHrs] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Re-fill the form every time the modal is opened, so it always reflects
  // the latest saved values rather than stale state from a previous open.
  useEffect(() => {
    if (!open) return;
    setForm(toForm(candidate));
    api.get("/users").then((r) => setHrs(r.data.filter((u) => u.role === "hr")));
  }, [open, candidate]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.phone || !form.designation) {
      toast.error("Name, Phone and Designation are required");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        current_salary: form.current_salary ? Number(form.current_salary) : null,
        expected_salary: form.expected_salary ? Number(form.expected_salary) : null,
        assigned_hr_id: form.assigned_hr_id || null,
        job_id: form.job_id || null,
      };
      const { data } = await api.put(`/candidates/${candidate.id}`, payload);
      toast.success("Candidate updated successfully");
      onOpenChange(false);
      onUpdated?.(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-candidate-modal" className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit Candidate</DialogTitle>
          <DialogDescription>Update {candidate?.name}'s details below.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Candidate Name *</Label>
            <Input data-testid="edit-candidate-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number *</Label>
            <Input data-testid="edit-candidate-phone-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="10-digit mobile" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input data-testid="edit-candidate-email-input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email address (optional)" />
          </div>
          <div className="space-y-1.5">
            <Label>Designation *</Label>
            <Input data-testid="edit-candidate-designation-input" value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. Sales Executive" />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input data-testid="edit-candidate-city-input" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select value={form.branch} onValueChange={(v) => set("branch", v)}>
              <SelectTrigger data-testid="edit-candidate-branch-select"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger data-testid="edit-candidate-source-select"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assigned HR</Label>
            <Select value={form.assigned_hr_id} onValueChange={(v) => set("assigned_hr_id", v)}>
              <SelectTrigger data-testid="edit-candidate-hr-select"><SelectValue placeholder="Select HR" /></SelectTrigger>
              <SelectContent>{hrs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Current Salary (₹)</Label>
            <Input data-testid="edit-candidate-current-salary-input" type="text" inputMode="numeric" value={form.current_salary} onChange={(e) => set("current_salary", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 25000" />
          </div>
          <div className="space-y-1.5">
            <Label>Expected Salary (₹)</Label>
            <Input data-testid="edit-candidate-expected-salary-input" type="text" inputMode="numeric" value={form.expected_salary} onChange={(e) => set("expected_salary", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 35000" />
          </div>
          <div className="space-y-1.5">
            <Label>Experience</Label>
            <Input data-testid="edit-candidate-experience-input" value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="e.g. 3 years" />
          </div>
          <div className="space-y-1.5">
            <Label>Relevant Job</Label>
            <Input data-testid="edit-candidate-job-input" value={form.relevant_job} onChange={(e) => set("relevant_job", e.target.value)} placeholder="e.g. Sales Executive (optional)" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="edit-candidate-cancel">Cancel</Button>
          <Button data-testid="edit-candidate-submit" onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
