"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function ReceptionConsolePage() {
  const [email, setEmail] = useState("reception@mediflow.demo");
  const [password, setPassword] = useState("DemoPass123!");
  const [session, setSession] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [queueData, setQueueData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Walk-in form
  const [displayName, setDisplayName] = useState("");
  const [ageYears, setAgeYears] = useState("28");
  const [language, setLanguage] = useState("en");
  const [departmentId, setDepartmentId] = useState("");
  const [symptomText, setSymptomText] = useState("");

  // Vitals form
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [temperatureC, setTemperatureC] = useState("");
  const [spo2Percent, setSpo2Percent] = useState("");
  const [pulseBpm, setPulseBpm] = useState("");

  async function refreshQueue(sess = session) {
    if (!sess) return;
    try {
      const q = await api.getQueue(sess.clinic_id, null, sess.access_token);
      setQueueData(q);
      if (!selectedTicketId && q.tickets?.length > 0) {
        setSelectedTicketId(q.tickets[0].ticket_id);
      }
    } catch (err) {
      setError(err.message || "Failed to load queue.");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const authRes = await api.staffLogin(email, password);
      setSession(authRes);
      const cData = await api.getClinicBySlug("islamabad-care-clinic");
      setClinic(cData);
      if (cData.departments?.length > 0) {
        setDepartmentId(cData.departments[0].department_id);
      }
      const qData = await api.getQueue(authRes.clinic_id, null, authRes.access_token);
      setQueueData(qData);
      if (qData.tickets?.length > 0) {
        setSelectedTicketId(qData.tickets[0].ticket_id);
      }
    } catch (err) {
      setError(err.message || "Login failed.");
    }
  }

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => refreshQueue(session), 12000);
    return () => clearInterval(timer);
  }, [session]);

  async function handleCreateWalkIn(e) {
    e.preventDefault();
    if (!session) return;
    setError("");
    setNotice("");
    try {
      const created = await api.createWalkIn(
        {
          clinic_id: session.clinic_id,
          department_id: departmentId,
          display_name: displayName,
          age_years: Number(ageYears),
          preferred_language: language,
          symptom_text: symptomText,
          input_mode: "TEXT",
          patient_reported_duration: null,
        },
        session.access_token
      );
      setNotice(`Walk-in created: Token ${created.ticket.token_code} (${created.ticket.urgency})`);
      setDisplayName("");
      setSymptomText("");
      await refreshQueue(session);
    } catch (err) {
      setError(err.message || "Failed to create walk-in.");
    }
  }

  async function handleSaveVitals(e) {
    e.preventDefault();
    if (!session || !selectedTicketId) return;
    setError("");
    setNotice("");
    try {
      const payload = {
        systolic_bp: systolicBp !== "" ? Number(systolicBp) : null,
        diastolic_bp: diastolicBp !== "" ? Number(diastolicBp) : null,
        temperature_c: temperatureC !== "" ? Number(temperatureC) : null,
        spo2_percent: spo2Percent !== "" ? Number(spo2Percent) : null,
        pulse_bpm: pulseBpm !== "" ? Number(pulseBpm) : null,
        measured_at: new Date().toISOString(),
      };
      const updated = await api.addVitals(selectedTicketId, payload, session.access_token);
      setNotice(`Vitals saved for ${updated.token_code}. Current urgency: ${updated.urgency}`);
      await refreshQueue(session);
    } catch (err) {
      setError(err.message || "Failed to save vitals.");
    }
  }

  const redTickets = (queueData?.tickets || []).filter((t) => t.urgency === "RED");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs font-medium text-blue-600 hover:underline">
            ← Hub
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Reception & Nurse Console</h1>
        </div>
        {session && (
          <button
            onClick={() => refreshQueue(session)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
          >
            Refresh Queue
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {redTickets.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-950">
          <p className="font-bold text-sm">
            🚨 RED URGENCY ALERT — Alert Clinician Immediately for Tokens:{" "}
            {redTickets.map((t) => t.token_code).join(", ")}
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {redTickets.map((t) => (
              <li key={t.ticket_id}>
                <strong>{t.token_code}</strong>: {(t.red_flag_reasons || []).join("; ") || "Flagged RED"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!session ? (
        <form
          onSubmit={handleLogin}
          className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-bold">Staff Sign In</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sign In to Reception
          </button>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Walk-in intake */}
          <form
            onSubmit={handleCreateWalkIn}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <h2 className="font-bold text-base text-slate-900">Create Walk-In Ticket</h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Patient Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                required
                placeholder="Age"
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {(clinic?.departments || []).map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="en">English</option>
                <option value="roman_ur">Roman Urdu</option>
                <option value="ur">Urdu</option>
              </select>
            </div>
            <textarea
              rows={2}
              required
              placeholder="Chief complaint / symptoms"
              value={symptomText}
              onChange={(e) => setSymptomText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Issue Walk-In Token
            </button>
          </form>

          {/* Record vitals */}
          <form
            onSubmit={handleSaveVitals}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <h2 className="font-bold text-base text-slate-900">Record Vitals</h2>
            <select
              value={selectedTicketId}
              onChange={(e) => setSelectedTicketId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              {(queueData?.tickets || []).map((t) => (
                <option key={t.ticket_id} value={t.ticket_id}>
                  {t.token_code} — {t.urgency} ({t.status})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                placeholder="Systolic BP"
                value={systolicBp}
                onChange={(e) => setSystolicBp(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Diastolic BP"
                value={diastolicBp}
                onChange={(e) => setDiastolicBp(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
              <input
                type="number"
                step="0.1"
                placeholder="Temp (°C)"
                value={temperatureC}
                onChange={(e) => setTemperatureC(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="SpO2 %"
                value={spo2Percent}
                onChange={(e) => setSpo2Percent(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Pulse BPM"
                value={pulseBpm}
                onChange={(e) => setPulseBpm(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Save Vitals & Re-Evaluate Rules
            </button>
          </form>

          {/* Live queue table */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
            <h2 className="font-bold text-base text-slate-900 mb-3">
              Active Queue ({queueData?.tickets?.length || 0})
            </h2>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Token</th>
                  <th className="py-2 pr-3">Urgency</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Wait</th>
                  <th className="py-2 pr-3">ETA</th>
                  <th className="py-2">SpO2 / BP / Temp</th>
                </tr>
              </thead>
              <tbody>
                {(queueData?.tickets || []).map((t) => (
                  <tr key={t.ticket_id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-bold">{t.token_code}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          t.urgency === "RED"
                            ? "bg-red-100 text-red-800"
                            : t.urgency === "YELLOW"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {t.urgency}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">{t.status}</td>
                    <td className="py-2.5 pr-3">{t.priority_score}</td>
                    <td className="py-2.5 pr-3">{t.wait_minutes}m</td>
                    <td className="py-2.5 pr-3">
                      {t.eta_min_minutes}–{t.eta_max_minutes}m
                    </td>
                    <td className="py-2.5 text-slate-600">
                      SpO2: {t.vitals?.spo2_percent ?? "—"}% | BP: {t.vitals?.systolic_bp ?? "—"}/
                      {t.vitals?.diastolic_bp ?? "—"} | {t.vitals?.temperature_c ?? "—"}°C
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}