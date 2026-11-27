"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { connectRealtimeSocket } from "../../lib/ws";

export default function DoctorDashboardPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [queueData, setQueueData] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [clinicianNote, setClinicianNote] = useState("");
  const [error, setError] = useState("");
  const [statusBanner, setStatusBanner] = useState("");

  // Digital Prescription Form States
  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState([
    { name: "", dosage: "1 Tab", frequency: "1-0-1 (صبح، شام)", duration: "5 days", instructions: "کھانے کے بعد (After meal)" }
  ]);
  const [labTests, setLabTests] = useState("");
  const [advice, setAdvice] = useState("");
  const [followUp, setFollowUp] = useState("5 days");

  function handleAddMedicine() {
    setMedicines((prev) => [
      ...prev,
      { name: "", dosage: "1 Tab", frequency: "1-0-1 (صبح، شام)", duration: "5 days", instructions: "کھانے کے بعد (After meal)" }
    ]);
  }

  function handleRemoveMedicine(index) {
    setMedicines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMedicineChange(index, field, value) {
    setMedicines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  async function loadQueue(sess = session, deptId = selectedDeptId) {
    if (!sess) return;
    try {
      const q = await api.getQueue(sess.clinic_id, deptId || null, sess.access_token);
      setQueueData(q);
      if (q.tickets?.length > 0) {
        setSelectedTicket((prev) => {
          if (!prev) return q.tickets[0];
          const exists = q.tickets.find((t) => t.ticket_id === prev.ticket_id);
          return exists || q.tickets[0];
        });
      } else {
        setSelectedTicket(null);
      }
    } catch (err) {
      setError(err.message || "Could not load doctor queue.");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const authRes = await api.staffLogin(email, password);
      setSession(authRes);
      try {
        const cData = await api.getClinicBySlug("mediflow-demo");
        setClinic(cData);
      } catch {
        // fallback if clinic slug differs
      }
      const initialDept =
        (authRes.role === "DOCTOR" || authRes.role === "NURSE") && authRes.department_id
          ? String(authRes.department_id)
          : "";
      setSelectedDeptId(initialDept);
      await loadQueue(authRes, initialDept);
    } catch (err) {
      setError(err.message || "Authentication failed.");
    }
  }

  useEffect(() => {
    if (!session) return;
    loadQueue(session, selectedDeptId);
    const stopWs = connectRealtimeSocket(`/api/v1/ws/clinics/${session.clinic_id}`, {
      onReconnect: () => loadQueue(session, selectedDeptId),
      onMessage: () => loadQueue(session, selectedDeptId),
    });
    const poll = setInterval(() => loadQueue(session, selectedDeptId), 8000);
    return () => {
      stopWs();
      clearInterval(poll);
    };
  }, [session, selectedDeptId]);

  async function handleAction(actionType, targetTicket = selectedTicket) {
    if (!session || !targetTicket) return;
    setError("");
    setStatusBanner("");
    try {
      if (actionType === "call") {
        await api.callTicket(targetTicket.ticket_id, session.access_token);
        setStatusBanner(`🔔 Called token ${targetTicket.token_code} — Patient requested to enter.`);
      } else if (actionType === "start") {
        await api.startTicket(targetTicket.ticket_id, session.access_token);
        setStatusBanner(`🩺 Consultation started for ${targetTicket.token_code}.`);
      } else if (actionType === "complete") {
        const validMeds = medicines.filter((m) => m.name && m.name.trim().length > 0);
        await api.completeTicket(
          targetTicket.ticket_id,
          {
            doctor_id: session.user_id,
            clinician_note: clinicianNote || null,
            diagnosis: diagnosis.trim() || null,
            prescription_medicines: validMeds.length > 0 ? validMeds : null,
            lab_tests: labTests.trim() || null,
            advice: advice.trim() || null,
            follow_up: followUp.trim() || null,
          },
          session.access_token
        );
        setClinicianNote("");
        setDiagnosis("");
        setMedicines([
          { name: "", dosage: "1 Tab", frequency: "1-0-1 (صبح، شام)", duration: "5 days", instructions: "کھانے کے بعد (After meal)" }
        ]);
        setLabTests("");
        setAdvice("");
        setFollowUp("5 days");
        setStatusBanner(`✅ Completed consultation & generated digital prescription for ${targetTicket.token_code}!`);
      }
      await loadQueue(session, selectedDeptId);
    } catch (err) {
      setError(err.message || `Failed to ${actionType} ticket.`);
    }
  }

  // Active serving ticket (either in CALLED or IN_CONSULTATION)
  const activeServingTicket = queueData?.tickets?.find(
    (t) => t.status === "IN_CONSULTATION" || t.status === "CALLED"
  );

  // Next waiting ticket in line
  const nextWaitingTicket = queueData?.tickets?.find((t) => t.status === "WAITING");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
        <div>
          <Link href="/" className="text-xs font-semibold text-blue-600 hover:underline">
            ← Hub
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Doctor Triage & Consultation Queue
          </h1>
        </div>
        {session && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="font-bold text-sm text-slate-900">{session.full_name}</div>
              <div className="text-xs text-slate-500">
                {session.role} • {session.department_name || "All Departments"}
                {session.room_number ? ` • ${session.room_number}` : ""}
              </div>
            </div>
            <button
              onClick={() => {
                setSession(null);
                setQueueData(null);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {statusBanner && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm flex items-center justify-between">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner("")} className="text-emerald-700 hover:text-emerald-900 text-xs">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 shadow-sm">
          {error}
        </div>
      )}

      {!session ? (
        <form
          onSubmit={handleLogin}
          className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 my-10"
        >
          <h2 className="text-xl font-bold text-slate-900">Doctor Sign In</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            Open Doctor Queue
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          {/* NOW SERVING PROMINENT BANNER */}
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🩺</span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Now Serving
                  </div>
                  {activeServingTicket ? (
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-3xl font-black text-slate-900">
                        {activeServingTicket.token_code}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase ${
                          activeServingTicket.status === "IN_CONSULTATION"
                            ? "bg-blue-600 text-white animate-pulse"
                            : "bg-amber-400 text-slate-950"
                        }`}
                      >
                        {activeServingTicket.status === "IN_CONSULTATION"
                          ? "In Consultation"
                          : "Called / Patient Entering"}
                      </span>
                      <span className="text-sm font-medium text-slate-600">
                        ({activeServingTicket.patient_name || "Patient"})
                      </span>
                    </div>
                  ) : (
                    <div className="text-base text-slate-400 font-medium mt-0.5">
                      No patient currently in consultation. Ready to call next!
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions for Now Serving */}
              <div className="flex items-center gap-3">
                {activeServingTicket ? (
                  <>
                    {activeServingTicket.status === "CALLED" && (
                      <button
                        onClick={() => handleAction("start", activeServingTicket)}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow"
                      >
                        Start Consultation
                      </button>
                    )}
                    {activeServingTicket.status === "IN_CONSULTATION" && session.role !== "NURSE" && (
                      <button
                        onClick={() => handleAction("complete", activeServingTicket)}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow"
                      >
                        Complete Consultation
                      </button>
                    )}
                  </>
                ) : (
                  nextWaitingTicket && (
                    <button
                      onClick={() => handleAction("call", nextWaitingTicket)}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow flex items-center gap-2"
                    >
                      <span>🔔</span>
                      <span>Call Next Patient: {nextWaitingTicket.token_code}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Assigned Department & Room Banner (No Filter Dropdown for Doctors/Nurses) */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-100 p-3.5 rounded-xl">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(session.role === "DOCTOR" || session.role === "NURSE") && session.department_id ? (
                <>
                  <span className="font-semibold text-slate-700">Department:</span>
                  <span className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                    {session.department_name || `Department #${session.department_id}`}
                  </span>
                  {session.room_number && (
                    <span className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                      Room: {session.room_number}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-700">Filter Department:</span>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Departments (Hospital Wide Queue)</option>
                    {(clinic?.departments || []).map((d) => (
                      <option key={d.department_id} value={d.department_id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Total Active Queue: <span className="font-bold text-slate-800">{queueData?.tickets?.length || 0}</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Server-Ordered Queue List */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Server-Ordered Queue
                </h2>
                <span className="text-xs text-slate-500">
                  {queueData?.tickets?.length || 0} Patients
                </span>
              </div>

              {(queueData?.tickets || []).length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  No active patients in this queue.
                </div>
              ) : (
                queueData.tickets.map((t) => {
                  const active = selectedTicket?.ticket_id === t.ticket_id;
                  const isCurrent = t.status === "CALLED" || t.status === "IN_CONSULTATION";
                  return (
                    <button
                      key={t.ticket_id}
                      onClick={() => setSelectedTicket(t)}
                      className={`w-full text-left rounded-xl border p-3 transition ${
                        active
                          ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20"
                          : isCurrent
                          ? "border-emerald-400 bg-emerald-50/40"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-base text-slate-900">
                            {t.token_code}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white">
                              SERVING
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            t.urgency === "RED"
                              ? "bg-red-600 text-white"
                              : t.urgency === "YELLOW"
                              ? "bg-amber-200 text-amber-950"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {t.urgency}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold">{t.status}</span>
                        <span>Score: {t.priority_score}</span>
                        <span>Wait: {t.wait_minutes}m</span>
                      </div>
                      {t.department_name && (
                        <div className="mt-1 text-[11px] text-slate-400">
                          Dept: {t.department_name}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Detail & Consultation Action Panel */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {!selectedTicket ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  Select a patient token from the queue to view details and start consultation.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-black text-slate-900">
                          {selectedTicket.token_code}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            selectedTicket.status === "IN_CONSULTATION"
                              ? "bg-blue-600 text-white"
                              : selectedTicket.status === "CALLED"
                              ? "bg-amber-400 text-slate-950"
                              : "bg-slate-200 text-slate-800"
                          }`}
                        >
                          {selectedTicket.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Patient: <span className="font-bold text-slate-700">{selectedTicket.patient_name || "Patient"}</span>
                        {selectedTicket.department_name && ` • ${selectedTicket.department_name}`}
                        {` • ETA ${selectedTicket.eta_min_minutes ?? "—"}–${selectedTicket.eta_max_minutes ?? "—"}m`}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      Score {selectedTicket.priority_score}
                    </span>
                  </div>

                  {selectedTicket.urgency === "RED" && (
                    <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-950">
                      <p className="text-xs font-extrabold uppercase">
                        🚨 RED Flag Escalation — Rule Reasons
                      </p>
                      <ul className="mt-1.5 list-disc pl-5 text-xs space-y-1">
                        {(selectedTicket.red_flag_reasons || []).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                    <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1">
                      AI Doctor Pre-Brief
                    </div>
                    <p className="text-sm font-medium text-indigo-950">
                      {selectedTicket.doctor_pre_brief}
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 p-3.5">
                      <div className="text-xs font-bold text-slate-700 mb-2">
                        Patient-Reported Symptoms
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedTicket.normalized_symptoms || []).length > 0 ? (
                          selectedTicket.normalized_symptoms.map((sym, idx) => (
                            <span
                              key={idx}
                              className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-800"
                            >
                              {sym}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">No normalized symptoms</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-1.5">
                      <div className="font-bold text-slate-700 mb-1">Measured Vitals</div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Blood Pressure:</span>
                        <span className="font-semibold text-slate-900">
                          {selectedTicket.vitals?.systolic_bp ?? "—"}/{selectedTicket.vitals?.diastolic_bp ?? "—"} mmHg
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Oxygen (SpO2):</span>
                        <span className="font-semibold text-slate-900">
                          {selectedTicket.vitals?.spo2_percent ? `${selectedTicket.vitals.spo2_percent}%` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Temperature:</span>
                        <span className="font-semibold text-slate-900">
                          {selectedTicket.vitals?.temperature_c ? `${selectedTicket.vitals.temperature_c} °C` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Pulse:</span>
                        <span className="font-semibold text-slate-900">
                          {selectedTicket.vitals?.pulse_bpm ? `${selectedTicket.vitals.pulse_bpm} bpm` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Digital Prescription Builder (Visible during IN_CONSULTATION or COMPLETED) */}
                  {selectedTicket.status === "IN_CONSULTATION" && (
                    <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/40 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🩺</span>
                          <span className="text-sm font-black text-slate-900">
                            Digital E-Prescription Builder (ڈیجیٹل نسخہ تیار کریں)
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          Auto-saved to Patient Portal
                        </span>
                      </div>

                      {/* 1. Diagnosis */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Clinical Diagnosis / تشخیص *
                        </label>
                        <input
                          type="text"
                          value={diagnosis}
                          onChange={(e) => setDiagnosis(e.target.value)}
                          placeholder="e.g. Acute Bronchitis, Viral Pharyngitis, Hypertension Stage 1..."
                          className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {["Acute Bronchitis", "Viral Pharyngitis", "Hypertension", "Gastroenteritis", "Allergic Rhinitis", "Migraine", "Typhoid"].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setDiagnosis(d)}
                              className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md hover:bg-emerald-50 hover:border-emerald-300 transition"
                            >
                              + {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. Medicines Rx List */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="font-serif italic text-base text-emerald-800">℞</span>
                            <span>Prescribed Medicines / ادویات کی تفصیل</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleAddMedicine}
                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300 transition"
                          >
                            + Add Medicine (دوائی شامل کریں)
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          {medicines.map((med, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs space-y-2"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                <div className="sm:col-span-5">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Medicine Name & Strength
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Panadol 500mg, Augmentin 625mg"
                                    value={med.name}
                                    onChange={(e) => handleMedicineChange(idx, "name", e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>

                                <div className="sm:col-span-2">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Dosage (مقدار)
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="1 Tab / 5ml"
                                    value={med.dosage}
                                    onChange={(e) => handleMedicineChange(idx, "dosage", e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>

                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Frequency (وقت)
                                  </label>
                                  <select
                                    value={med.frequency}
                                    onChange={(e) => handleMedicineChange(idx, "frequency", e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  >
                                    <option value="1-0-1 (صبح، شام)">1-0-1 (صبح و شام)</option>
                                    <option value="1-1-1 (صبح، دوپہر، شام)">1-1-1 (صبح، دوپہر، شام)</option>
                                    <option value="0-0-1 (رات کو)">0-0-1 (رات کو)</option>
                                    <option value="1-0-0 (صبح نہار منہ)">1-0-0 (صبح نہار منہ)</option>
                                    <option value="SOS (ضرورت پڑنے پر)">SOS (ضرورت پڑنے پر)</option>
                                  </select>
                                </div>

                                <div className="sm:col-span-2 flex items-end gap-1">
                                  <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Duration (مدت)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="5 days"
                                      value={med.duration}
                                      onChange={(e) => handleMedicineChange(idx, "duration", e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                  </div>
                                  {medicines.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMedicine(idx)}
                                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 text-xs"
                                      title="Remove medicine"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div>
                                <input
                                  type="text"
                                  placeholder="Instructions (e.g. کھانے کے بعد، پانی زیادہ پیئیں)..."
                                  value={med.instructions}
                                  onChange={(e) => handleMedicineChange(idx, "instructions", e.target.value)}
                                  className="w-full rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Quick Medicine Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] text-slate-500 font-bold">Quick Add:</span>
                          {[
                            "Panadol 500mg",
                            "Augmentin 625mg",
                            "Brufen 400mg",
                            "Azomax 250mg",
                            "Omeprazole 20mg",
                            "Gravinate",
                            "Flagyl 400mg",
                            "Cetirizine 10mg",
                          ].map((medName) => (
                            <button
                              key={medName}
                              type="button"
                              onClick={() => {
                                setMedicines((prev) => [
                                  ...prev.filter((m) => m.name.trim()),
                                  {
                                    name: medName,
                                    dosage: "1 Tab",
                                    frequency: "1-0-1 (صبح، شام)",
                                    duration: "5 days",
                                    instructions: "کھانے کے بعد (After meal)",
                                  },
                                ]);
                              }}
                              className="text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md hover:bg-blue-50 hover:border-blue-300 transition"
                            >
                              + {medName}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 3. Recommended Lab Tests */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Diagnostic Lab Tests Recommended / تجویز کردہ ٹیسٹ
                        </label>
                        <input
                          type="text"
                          value={labTests}
                          onChange={(e) => setLabTests(e.target.value)}
                          placeholder="e.g. Complete Blood Count (CBC), Chest X-Ray PA View, Urine R/E..."
                          className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {["CBC (Blood CP)", "Chest X-Ray", "Blood Sugar Random", "Urine R/E", "Lipid Profile", "ECG"].map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setLabTests((prev) => (prev ? `${prev}, ${t}` : t));
                              }}
                              className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md hover:bg-emerald-50 hover:border-emerald-300 transition"
                            >
                              + {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 4. Advice & Follow up */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            General Advice & Diet / پرہیز و ہدایات
                          </label>
                          <input
                            type="text"
                            value={advice}
                            onChange={(e) => setAdvice(e.target.value)}
                            placeholder="e.g. مکمل آرام کریں، ٹھنڈے پانی سے پرہیز، گرم سوپ اور بھاپ لیں..."
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            Follow-Up / دوبارہ معائنہ
                          </label>
                          <input
                            type="text"
                            value={followUp}
                            onChange={(e) => setFollowUp(e.target.value)}
                            placeholder="e.g. 5 days, 1 week, SOS"
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Clinician Consultation Note
                    </label>
                    <input
                      type="text"
                      value={clinicianNote}
                      onChange={(e) => setClinicianNote(e.target.value)}
                      placeholder="Add diagnosis, prescription or notes before completing consultation..."
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Consultation Flow Buttons */}
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-100">
                    {selectedTicket.status === "WAITING" && (
                      <button
                        onClick={() => handleAction("call")}
                        className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-600 shadow transition"
                      >
                        🔔 Call Token (Check In Patient)
                      </button>
                    )}

                    {selectedTicket.status === "CALLED" && (
                      <button
                        onClick={() => handleAction("start")}
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow transition"
                      >
                        🩺 Start Consultation
                      </button>
                    )}

                    {selectedTicket.status === "IN_CONSULTATION" && (
                      <button
                        onClick={() => handleAction("complete")}
                        className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow transition"
                      >
                        ✅ Complete Consultation
                      </button>
                    )}

                    {selectedTicket.status === "COMPLETED" && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800">
                        This consultation has been completed.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
