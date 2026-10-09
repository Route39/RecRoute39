import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Route, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEMO = [
  { label: "Admin", email: "support@route39.in", password: "Admin@123" },
  { label: "HR (Priya)", email: "priya@route39.in", password: "Hr@123" },
  { label: "Management", email: "management@route39.in", password: "Manager@123" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const quick = (d) => { setEmail(d.email); setPassword(d.password); };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="flex items-center gap-3 relative">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center"><Route className="w-6 h-6" /></div>
          <div>
            <div className="font-display font-extrabold text-2xl">RecRoute<span className="text-blue-400">39</span></div>
            <div className="text-xs text-slate-400 tracking-wide">Route39 Recruitment</div>
          </div>
        </div>
        <div className="relative">
          <h1 className="font-display text-4xl font-bold leading-tight">Recruit • Track • Hire</h1>
          <p className="text-slate-400 mt-4 max-w-md">The internal recruitment desk for Route39 HR. Add candidates, track them through every stage, and route them for management approval — all in one place.</p>
        </div>
        <div className="text-xs text-slate-500 relative">Internal tool · For Route39 HR &amp; Management use only</div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white"><Route className="w-5 h-5" /></div>
            <span className="font-display font-extrabold text-xl">RecRoute<span className="text-blue-600">39</span></span>
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="text-sm text-slate-500 mb-6">Welcome back. Please enter your details.</p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input data-testid="login-email-input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter Number" required />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Password</Label>
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline" data-testid="forgot-password-link">Forgot password?</Link>
              </div>
              <Input data-testid="login-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button data-testid="login-submit-button" type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 h-11">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
