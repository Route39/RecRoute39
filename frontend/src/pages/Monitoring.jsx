import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/api";
import { Skeleton, InitialsAvatar } from "@/components/Primitives";
import { Loader2, Activity, TrendingUp } from "lucide-react";

const METRICS = [
  { key: "added", label: "Added", color: "text-slate-700", bar: "bg-slate-400" },
  { key: "contacted", label: "Contacted", color: "text-teal-600", bar: "bg-teal-500" },
  { key: "interviewed", label: "Interviews", color: "text-violet-600", bar: "bg-violet-500" },
  { key: "shortlisted", label: "Shortlisted", color: "text-amber-600", bar: "bg-amber-500" },
  { key: "sent_for_approval", label: "Sent", color: "text-orange-600", bar: "bg-orange-500" },
  { key: "selected", label: "Selected", color: "text-emerald-600", bar: "bg-emerald-500" },
  { key: "joined", label: "Joined", color: "text-green-700", bar: "bg-green-600" },
  { key: "rejected", label: "Rejected", color: "text-rose-600", bar: "bg-rose-500" },
];

export default function Monitoring() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/monitoring/hr").then((r) => setData(r.data)); }, []);

  return (
    <div className="space-y-5">
      <div className="animate-in-up">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">HR Monitoring</h1>
        <p className="text-sm text-slate-500 mt-1">Track each HR's contribution across the recruitment pipeline.</p>
      </div>

      {!data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {data.hrs.map((h) => {
            const max = Math.max(1, h.added);
            return (
              <div key={h.hr.id} data-testid={`hr-card-${h.hr.id}`} className="bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 p-5">
                <div className="flex items-center gap-3 mb-5">
                  <InitialsAvatar name={h.hr.name} src={h.hr.avatar} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-slate-800">{h.hr.name}</div>
                    <div className="text-xs text-slate-400 truncate">{h.hr.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold font-display text-blue-600 tabular-nums">{h.added}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Candidates</div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {METRICS.map((m) => (
                    <div key={m.key} data-testid={`hr-${h.hr.id}-${m.key}`} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-slate-500 shrink-0">{m.label}</div>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${m.bar} origin-left`} style={{ width: `${(h[m.key] / max) * 100}%`, animation: "grow-w 0.7s ease-out both" }} />
                      </div>
                      <div className={`w-6 text-right text-sm font-semibold tabular-nums ${m.color}`}>{h[m.key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
        <h3 className="font-display font-semibold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" /> Latest Activities</h3>
        {!data ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
        ) : (
          <div className="space-y-1">
            {data.recent.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <InitialsAvatar name={a.user_name || "?"} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-snug"><span className="font-semibold">{a.user_name}</span> {a.action?.toLowerCase()}{a.candidate_name && <> — <span className="font-medium">{a.candidate_name}</span></>}</p>
                  <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
