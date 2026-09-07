import React, { useState, FormEvent } from "react";

const BACKEND_URL = "http://localhost:8000";
const STORAGE_TOKEN_KEY = "bion_mobile_token";
const STORAGE_USER_KEY = "bion_mobile_user";

interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

interface Props {
  onLoginSuccess: (user: AuthUser, token: string) => void;
}

export default function MobileLoginView({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Login gagal. Periksa username dan password.");
        setLoading(false);
        return;
      }
      const user: AuthUser = data.user;
      const token: string = data.access_token;
      if (rememberMe) {
        localStorage.setItem(STORAGE_TOKEN_KEY, token);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
      }
      onLoginSuccess(user, token);
    } catch {
      setError("Tidak dapat terhubung ke server. Pastikan jaringan tersambung.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Logo / Icon */}
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: "linear-gradient(135deg, #0ea5e9, #3b82f6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, marginBottom: 20,
        boxShadow: "0 12px 40px rgba(14,165,233,0.4)",
      }}>
        ⚡
      </div>

      <h1 style={{
        fontSize: 22, fontWeight: 700, color: "#f0f9ff",
        margin: "0 0 6px", textAlign: "center",
      }}>Power Meter Reading</h1>
      <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 36px", textAlign: "center" }}>
        Aplikasi Operator Lapangan
      </p>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 380,
        background: "rgba(30, 41, 59, 0.9)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "32px 24px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
      }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Username */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Username
            </label>
            <input
              id="mobile-login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username"
              autoComplete="username"
              required
              disabled={loading}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "14px 16px",
                background: "rgba(15,23,42,0.7)",
                border: "1.5px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                color: "#e2e8f0",
                fontSize: 16,
                outline: "none",
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="mobile-login-password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
                disabled={loading}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "14px 48px 14px 16px",
                  background: "rgba(15,23,42,0.7)",
                  border: "1.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  color: "#e2e8f0",
                  fontSize: 16,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 18, color: "#64748b", padding: 4,
                }}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              id="mobile-remember"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#3b82f6" }}
            />
            <label htmlFor="mobile-remember" style={{ fontSize: 14, color: "#94a3b8", cursor: "pointer" }}>
              Tetap masuk (Keep me logged in)
            </label>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 10,
              color: "#fca5a5",
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="mobile-login-submit"
            type="submit"
            disabled={loading || !username || !password}
            style={{
              padding: "16px",
              background: (loading || !username || !password)
                ? "rgba(14,165,233,0.3)"
                : "linear-gradient(135deg, #0ea5e9, #3b82f6)",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: (loading || !username || !password) ? "not-allowed" : "pointer",
              letterSpacing: "0.3px",
              boxShadow: (!loading && username && password) ? "0 6px 24px rgba(14,165,233,0.4)" : "none",
              transition: "all 0.2s",
              marginTop: 4,
            }}
          >
            {loading ? "Masuk..." : "Masuk →"}
          </button>
        </form>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "#334155", textAlign: "center" }}>
        Default: <span style={{ fontFamily: "monospace", color: "#475569" }}>admin / admin123</span>
      </p>
    </div>
  );
}
