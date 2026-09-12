import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, object = user
  const [viewRole, setViewRole] = useState(null); // admin can preview other roles

  useEffect(() => {
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    setViewRole(null);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    setUser(false);
    setViewRole(null);
  };

  // effective role: admin can preview HR / Management views
  const role = user ? (user.role === "admin" && viewRole ? viewRole : user.role) : null;

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, role, viewRole, setViewRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
