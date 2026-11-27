"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function AdminStaffPage() {
  const [email, setEmail] = useState("admin@mediflow.com");
  const [password, setPassword] = useState("AdminPass123!");
  const [session, setSession] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create Staff Form State
  const [newRole, setNewRole] = useState("DOCTOR");
  const [newUserId, setNewUserId] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newDeptId, setNewDeptId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newSpecialization, setNewSpecialization] = useState("");
  const [newDegrees, setNewDegrees] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [newLicense, setNewLicense] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Edit Modal State
  const [editingStaff, setEditingStaff] = useState(null);
  const [editDeptId, setEditDeptId] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRoom, setEditRoom] = useState("");
  const [editRole, setEditRole] = useState("DOCTOR");
  const [editActive, setEditActive] = useState(true);

  async function loadAll(sess = session) {
    if (!sess) return;
    try {
      const [cData, sData] = await Promise.all([
        api.getClinicBySlug("mediflow-demo"),
        api.getClinicStaff(sess.clinic_id, sess.access_token),
      ]);
      setClinic(cData);
      setStaffList(sData || []);
      if (!newDeptId && cData?.departments?.length > 0) {
        setNewDeptId(String(cData.departments[0].department_id));
      }
    } catch (err) {
      setError(err.message || "Failed to load admin staff data.");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await api.staffLogin(email.trim(), password);
      if (res.role !== "ADMIN") {
        setError("Only ADMIN accounts can access Staff & Department Management.");
        setLoading(false);
        return;
      }
      setSession(res);
      await loadAll(res);
    } catch (err) {
      setError(err.message || "Admin login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateStaff(e) {
    e.preventDefault();
    if (!session) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const payload = {
        user_id: newUserId.trim() ? Number(newUserId.trim()) : null,
        full_name: newFullName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        department_id: newDeptId ? Number(newDeptId) : null,
        specialization: newSpecialization.trim() || null,
        degrees: newDegrees.trim() || null,
        room_number: newRoom.trim() || null,
        license_number: newLicense.trim() || null,
        phone_number: newPhone.trim() || null,
      };
      const created = await api.createClinicStaff(session.clinic_id, payload, session.access_token);
      setSuccess(
        `Added ${created.role} "${created.full_name}" (ID #${created.user_id}) assigned to ${
          created.department_name || "No specific department"
        }.`
      );
      setNewUserId("");
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      setNewSpecialization("");
      setNewDegrees("");
      setNewRoom("");
      setNewLicense("");
      setNewPhone("");
      await loadAll(session);
    } catch (err) {
      setError(err.message || "Failed to add staff member.");
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(member) {
    setEditingStaff(member);
    setEditDeptId(member.department_id ? String(member.department_id) : "");
    setEditEmail(member.email || "");
    setEditPassword("");
    setEditRoom(member.room_number || "");
    setEditRole(member.role || "DOCTOR");
    setEditActive(Boolean(member.is_active));
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!session || !editingStaff) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const payload = {
        role: editRole,
        department_id: editDeptId ? Number(editDeptId) : null,
        email: editEmail.trim(),
        room_number: editRoom.trim() || null,
        is_active: editActive,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }
      const updated = await api.updateClinicStaff(
        session.clinic_id,
        editingStaff.user_id,
        payload,
        session.access_token
      );
      setSuccess(`Updated ID #${updated.user_id} (${updated.full_name}).`);
      setEditingStaff(null);
      await loadAll(session);
    } catch (err) {
      setError(err.message || "Failed to update staff member.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleAttendance(member) {
    if (!session) return;
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateClinicStaff(
        session.clinic_id,
        member.user_id,
        { is_present: !member.is_present },
        session.access_token
      );
      setSuccess(
        `${updated.full_name} (ID #${updated.user_id}) marked ${
          updated.is_present ? "PRESENT" : "ABSENT"
        }.`
      );
      await loadAll(session);
    } catch (err) {
      setError(err.message || "Failed to update attendance.");
    }
  }

  async function handleDeleteStaff(member) {
    if (!session) return;
    if (!window.confirm(`Remove ${member.role} "${member.full_name}" (ID #${member.user_id})?`)) return;
    setError("");
    setSuccess("");
    try {
      await api.deleteClinicStaff(session.clinic_id, member.user_id, session.access_token);
      setSuccess(`Removed ID #${member.user_id} (${member.full_name}).`);
      await loadAll(session);
    } catch (err) {
      setError(err.message || "Failed to remove staff member.");
    }
  }

  const doctorsCount = staffList.filter((s) => s.role === "DOCTOR").length;
  const nursesCount = staffList.filter((s) => s.role === "NURSE").length;

  return (
    <main className="min-h-screen bg-slate-50/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="glass-card rounded-3xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-xl shadow-sm">
              🏥
            </div>
            <div>
              <Link href="/" className="text-xs font-bold text-teal-700 hover:underline">
                ← Back to Hub
              </Link>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Admin Staff &amp; Department Console
              </h1>
              <p className="text-xs text-slate-500">
                Add Doctors &amp; Nurses, assign clean IDs &amp; departments, and set login emails/passwords.
              </p>
            </div>
          </div>
          {session && (
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-2">
              <div className="text-right text-xs">
                <span className="font-bold text-slate-800">{session.full_name}</span>
                <span className="block text-[11px] text-teal-700 font-semibold">ADMIN • ID #{session.user_id}</span>
              </div>
              <button
                onClick={() => {
                  setSession(null);
                  setStaffList([]);
                }}
                className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-rose-700 text-xs">✕</button>
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 flex items-center justify-between">
            <span>✅ {success}</span>
            <button onClick={() => setSuccess("")} className="text-emerald-700 text-xs">✕</button>
          </div>
        )}

        {!session ? (
          <form
            onSubmit={handleLogin}
            className="max-w-md mx-auto glass-card rounded-3xl p-7 space-y-4 my-12"
          >
            <div>
              <span className="inline-block rounded-full bg-teal-50 border border-teal-200 px-3 py-0.5 text-[11px] font-bold text-teal-700">
                Admin Access Required
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-2">Admin Sign In</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sign in with your administrator credentials to manage doctors, nurses, and departments.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-50 shadow-sm"
            >
              {loading ? "Signing In..." : "Open Admin Console →"}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500">Total Staff</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{staffList.length}</p>
              </div>
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500">Doctors</p>
                <p className="text-2xl font-black text-blue-600 mt-1">{doctorsCount}</p>
              </div>
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500">Nurses</p>
                <p className="text-2xl font-black text-teal-600 mt-1">{nursesCount}</p>
              </div>
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500">Departments</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">
                  {clinic?.departments?.length || 0}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-12 items-start">
              {/* Add Doctor / Nurse Form */}
              <form
                onSubmit={handleCreateStaff}
                className="lg:col-span-4 glass-card rounded-3xl p-6 space-y-4"
              >
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Add Doctor / Nurse</h2>
                  <p className="text-xs text-slate-500">
                    Assign ID, department, email, and login password.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="DOCTOR">Doctor</option>
                      <option value="NURSE">Nurse</option>
                      <option value="RECEPTIONIST">Receptionist</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assign ID (Optional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Auto (e.g. 7)"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder={newRole === "DOCTOR" ? "e.g. Dr. Bilal Raza" : "e.g. Nurse Sana"}
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assign Department *
                  </label>
                  <select
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    required={newRole === "DOCTOR"}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">All / No Specific Department</option>
                    {(clinic?.departments || []).map((d) => (
                      <option key={d.department_id} value={d.department_id}>
                        ID #{d.department_id} — {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Login Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="name@mediflow.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Password *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Specialization</label>
                    <input
                      type="text"
                      placeholder="e.g. Cardiologist"
                      value={newSpecialization}
                      onChange={(e) => setNewSpecialization(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Room / Station</label>
                    <input
                      type="text"
                      placeholder="e.g. Room 204"
                      value={newRoom}
                      onChange={(e) => setNewRoom(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Degrees</label>
                    <input
                      type="text"
                      placeholder="e.g. MBBS, FCPS"
                      value={newDegrees}
                      onChange={(e) => setNewDegrees(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                    <input
                      type="text"
                      placeholder="0300-1234567"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-50 shadow-sm"
                >
                  {loading ? "Saving..." : `+ Create ${newRole} Account`}
                </button>
              </form>

              {/* Staff Directory */}
              <div className="lg:col-span-8 glass-card rounded-3xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Hospital Staff Directory</h2>
                    <p className="text-xs text-slate-500">
                      Doctors only receive patients from their assigned department.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadAll(session)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Refresh
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2.5 pr-3">ID</th>
                        <th className="py-2.5 pr-3">Name &amp; Details</th>
                        <th className="py-2.5 pr-3">Role</th>
                        <th className="py-2.5 pr-3">Department</th>
                        <th className="py-2.5 pr-3">Attendance</th>
                        <th className="py-2.5 pr-3">Login Email</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {staffList.map((member) => (
                        <tr key={member.user_id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-3 font-mono font-bold text-slate-900">
                            #{member.user_id}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="font-bold text-slate-900">{member.full_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {[member.specialization, member.room_number].filter(Boolean).join(" • ") || "—"}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                member.role === "DOCTOR"
                                  ? "bg-blue-100 text-blue-800"
                                  : member.role === "NURSE"
                                  ? "bg-teal-100 text-teal-800"
                                  : member.role === "ADMIN"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {member.role}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-slate-700 font-medium">
                            {member.department_name || "All / Unassigned"}
                          </td>
                          <td className="py-3 pr-3">
                            <button
                              type="button"
                              onClick={() => handleToggleAttendance(member)}
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
                                member.is_present
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                              }`}
                            >
                              {member.is_present ? "● Present" : "○ Absent"}
                            </button>
                          </td>
                          <td className="py-3 pr-3 font-mono text-slate-600">{member.email}</td>
                          <td className="py-3 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditModal(member)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            {member.user_id !== session.user_id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteStaff(member)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Staff Modal */}
        {editingStaff && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveEdit}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-slate-900">
                  Edit ID #{editingStaff.user_id} — {editingStaff.full_name}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="DOCTOR">Doctor</option>
                    <option value="NURSE">Nurse</option>
                    <option value="RECEPTIONIST">Receptionist</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Room</label>
                  <input
                    type="text"
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <select
                  value={editDeptId}
                  onChange={(e) => setEditDeptId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">All / Unassigned</option>
                  {(clinic?.departments || []).map((d) => (
                    <option key={d.department_id} value={d.department_id}>
                      ID #{d.department_id} — {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (leave blank to keep current)
                </label>
                <input
                  type="password"
                  minLength={6}
                  placeholder="••••••••"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="editActiveCheck"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <label htmlFor="editActiveCheck" className="text-xs font-semibold text-slate-700">
                  Account Active
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
