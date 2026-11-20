"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

export default function PatientJoinPage({ params }) {
  const { slug } = params;
  const [clinic, setClinic] = useState(null);
  const [loadingClinic, setLoadingClinic] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("roman_ur");
  const [departmentId, setDepartmentId] = useState("");
  const [symptomText, setSymptomText] = useState("");
  const [duration, setDuration] = useState("");
  const [inputMode, setInputMode] = useState("TEXT");
  const [voiceNote, setVoiceNote] = useState("");
  const [createdResult, setCreatedResult] = useState(null);

  const recognitionRef = useRef(null);
  const isRtl = preferredLanguage === "ur";

  useEffect(() => {
    let active = true;
    setLoadingClinic(true);
    api
      .getClinicBySlug(slug)
      .then((data) => {
        if (!active) return;
        setClinic(data);
        if (data.departments && data.departments.length > 0) {
          setDepartmentId(data.departments[0].department_id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err.message || "Could not load clinic info.");
      })
      .finally(() => {
        if (active) setLoadingClinic(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  function handleVoiceInput() {
    setVoiceNote("");
    const SpeechRec =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRec) {
      setInputMode("TEXT");
      setVoiceNote("Voice speech API unavailable on this browser. Please type your symptoms below.");
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = preferredLanguage === "ur" ? "ur-PK" : "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setInputMode("VOICE");
      setVoiceNote("Listening... speak clearly or type in the box.");

      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || "";
        if (transcript) {
          setSymptomText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setVoiceNote("Voice captured into text box. You can edit before submitting.");
        }
      };
      rec.onerror = () => {
        setInputMode("TEXT");
        setVoiceNote("Voice permission denied or unavailable. Text input remains ready.");
      };
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setInputMode("TEXT");
      setVoiceNote("Could not start voice capture. Please use text input.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    if (!clinic) return;
    if (!displayName.trim() || !ageYears || !departmentId || !symptomText.trim()) {
      setErrorMsg("Please fill out your name, age, department, and symptoms.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        display_name: displayName.trim(),
        age_years: Number(ageYears),
        preferred_language: preferredLanguage,
        symptom_text: symptomText.trim(),
        input_mode: inputMode,
        department_id: departmentId,
        patient_reported_duration: duration.trim() || null,
      };
      const res = await api.createIntake(clinic.clinic_id, payload);
      setCreatedResult(res);
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit intake.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      dir={isRtl ? "rtl" : "ltr"}
      className="mx-auto max-w-xl px-4 py-8"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-xs font-medium text-blue-600 hover:underline">
            ← Hub
          </Link>
          <span className="text-xs text-slate-500">QR Patient Check-In</span>
        </div>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="font-bold text-sm">
            ⚠️ Severe or worsening symptoms? Alert clinic staff immediately — do not wait for a token!
          </p>
          <p className="mt-1 text-xs text-red-800">
            Clinical workflow & triage decision-support tool — not a medical diagnosis.
          </p>
        </div>

        {loadingClinic && (
          <p className="mt-6 text-sm text-slate-600">Loading clinic details...</p>
        )}

        {errorMsg && (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMsg}
          </div>
        )}

        {clinic && !createdResult && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{clinic.name}</h1>
              <p className="mt-1 text-xs text-slate-600">{clinic.public_notice}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Language / زبان</label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="en">English (LTR)</option>
                <option value="roman_ur">Roman Urdu (LTR)</option>
                <option value="ur">اردو — Urdu (RTL)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Demo Patient 01"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Age (Years)</label>
                <input
                  type="number"
                  min={0}
                  max={130}
                  required
                  value={ageYears}
                  onChange={(e) => setAgeYears(e.target.value)}
                  placeholder="35"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white"
              >
                {(clinic.departments || []).map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-slate-700">Symptoms</label>
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  🎙️ Voice Dictation ({inputMode})
                </button>
              </div>
              <textarea
                rows={3}
                required
                value={symptomText}
                onChange={(e) => setSymptomText(e.target.value)}
                placeholder="bukhar aur khansi hai / بخار اور کھانسی / fever and cough"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
              {voiceNote && (
                <p className="mt-1 text-xs text-slate-600">{voiceNote}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Symptom Duration (Optional)
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 2 days"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Generating Token..." : "Get Queue Token"}
            </button>
          </form>
        )}

        {createdResult && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Token Issued
            </p>
            <p className="text-4xl font-extrabold text-slate-900">
              {createdResult.ticket.token_code}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
              <div className="rounded-lg bg-white p-2.5 border border-emerald-100">
                <div className="text-slate-500">Status</div>
                <div className="font-bold text-slate-900">{createdResult.ticket.status}</div>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-emerald-100">
                <div className="text-slate-500">Position</div>
                <div className="font-bold text-slate-900">#{createdResult.ticket.queue_position}</div>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-emerald-100">
                <div className="text-slate-500">Est. Wait</div>
                <div className="font-bold text-slate-900">
                  {createdResult.ticket.eta_min_minutes}–{createdResult.ticket.eta_max_minutes}m
                </div>
              </div>
            </div>
            <p className="text-xs text-amber-900 bg-amber-100/80 rounded-lg p-2">
              {createdResult.safety_message}
            </p>
            <div className="pt-2">
              <Link
                href={`/track/${encodeURIComponent(createdResult.tracking_token)}`}
                className="inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Open Live Queue Tracker →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}