import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api, formatApiError } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// ISO (UTC) -> value for <input type="datetime-local"> (local time, no offset)
const toLocalInputValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// <input type="datetime-local"> value (local time, no offset) -> ISO (UTC)
const toISO = (localValue) => {
  const d = new Date(localValue);
  return d.toISOString();
};

export default function EditCreatedAtModal({ open, onOpenChange, candidate, onUpdated }) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(toLocalInputValue(candidate?.created_at));
  }, [open, candidate]);

  const submit = async () => {
    if (!value) {
      toast.error("Pick a date and time");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: candidate.name,
        phone: candidate.phone,
        email: candidate.email || "",
        designation: candidate.designation,
        city: candidate.city || "",
        branch: candidate.branch || "",
        source: candidate.source || "Other",
        current_salary: candidate.current_salary,
        expected_salary: candidate.expected_salary,
        experience: candidate.experience || "",
        assigned_hr_id: candidate.assigned_hr_id || null,
        job_id: candidate.job_id || null,
        relevant_job: candidate.relevant_job || "",
        created_at: toISO(value),
      };
      const { data } = await api.put(`/candidates/${candidate.id}`, payload);
      toast.success("Added date/time updated");
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
      <DialogContent data-testid="edit-created-at-modal" className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Edit Added Date & Time</DialogTitle>
          <DialogDescription>Change when {candidate?.name} was added to the system.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label>Added on</Label>
          <Input
            data-testid="edit-created-at-input"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="edit-created-at-cancel">Cancel</Button>
          <Button data-testid="edit-created-at-submit" onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
