"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type AdminProfile,
  clearAdminSession,
  fetchAdminMe,
  getStoredAdminProfile,
  getStoredSession,
  tryRefreshSession,
} from "@/lib/admin-api";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: AdminProfile | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isLoading: true,
  profile: null,
  logout: () => {},
});

const AuthContextProvider = AuthContext.Provider;

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(() => {
    clearAdminSession();
    setIsAuthenticated(false);
    setProfile(null);
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    window.location.href = "/admin/login";
  }, []);

  const validateSession = useCallback(async () => {
    setIsLoading(true);
    const session = getStoredSession();
    if (!session) {
      setIsAuthenticated(false);
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      const { response, data } = await fetchAdminMe();
      if (response.ok && data?.admin) {
        setIsAuthenticated(true);
        setProfile(data.admin);
      } else {
        clearAdminSession();
        setIsAuthenticated(false);
        setProfile(null);
      }
    } catch {
      clearAdminSession();
      setIsAuthenticated(false);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const maybeRefresh = useCallback(async () => {
    const session = getStoredSession();
    if (!session) return;

    const now = Date.now();
    const expiresAt = session.expires_at;
    const buffer = 90_000; // 1.5 minutes

    if (expiresAt > 0 && expiresAt - now < buffer) {
      const ok = await tryRefreshSession();
      if (!ok) {
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    }
  }, []);

  useEffect(() => {
    void validateSession();
  }, [validateSession]);

  useEffect(() => {
    const handleAuthChange = () => {
      void validateSession();
    };

    window.addEventListener("auth:storage:change", handleAuthChange);
    return () => {
      window.removeEventListener("auth:storage:change", handleAuthChange);
    };
  }, [validateSession]);

  useEffect(() => {
    if (!isAuthenticated) return;

    refreshTimerRef.current = setInterval(() => {
      void maybeRefresh();
    }, 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void maybeRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    const handleExpired = () => {
      logout();
    };

    window.addEventListener("auth:expired", handleExpired);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("auth:expired", handleExpired);
    };
  }, [isAuthenticated, maybeRefresh, logout]);

  return (
    <AuthContextProvider value={{ isAuthenticated, isLoading, profile, logout }}>
      {children}
    </AuthContextProvider>
  );
}
