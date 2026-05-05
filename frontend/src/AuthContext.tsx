import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import * as WebBrowser from "expo-web-browser";
import {
  getMe,
  exchangeSession,
  clearToken,
  getToken,
  logoutApi,
  setToken,
} from "./api";
import type { AuthUser } from "./types";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
// On mobile we use the backend URL as the redirect target; expo-web-browser intercepts it.
const BACKEND_URL = process.env.EXPO_PUBLIC_PORTPASS_BACKEND_URL as string;

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) {
        setUser(null);
        return;
      }
      const me = await getMe();
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      const redirectUrl = `${BACKEND_URL}/auth/callback`;
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
        redirectUrl,
      )}`;
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectUrl,
      );
      if (result.type !== "success" || !result.url) {
        throw new Error("Authentification annulée");
      }
      // session_id arrives in URL fragment: ...#session_id=XXX
      const hashIdx = result.url.indexOf("#");
      const fragment = hashIdx >= 0 ? result.url.slice(hashIdx + 1) : "";
      const params = new URLSearchParams(fragment);
      const sessionId = params.get("session_id");
      if (!sessionId) throw new Error("session_id introuvable dans la réponse");

      const { token, user: u } = await exchangeSession(sessionId);
      await setToken(token);
      // Fetch fresh user if endpoint returned minimal data
      let finalUser = u;
      try {
        finalUser = await getMe();
      } catch {
        /* fall back to u */
      }
      setUser(finalUser);
    } catch (e: any) {
      setError(e?.message || "Erreur d'authentification");
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* ignore */
    }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
