const STATUS_STYLES = {
  "New": "bg-blue-50 text-blue-700 border-blue-200",
  "Contacted": "bg-teal-50 text-teal-700 border-teal-200",
  "Interview": "bg-violet-50 text-violet-700 border-violet-200",
  "Shortlisted": "bg-amber-50 text-amber-700 border-amber-200",
  "Approval Pending": "bg-orange-50 text-orange-700 border-orange-200",
  "Selected": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Joined": "bg-green-100 text-green-800 border-green-300",
  "Rejected": "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_DOT = {
  "New": "bg-blue-500", "Contacted": "bg-teal-500", "Interview": "bg-violet-500",
  "Shortlisted": "bg-amber-500", "Approval Pending": "bg-orange-500", "Selected": "bg-emerald-500",
  "Joined": "bg-green-600", "Rejected": "bg-rose-500",
};

const SOURCE_STYLES = {
  "Naukri": "bg-blue-50 text-blue-700 border-blue-200",
  "Indeed": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "LinkedIn": "bg-sky-50 text-sky-700 border-sky-200",
  "WhatsApp": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Referral": "bg-purple-50 text-purple-700 border-purple-200",
  "Walk-in": "bg-orange-50 text-orange-700 border-orange-200",
  "Other": "bg-slate-50 text-slate-700 border-slate-200",
};

export function statusDot(status) {
  return STATUS_DOT[status] || "bg-slate-400";
}

export function StatusBadge({ status, className = "" }) {
  const style = STATUS_STYLES[status] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span data-testid={`status-badge-${status}`} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${style} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusDot(status)}`} />
      {status}
    </span>
  );
}

export function SourceBadge({ source, className = "" }) {
  const style = SOURCE_STYLES[source] || SOURCE_STYLES.Other;
  return (
    <span data-testid={`source-badge-${source}`} className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${style} ${className}`}>
      {source}
    </span>
  );
}
