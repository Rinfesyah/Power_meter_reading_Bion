import React, { useState, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, loginError, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    await login(username.trim(), password);
    setSubmitting(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: "absolute", top: "-20%", left: "-10%",
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-20%", right: "-10%",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        width: "100%",
        maxWidth: 440,
        margin: "0 20px",
        background: "rgba(30, 41, 59, 0.85)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24,
        padding: "48px 40px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 32px rgba(59,130,246,0.4)",
            fontSize: 28,
          }}>
            ⚡
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: "#f1f5f9",
            margin: "0 0 8px", letterSpacing: "-0.3px",
          }}>
            Power Meter Monitoring
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
            Masuk ke dashboard sistem monitoring
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Username */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#94a3b8", marginBottom: 8 }}>
              Username
            </label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                fontSize: 16, color: "#64748b",
              }}>👤</span>
              <input
                id="dashboard-login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Masukkan username"
                autoComplete="username"
                required
                disabled={submitting}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "13px 14px 13px 42px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  color: "#f1f5f9",
                  fontSize: 15,
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "rgba(59,130,246,0.6)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#94a3b8", marginBottom: 8 }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                fontSize: 16, color: "#64748b",
              }}>🔒</span>
              <input
                id="dashboard-login-password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password"
                autoComplete="current-password"
                required
                disabled={submitting}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "13px 44px 13px 42px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  color: "#f1f5f9",
                  fontSize: 15,
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "rgba(59,130,246,0.6)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 16, color: "#64748b", padding: 4,
                  transition: "color 0.2s",
                }}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Error message */}
          {loginError && (
            <div style={{
              padding: "12px 16px",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 10,
              color: "#fca5a5",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>⚠️</span>
              <span>{loginError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            id="dashboard-login-submit"
            type="submit"
            disabled={submitting || isLoading || !username || !password}
            style={{
              padding: "14px",
              background: (submitting || !username || !password)
                ? "rgba(59,130,246,0.4)"
                : "linear-gradient(135deg, #3b82f6, #06b6d4)",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: (submitting || !username || !password) ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              boxShadow: (!submitting && username && password) ? "0 4px 20px rgba(59,130,246,0.4)" : "none",
              letterSpacing: "0.3px",
            }}
          >
            {submitting ? "Masuk..." : "Masuk ke Dashboard"}
          </button>
        </form>

        {/* Footer hint */}
        <p style={{
          textAlign: "center", fontSize: 12, color: "#475569",
          marginTop: 28, marginBottom: 0,
        }}>
          Login pertama: <span style={{ color: "#64748b", fontFamily: "monospace" }}>admin / admin123</span>
        </p>
      </div>
    </div>
  );
}
