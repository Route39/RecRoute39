import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Route, Loader2, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
    } catch (err) {}
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white"><Route className="w-5 h-5" /></div>
          <span className="font-display font-extrabold text-xl">RecRoute<span className="text-blue-600">39</span></span>
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Reset password</h2>
        {sent ? (
          <p data-testid="forgot-confirmation" className="text-sm text-slate-600 mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            If that email is registered, a reset link has been sent. Please check your inbox.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-6 mt-1">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input data-testid="forgot-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button data-testid="forgot-submit-button" type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 h-11">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send reset link
              </Button>
            </form>
          </>
        )}
        <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-blue-600 mt-6" data-testid="back-to-login-link">
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
