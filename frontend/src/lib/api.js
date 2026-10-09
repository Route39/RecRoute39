import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Pages that must open without login (shared links).
export const PUBLIC_PATHS = ["/onboard", "/login", "/forgot-password", "/reset-password"];
export const isPublicPath = (path = window.location.pathname) =>
  PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    if (status !== 401 || original?._retry || isPublicPath() || /\/auth\/(login|refresh|logout)/.test(url)) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      refreshPromise = refreshPromise || api.post("/auth/refresh").finally(() => { refreshPromise = null; });
      await refreshPromise;
      return api(original);
    } catch (e) {
      if (!isPublicPath()) window.location.href = "/login";
      return Promise.reject(e);
    }
  }
);

export const RESUME_URL = (cid) => `${API}/candidates/${cid}/resume`;

export const SOURCES = ["Naukri", "Indeed", "LinkedIn", "WhatsApp", "Referral", "Walk-in", "Other"];
export const STATUSES = ["New", "Contacted", "Interview", "Shortlisted", "Approval Pending", "Selected", "Rejected", "Joined"];

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail.message) return detail.message;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(detail);
}

export function formatINR(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
