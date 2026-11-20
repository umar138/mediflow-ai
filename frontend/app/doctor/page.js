"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { connectRealtimeSocket } from "../../lib/ws";

export default function DoctorDashboardPage() {
  const [email, setEmail] = useState("dr.sara@mediflow.demo");
  const [password, setPassword] = useState("DemoPass123!");
  const [session, setSession] = useState(null);
  const [queueData, setQueueData] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [clinicianNote, setClinicianNote] = useState("");
  const [error, setError] = useState("");
  const [statusBanner, setStatusBanner] = useState("");

  async function loadQueue(sess = session) {
    if (!sess) return;
    try {
      const q = await api.getQueue(sess.clinic_id, sess.department_id, sess.access_token);
      setQueueData(q);
      if (q.tickets?.length > 0) {
        const currentStillPresent = selectedTicket
          ? q.tickets.find((item) => item.ticket_id === selectedTicket.ticket_id)
          : null;
        setSelectedTicket(currentStillPresent || q.tickets[0]);
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
      await loadQueue(authRes);
    } catch (err) {
      setError(err.message || "Authentication failed.");
    }
  }

  useEffect(() => {
    if (!session) return;
    const stopWs = connectRealtimeSocket(`/api/v1/ws/clinics/${session.clinic_id}`, {
      onReconnect: () => loadQueue(session),
      onMessage: () => loadQueue(session),
    });
    const poll = setInterval(() => loadQueue(session), 12000);
    return () => {
      stopWs();
      clearInterval(poll);
    };
  }, [session]);

  async function handleAction(actionType) {
    if (!session || !selectedTicket) return;
    setError("");
    setStatusBanner("");
    try {
      if (actionType === "call") {
        await api.callTicket(selectedTicket.ticket_id, session.access_token);
        setStatusBanner(`Called token ${selectedTicket.token_code}`);
      } else if (actionType === "start") {
        await api.startTicket(selectedTicket.ticket_id, session.access_token);
        setStatusBanner(`Started consultation for ${selectedTicket.token_code}`);
      } else if (actionType === "complete") {
        await api.completeTicket(
          selectedTicket.ticket_id,
          { doctor_id: session.user_id, clinician_note: clinicianNote || null },
          session.access_token
        );
        setClinicianNote("");
        setStatusBanner(`Completed consultation for ${selectedTicket.token_code}`);
      }
      await loadQueue(session);
    } catch (err) {
      setError(err.message || `Failed to ${actionType} ticket.`);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <Link href="/" className="text-xs font-medium text-blue-600 hover:underline">
            ← Hub
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Doctor Triage & Consultation Queue</h1>
        </div>
        {session && (
          <div className="text-right text-xs text-slate-600">
            <div className="font-semibold text-slate-900">{session.full_name}</div>
            <div>Role: {session.role}</div>
          </div>
        )}
      </div>

      {queueData && queueData.active_delay_minutes > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 font-medium">
          ⏱️ Active Clinic Delay: +{queueData.active_delay_minutes} minutes factored into ETA windows.
        </div>
      )}

      {statusBanner && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {statusBanner}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          {error}
        </div>
      )}

      {!session ? (
        <form
          onSubmit={handleLogin}
          className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-bold">Doctor Sign In</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open Doctor Queue
          </button>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Ordered Queue List */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider px-1">
              Server-Ordered Queue
            </h2>
            {(queueData?.tickets || []).map((t) => {
              const active = selectedTicket?.ticket_id === t.ticket_id;
              return (
                <button
                  key={t.ticket_id}
                  onClick={() => setSelectedTicket(t)}
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    active ? "border-blue-600 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-base text-slate-900">{t.token_code}</span>
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
                    <span>Status: {t.status}</span>
                    <span>Score: {t.priority_score}</span>
                    <span>Wait: {t.wait_minutes}m</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail & Actions Panel */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!selectedTicket ? (
              <p className="text-sm text-slate-500">Select a patient token from the queue.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-2xl font-black text-slate-900">
                      {selectedTicket.token_code}
                    </span>
                    <span className="ml-3 text-xs font-semibold text-slate-500">
                      {selectedTicket.status} • ETA {selectedTicket.eta_min_minutes}–
                      {selectedTicket.eta_max_minutes}m
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Score {selectedTicket.priority_score}
                  </span>
                </div>

                {selectedTicket.urgency === "RED" && (
                  <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3.5 text-red-950">
                    <p className="text-xs font-extrabold uppercase">
                      RED Flag Escalation — Rule Reasons
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
                      {(selectedTicket.red_flag_reasons || []).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                  <p className="text-xs font-bold text-indigo-900">
                    {selectedTicket.doctor_pre_brief}
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs font-bold text-slate-700 mb-1">
                      Patient-Reported Symptoms
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedTicket.normalized_symptoms || []).map((sym, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-800"
                        >
                          {sym}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3 text-xs space-y-1">
                    <div className="font-bold text-slate-700">Measured Vitals</div>
                    <div>BP: {selectedTicket.vitals?.systolic_bp ?? "—"}/{selectedTicket.vitals?.diastolic_bp ?? "—"} mmHg</div>
                    <div>SpO2: {selectedTicket.vitals?.spo2_percent ?? "—"}%</div>
                    <div>Temp: {selectedTicket.vitals?.temperature_c ?? "—"} °C</div>
                    <div>Pulse: {selectedTicket.vitals?.pulse_bpm ?? "—"} bpm</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinician Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={clinicianNote}
                    onChange={(e) => setClinicianNote(e.target.value)}
                    placeholder="Enter consultation summary note..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => handleAction("call")}
                    className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
                  >
                    Call Token
                  </button>
                  <button
                    onClick={() => handleAction("start")}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    Start Consultation
                  </button>
                  <button
                    onClick={() => handleAction("complete")}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Complete Consultation
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}