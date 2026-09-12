import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatDateTime, timeAgo, formatINR } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge, statusDot } from "@/components/Badges";
import { Skeleton, EmptyState, InitialsAvatar } from "@/components/Primitives";
import { Users, UserPlus, CalendarClock, Star, ClipboardCheck, CheckCircle2, XCircle, Briefcase, ArrowRight, Contact, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const CARDS = [
  { key: "Total", label: "Total Candidates", icon: Users, tint: "text-slate-700 bg-slate-100", glow: "from-slate-200/50", status: null },
  { key: "New", label: "New", icon: UserPlus, tint: "text-blue-700 bg-blue-100", glow: "from-blue-200/40", status: "New" },
  { key: "Interview", label: "Interview", icon: CalendarClock, tint: "text-violet-700 bg-violet-100", glow: "from-violet-200/40", status: "Interview" },
  { key: "Shortlisted", label: "Shortlisted", icon: Star, tint: "text-amber-700 bg-amber-100", glow: "from-amber-200/40", status: "Shortlisted" },
  { key: "Approval Pending", label: "Approval Pending", icon: ClipboardCheck, tint: "text-orange-700 bg-orange-100", glow: "from-orange-200/40", status: "Approval Pending" },
  { key: "Selected", label: "Selected", icon: CheckCircle2, tint: "text-emerald-700 bg-emerald-100", glow: "from-emerald-200/40", status: "Selected" },
  { key: "Rejected", label: "Rejected", icon: XCircle, tint: "text-rose-700 bg-rose-100", glow: "from-rose-200/40", status: "Rejected" },
  { key: "Joined", label: "Joined", icon: Briefcase, tint: "text-green-800 bg-green-100", glow: "from-green-200/40", status: "Joined" },
];

const FUNNEL = [
  { key: "New", icon: UserPlus }, { key: "Contacted", icon: Contact }, { key: "Interview", icon: CalendarClock },
  { key: "Shortlisted", icon: Star }, { key: "Approval Pending", icon: ClipboardCheck }, { key: "Selected", icon: CheckCircle2 }, { key: "Joined", icon: Briefcase },
];

export default function Dashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/dashboard/stats").then((r) => setData(r.data)); }, []);

  const value = (c) => (c.key === "Total" ? data.total : data.counts[c.status] ?? 0);
  const goto = (status) => navigate(status ? `/candidates?status=${encodeURIComponent(status)}` : "/candidates");
  const maxFunnel = data ? Math.max(1, ...FUNNEL.map((f) => data.counts[f.key] ?? 0)) : 1;

  return (
    <div className="space-y-6">
      <div className="animate-in-up">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-sm text-slate-500 mt-1">Your recruitment command center — here's the pipeline at a glance.</p>
      </div>

      {/* KPI cards */}
      {!data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[112px] rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 stagger">
          {CARDS.map((c) => {
            const v = value(c);
            const pct = c.status && data.total ? Math.round((v / data.total) * 100) : null;
            return (
              <button
                key={c.key}
                data-testid={`stat-card-${c.key.toLowerCase().replace(/ /g, "-")}`}
                onClick={() => goto(c.status)}
                className="relative overflow-hidden bg-white rounded-xl border border-slate-200/80 p-5 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 group"
              >
                <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${c.glow} to-transparent blur-2xl group-hover:scale-125 transition-transform duration-500`} aria-hidden />
                <div className="relative flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.tint}`}><c.icon className="w-5 h-5" /></div>
                  {pct !== null && <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">{pct}%</span>}
                </div>
                <div className="relative mt-3">
                  <div className="text-3xl font-bold font-display text-slate-900 tabular-nums">{v}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Recruitment funnel */}
      <div className="relative overflow-hidden bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
        <div className="absolute inset-0 bg-mesh opacity-70" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h3 className="font-display font-semibold text-slate-800">Recruitment Funnel</h3>
          </div>
          {!data ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (
            <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
              {FUNNEL.map((f, i) => {
                const v = data.counts[f.key] ?? 0;
                const h = 8 + Math.round((v / maxFunnel) * 40);
                return (
                  <div key={f.key} className="flex items-center shrink-0">
                    <button onClick={() => goto(f.key)} data-testid={`funnel-${f.key.toLowerCase().replace(/ /g, "-")}`} className="group flex flex-col items-center gap-2 px-2 sm:px-3 min-w-[86px]">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${statusDot(f.key)} group-hover:scale-110 transition-transform`}><f.icon className="w-4 h-4" /></div>
                      <div className="text-lg font-bold font-display text-slate-800 tabular-nums leading-none">{v}</div>
                      <div className="text-[10px] text-slate-500 text-center leading-tight">{f.key}</div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full origin-left ${statusDot(f.key)} rounded-full`} style={{ width: `${(v / maxFunnel) * 100}%`, animation: "grow-w 0.7s ease-out both", animationDelay: `${i * 60}ms` }} />
                      </div>
                    </button>
                    {i < FUNNEL.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Approvals */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-orange-500" /> Pending Approvals</h3>
            {(role === "management" || role === "admin") && data?.pending_approvals.length > 0 && (
              <Button variant="ghost" size="sm" className="text-blue-600 h-7 hover:text-blue-700 hover:bg-blue-50" onClick={() => navigate("/approvals")}>View all</Button>
            )}
          </div>
          {!data ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : data.pending_approvals.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">You're all caught up</p>
              <p className="text-xs text-slate-400">No candidates waiting for approval.</p>
            </div>
          ) : (
            <div className="space-y-1 stagger">
              {data.pending_approvals.slice(0, 6).map((c) => (
                <button key={c.id} data-testid={`pending-approval-${c.id}`} onClick={() => navigate(`/candidates/${c.id}`)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-orange-50/60 text-left transition-colors">
                  <InitialsAvatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.designation} · {c.assigned_hr_name}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent HR Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-4 flex items-center gap-2"><Activity /> Recent HR Activity</h3>
          {!data ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
          ) : data.recent_activity.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No activity yet.</p>
          ) : (
            <div className="relative space-y-1">
              {data.recent_activity.map((a) => (
                <div key={a.id} data-testid={`activity-item-${a.id}`} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors animate-fade">
                  <InitialsAvatar name={a.user_name || "?"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 leading-snug">
                      <span className="font-semibold">{a.user_name}</span> {a.action?.toLowerCase()}
                      {a.candidate_name && <> — <span className="font-medium text-slate-800">{a.candidate_name}</span></>}
                      {a.details && <span className="text-slate-500"> · {a.details}</span>}
                    </p>
                    <p className="text-xs text-slate-400">{timeAgo(a.created_at)} · {formatDateTime(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Activity(props) {
  return <svg {...props} className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
}
