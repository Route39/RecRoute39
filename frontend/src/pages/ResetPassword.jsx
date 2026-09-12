import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Route, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password reset. Please sign in.");
      navigate("/login");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white"><Route className="w-5 h-5" /></div>
          <span className="font-display font-extrabold text-xl">RecRoute<span className="text-blue-600">39</span></span>
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Set a new password</h2>
        <p className="text-sm text-slate-500 mb-6 mt-1">Choose a strong password for your account.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input data-testid="reset-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button data-testid="reset-submit-button" type="submit" disabled={loading || !token} className="w-full bg-blue-600 hover:bg-blue-700 h-11">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Reset password
          </Button>
        </form>
        <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-blue-600 mt-6" data-testid="back-to-login-link">
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
