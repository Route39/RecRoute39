import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Candidates from "@/pages/Candidates";
import CandidateProfile from "@/pages/CandidateProfile";
import Approvals from "@/pages/Approvals";
import Monitoring from "@/pages/Monitoring";
import Jobs from "@/pages/Jobs";
import ActivityLog from "@/pages/ActivityLog";
import OnboardForm from "@/pages/OnboardForm";
import OnboardingPage from "@/pages/Onboarding";
import { Loader2 } from "lucide-react";

function Protected({ children, roles }) {
  const { user, role } = useAuth();
  if (user === null) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboard" element={<OnboardForm />} />
      <Route path="/onboard/:token" element={<OnboardForm />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/candidates" element={<Protected><Candidates /></Protected>} />
      <Route path="/candidates/:id" element={<Protected><CandidateProfile /></Protected>} />
      <Route path="/approvals" element={<Protected roles={["management", "admin"]}><Approvals /></Protected>} />
      <Route path="/monitoring" element={<Protected roles={["management", "admin"]}><Monitoring /></Protected>} />
      <Route path="/jobs" element={<Protected><Jobs /></Protected>} />
      <Route path="/activity" element={<Protected><ActivityLog /></Protected>} />
      <Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  // STANDALONE_ONBOARD: the shared onboarding link renders with NO auth provider,
  // so it never calls /auth/me and can never redirect to /login.
  if (/^\/onboard(\/|$)/.test(window.location.pathname)) {
    return (
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/onboard" element={<OnboardForm />} />
          <Route path="/onboard/:token" element={<OnboardForm />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
