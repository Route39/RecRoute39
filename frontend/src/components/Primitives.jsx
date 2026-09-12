export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} />;
}

export function GridDecor({ className = "" }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-blue-400/10 blur-3xl animate-float" />
      <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-indigo-400/10 blur-3xl" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, testid }) {
  return (
    <div data-testid={testid} className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/80 py-16 px-6 text-center animate-scale">
      <div className="absolute inset-0 bg-grid-faint opacity-40" aria-hidden />
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mx-auto mb-4">
          {Icon && <Icon className="w-7 h-7 text-blue-500" />}
        </div>
        <h3 className="font-display font-semibold text-slate-800 text-lg">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">{description}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function initials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_TINTS = [
  "bg-blue-100 text-blue-700", "bg-indigo-100 text-indigo-700", "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700",
];
export function tintFor(name = "") {
  let s = 0;
  for (let i = 0; i < name.length; i++) s += name.charCodeAt(i);
  return AVATAR_TINTS[s % AVATAR_TINTS.length];
}

export function InitialsAvatar({ name, size = "md", src, className = "" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg" };
  if (src) return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover ${className}`} />;
  return (
    <div className={`${sizes[size]} ${tintFor(name)} rounded-full flex items-center justify-center font-semibold font-display shrink-0 ${className}`}>
      {initials(name)}
    </div>
  );
}
