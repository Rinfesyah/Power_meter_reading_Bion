import React, { useState, useEffect, FormEvent } from "react";
import { UserRecord, UserRole } from "../types";
import { useAuth, getAuthHeader } from "../context/AuthContext";

const BACKEND_URL = "http://localhost:8000";
const ROLES: UserRole[] = ["Admin", "Supervisor", "Engineer"];

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  Admin:      { bg: "#dc2626", text: "#fff" },
  Supervisor: { bg: "#d97706", text: "#fff" },
  Engineer:   { bg: "#2563eb", text: "#fff" },
};

interface UserFormData {
  username: string;
  fullName: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

const emptyForm: UserFormData = {
  username: "", fullName: "", password: "", role: "Engineer", isActive: true,
};

export default function UserManagement() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showFormPass, setShowFormPass] = useState(false);

  const headers = { "Content-Type": "application/json", ...getAuthHeader(token) };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users`, { headers: getAuthHeader(token) });
      if (!res.ok) throw new Error("Gagal memuat daftar user");
      setUsers(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError(null);
    setShowFormPass(false);
    setIsModalOpen(true);
  };

  const openEdit = (user: UserRecord) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      fullName: user.fullName,
      password: "",
      role: user.role,
      isActive: user.isActive,
    });
    setFormError(null);
    setShowFormPass(false);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      let res: Response;
      if (editingUser) {
        const body: any = { fullName: form.fullName, role: form.role, isActive: form.isActive };
        if (form.password.trim()) body.password = form.password;
        res = await fetch(`${BACKEND_URL}/api/users/${editingUser.id}`, {
          method: "PUT", headers, body: JSON.stringify(body),
        });
      } else {
        if (!form.password.trim()) { setFormError("Password wajib diisi untuk akun baru."); setSubmitting(false); return; }
        res = await fetch(`${BACKEND_URL}/api/users`, {
          method: "POST", headers, body: JSON.stringify(form),
        });
      }
      const data = await res.json();
      if (!res.ok) { setFormError(data.detail || "Terjadi kesalahan."); setSubmitting(false); return; }
      setIsModalOpen(false);
      await loadUsers();
    } catch {
      setFormError("Tidak dapat terhubung ke server.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`Hapus user "${user.fullName} (${user.username})"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/${user.id}`, {
        method: "DELETE", headers: getAuthHeader(token),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.detail || "Gagal menghapus user."); return; }
      await loadUsers();
    } catch {
      alert("Tidak dapat terhubung ke server.");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 8, fontSize: 14, outline: "none",
    background: "#fff", color: "#1e293b",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>Manajemen Akun</h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: "4px 0 0" }}>
            Kelola akun pengguna sistem. Hanya Admin yang dapat mengakses halaman ini.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: "10px 20px", background: "linear-gradient(135deg,#3b82f6,#06b6d4)",
            color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 4px 14px rgba(59,130,246,0.35)",
          }}
        >
          ＋ Tambah User
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5",
          borderRadius: 10, color: "#dc2626", fontSize: 14, marginBottom: 20,
        }}>{error}</div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Memuat data...</div>
      ) : (
        <div style={{
          background: "#fff", borderRadius: 16,
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Full Name", "Username", "Role", "Status", "Dibuat", "Aksi"].map(h => (
                  <th key={h} style={{
                    padding: "12px 16px", textAlign: "left",
                    fontSize: 12, fontWeight: 600, color: "#64748b",
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr key={user.id} style={{
                  borderBottom: i < users.length - 1 ? "1px solid #f1f5f9" : "none",
                  transition: "background 0.15s",
                }} onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                   onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{user.fullName}</div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      fontFamily: "monospace", fontSize: 13,
                      background: "#f1f5f9", padding: "3px 8px", borderRadius: 6, color: "#475569",
                    }}>{user.username}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: ROLE_COLORS[user.role]?.bg || "#64748b",
                      color: ROLE_COLORS[user.role]?.text || "#fff",
                    }}>{user.role}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: user.isActive ? "#dcfce7" : "#fee2e2",
                      color: user.isActive ? "#16a34a" : "#dc2626",
                    }}>
                      {user.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#94a3b8" }}>
                    {new Date(user.createdAt).toLocaleDateString("id-ID", {
                      day: "2-digit", month: "short", year: "numeric"
                    })}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(user)} style={{
                        padding: "6px 14px", background: "#eff6ff",
                        color: "#3b82f6", border: "1px solid #bfdbfe",
                        borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                      }}>Edit</button>
                      <button onClick={() => handleDelete(user)} style={{
                        padding: "6px 14px", background: "#fff1f2",
                        color: "#dc2626", border: "1px solid #fecaca",
                        borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                      }}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                    Belum ada user. Buat akun baru.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "36px 32px",
            width: "100%", maxWidth: 460, boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "0 0 24px" }}>
              {editingUser ? "Edit User" : "Tambah User Baru"}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Full Name */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 6 }}>Nama Lengkap *</label>
                <input required style={inputStyle} value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="Nama Lengkap" />
              </div>
              {/* Username — disabled on edit */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 6 }}>
                  Username * {editingUser && <span style={{ color: "#94a3b8", fontWeight: 400 }}>(tidak dapat diubah)</span>}
                </label>
                <input required style={{ ...inputStyle, background: editingUser ? "#f8fafc" : "#fff" }}
                  value={form.username} disabled={!!editingUser}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="username" />
              </div>
              {/* Password */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 6 }}>
                  Password {editingUser && <span style={{ color: "#94a3b8", fontWeight: 400 }}>(kosongkan jika tidak ingin diubah)</span>} {!editingUser && "*"}
                </label>
                <div style={{ position: "relative" }}>
                  <input style={inputStyle} type={showFormPass ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editingUser ? "Password baru (opsional)" : "Password"} />
                  <button type="button" onClick={() => setShowFormPass(v => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8" }}>
                    {showFormPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              {/* Role */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 6 }}>Role *</label>
                <select required style={{ ...inputStyle }} value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {/* Status */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="user-active" checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: "pointer" }} />
                <label htmlFor="user-active" style={{ fontSize: 14, color: "#475569", cursor: "pointer" }}>
                  Akun Aktif
                </label>
              </div>
              {/* Form error */}
              {formError && (
                <div style={{
                  padding: "10px 14px", background: "#fef2f2",
                  border: "1px solid #fca5a5", borderRadius: 8,
                  color: "#dc2626", fontSize: 13,
                }}>{formError}</div>
              )}
              {/* Buttons */}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{
                  padding: "10px 20px", background: "#f8fafc",
                  border: "1px solid #e2e8f0", borderRadius: 10,
                  fontSize: 14, cursor: "pointer", color: "#475569", fontWeight: 500,
                }}>Batal</button>
                <button type="submit" disabled={submitting} style={{
                  padding: "10px 24px",
                  background: submitting ? "rgba(59,130,246,0.4)" : "linear-gradient(135deg,#3b82f6,#06b6d4)",
                  color: "#fff", border: "none", borderRadius: 10,
                  fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer",
                }}>
                  {submitting ? "Menyimpan..." : editingUser ? "Simpan Perubahan" : "Buat Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
