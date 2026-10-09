import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDateTime } from "@/lib/api";
import { OnboardingView } from "@/components/Onboarding";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function OnboardingPage() {
  const LINK_LOCATIONS = ["Bangalore", "Coimbatore", "Tirupur", "Chennai"];
  const [linkLocation, setLinkLocation] = useState("");
  const COMMON_LINK = linkLocation
    ? `${window.location.origin}/onboard?location=${encodeURIComponent(linkLocation)}`
    : `${window.location.origin}/onboard`;
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const [locationFilter, setLocationFilter] = useState("All");
  const [search, setSearch] = useState("");

  // Re-fetch the list and, if a record is open in the dialog, refresh that
  // record too — used both on initial load and after an HR upload.
  const refresh = () => api.get("/onboarding").then((r) => {
    setRows(r.data);
    setSel((cur) => cur ? (r.data.find((o) => o.id === cur.id) || null) : cur);
  }).catch(() => setRows([]));

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locations = ["All", "Bangalore", "Coimbatore", "Chennai", "Tirupur"];

  const filteredRows = (rows || []).filter((o) => {
    const location = (o.answers?.location || "").trim();
    const candidate = (o.candidate_name || "").toLowerCase();
    const searchText = search.trim().toLowerCase();

    const matchesLocation =
      locationFilter === "All" || location.toLowerCase() === locationFilter.toLowerCase();

    const matchesSearch =
      !searchText || candidate.includes(searchText);

    return matchesLocation && matchesSearch;
  });

  return (
    <div className="space-y-5">
      <div><h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Onboarding</h1><p className="text-sm text-slate-500 mt-1">Joining details submitted by candidates.</p></div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800">Common onboarding form link</div>
          <div className="text-xs text-slate-500 mt-0.5">One link for every candidate. Share it on WhatsApp, no login needed.</div>
          <div className="text-sm text-blue-600 truncate mt-1">{COMMON_LINK}</div>
        </div>
        <div className="flex gap-2 shrink-0 items-center flex-wrap">
          <select value={linkLocation} onChange={(e) => setLinkLocation(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white">
            <option value="">Select location</option>
            {LINK_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="button" onClick={() => { if (!linkLocation) { toast.error("Select a location first"); return; } navigator.clipboard.writeText(COMMON_LINK).then(() => toast.success("Link copied")); }} className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50">Copy link</button>
          <a href={`https://wa.me/?text=${encodeURIComponent("Hi, welcome to Route39! Please fill in your joining details here: " + COMMON_LINK)}`} target="_blank" rel="noreferrer" onClick={(e) => { if (!linkLocation) { e.preventDefault(); toast.error("Select a location first"); } }} className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Send on WhatsApp</a>
        </div>
      </div>
      <div className="space-y-4">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">

            {/* Location filter */}
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
            >
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location === "All" ? "All Locations" : location}
                </option>
              ))}
            </select>

            {/* Candidate search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate..."
              className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

          </div>
        </div>

        {/* Candidate cards */}
        {!rows ? (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 text-sm text-slate-400">
            Loading...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-8 text-center text-sm text-slate-400">
            No candidates found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRows.map((o) => {
              const a = o.answers || {};
              const location = a.location || "Location not provided";
              const experience = a.experience || "—";

              const years = a.experience_years || "0";
              const months = a.experience_months || "0";

              return (
                <div
                  key={o.id}
                  onClick={() => setSel(o)}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer p-5"
                >

                  {/* Candidate header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {o.candidate_name}
                      </h3>

                      <div className="flex items-center gap-1.5 mt-1.5 text-sm text-slate-500">
                        <span>📍</span>
                        <span className="truncate">{location}</span>
                      </div>
                    </div>

                    {o.status === "submitted" ? (
                      <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        Submitted
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                        Pending
                      </span>
                    )}
                  </div>

                  {/* Experience */}
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Experience
                    </div>

                    <div className="mt-1 text-sm font-medium text-slate-800">
                      {experience}
                    </div>

                    {experience === "Experienced" && (
                      <div className="text-sm text-slate-500 mt-0.5">
                        {years} {Number(years) === 1 ? "Year" : "Years"}{" "}
                        {months} {Number(months) === 1 ? "Month" : "Months"}
                      </div>
                    )}
                  </div>

                  {/* Submitted / created */}
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      {o.submitted_at ? "Submitted" : "Link sent"}
                    </div>

                    <div className="text-sm text-slate-600 mt-1">
                      {formatDateTime(o.submitted_at || o.created_at)}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      View onboarding details
                    </span>

                    <span className="text-sm font-medium text-blue-600">
                      View Details →
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
      <Dialog open={!!sel} onOpenChange={(v) => !v && setSel(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{sel?.candidate_name}</DialogTitle></DialogHeader>
          {sel && <><OnboardingView ob={sel} canUpload onChanged={refresh} />{sel.candidate_id ? <Link to={`/candidates/${sel.candidate_id}`} className="text-sm text-blue-600 underline">Open candidate profile →</Link> : <span className="text-xs text-slate-400">Not matched to a candidate profile (phone number not found).</span>}</>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
