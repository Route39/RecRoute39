import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, formatINR, formatDateTime, timeAgo } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge, SourceBadge } from "@/components/Badges";
import { Skeleton, EmptyState, InitialsAvatar } from "@/components/Primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Phone, Users, SlidersHorizontal, X } from "lucide-react";

export default function Candidates() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [params] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ designations: [], cities: [], hrs: [], sources: [], statuses: [] });
  const [search, setSearch] = useState(params.get("search") || "");
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState({ designation: "all", city: "all", hr: "all", source: "all", status: params.get("status") || "all" });

  useEffect(() => { api.get("/candidates/filters").then((r) => setFilters(r.data)); }, []);

  const load = useCallback(() => {
    const q = { search: search || undefined };
    Object.entries(f).forEach(([k, v]) => { if (v && v !== "all") q[k] = v; });
    api.get("/candidates", { params: q }).then((r) => setRows(r.data));
  }, [search, f]);

  useEffect(() => { setRows(null); const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const activeFilters = Object.values(f).filter((v) => v !== "all").length;
  const clearAll = () => { setF({ designation: "all", city: "all", hr: "all", source: "all", status: "all" }); setSearch(""); };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 animate-in-up">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500 mt-1">{rows ? `${rows.length} candidate${rows.length !== 1 ? "s" : ""} in your pipeline` : "Loading pipeline..."}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="candidate-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." className="pl-9" />
          </div>
          <Button data-testid="toggle-filters-button" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1.5 shrink-0">
            <SlidersHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 && <span className="ml-0.5 bg-blue-600 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center">{activeFilters}</span>}
          </Button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 animate-fade">
            <FilterSelect testid="filter-designation-select" label="Designation" value={f.designation} onChange={(v) => set("designation", v)} options={filters.designations} />
            <FilterSelect testid="filter-city-select" label="City" value={f.city} onChange={(v) => set("city", v)} options={filters.cities} />
            <FilterSelect testid="filter-hr-select" label="HR" value={f.hr} onChange={(v) => set("hr", v)} options={filters.hrs.map((h) => ({ value: h.id, label: h.name }))} />
            <FilterSelect testid="filter-source-select" label="Source" value={f.source} onChange={(v) => set("source", v)} options={filters.sources} />
            <FilterSelect testid="filter-status-select" label="Status" value={f.status} onChange={(v) => set("status", v)} options={filters.statuses} />
          </div>
        )}
        {activeFilters > 0 && (
          <button onClick={clearAll} data-testid="clear-filters" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"><X className="w-3 h-3" /> Clear all filters</button>
        )}
      </div>

      {/* Results */}
      {!rows ? (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
          <div className="md:hidden space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        </>
      ) : rows.length === 0 ? (
        <EmptyState testid="candidates-empty" icon={Users} title="No candidates found" description={activeFilters || search ? "Try adjusting your search or filters." : "Add your first candidate to start building your recruitment pipeline."} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold">Candidate</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">City</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 font-semibold hidden xl:table-cell">Expected</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">HR</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold hidden xl:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} data-testid={`candidate-row-${c.id}`} onClick={() => navigate(`/candidates/${c.id}`)} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar name={c.name} size="sm" />
                          <div><div className="font-medium text-slate-800">{c.name}</div><div className="text-xs text-slate-400">{c.designation}</div></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600"><span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{c.phone}</span></td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{c.city || "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell"><SourceBadge source={c.source} /></td>
                      <td className="px-4 py-3 text-slate-700 font-medium hidden xl:table-cell tabular-nums">{formatINR(c.expected_salary)}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.assigned_hr_name}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-400 hidden xl:table-cell">{timeAgo(c.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3 stagger">
            {rows.map((c) => (
              <button key={c.id} data-testid={`candidate-card-${c.id}`} onClick={() => navigate(`/candidates/${c.id}`)} className="w-full text-left bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 active:scale-[0.99] transition-transform">
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={c.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-800 truncate">{c.name}</div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{c.designation}{c.city && <> · {c.city}</>}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <SourceBadge source={c.source} />
                      <span className="text-xs text-slate-500">{c.assigned_hr_name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Phone className="w-3 h-3" />{c.phone}</span>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">{formatINR(c.expected_salary)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterSelect({ testid, label, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testid} className="h-9 text-sm bg-slate-50"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}</SelectItem>
        {options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const lbl = typeof o === "string" ? o : o.label;
          return <SelectItem key={val} value={val}>{lbl}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}
