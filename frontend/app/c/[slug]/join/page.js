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
  const [cnic, setCnic] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("roman_ur");
  const [departmentId, setDepartmentId] = useState("");
  const [symptomText, setSymptomText] = useState("");
  const [duration, setDuration] = useState("");
  const [inputMode, setInputMode] = useState("TEXT");
  const [cardType, setCardType] = useState("AUTO");
  const [voiceNote, setVoiceNote] = useState("");
  const [createdResult, setCreatedResult] = useState(null);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState(null);

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

    // Auto-fill patient profile if logged in
    const savedToken = typeof window !== "undefined" ? localStorage.getItem("patient_token") : null;
    if (savedToken) {
      api.getPatientProfile(savedToken).then((p) => {
        if (!active || !p) return;
        if (p.full_name) setDisplayName(p.full_name);
        if (p.age_years) setAgeYears(String(p.age_years));
        if (p.cnic) setCnic(p.cnic);
      }).catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const text = symptomText.trim();
    if (text.length < 3) {
      setAiPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .triagePreview({
          symptom_text: text,
          age_years: ageYears ? Number(ageYears) : 30,
          preferred_language: preferredLanguage,
        })
        .then((res) => setAiPreview(res))
        .catch(() => {});
    }, 280);
    return () => clearTimeout(timer);
  }, [symptomText, ageYears, preferredLanguage]);

  async function handleInstantEmergency() {
    if (!clinic) return;
    setErrorMsg("");
    setEmergencyLoading(true);
    try {
      const res = await api.createEmergencyIntake(clinic.clinic_id, {
        preferred_language: preferredLanguage,
      });
      setCreatedResult(res);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate emergency RED card.");
    } finally {
      setEmergencyLoading(false);
    }
  }

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
      const cleanCnic = cnic ? cnic.trim().replace(" ", "") : undefined;
      const payload = {
        display_name: displayName.trim(),
        cnic: cleanCnic || undefined,
        age_years: Number(ageYears),
        preferred_language: preferredLanguage,
        symptom_text: symptomText.trim(),
        input_mode: inputMode,
        department_id: departmentId,
        patient_reported_duration: duration.trim() || null,
        card_type: cardType !== "AUTO" ? cardType : undefined,
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
          <div className="mt-5 rounded-2xl border-2 border-red-600 bg-gradient-to-r from-red-600 to-rose-600 p-4 text-white shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-white animate-ping"></span>
                  <h2 className="text-base font-extrabold tracking-tight">
                    🚨 Accident / Critical Emergency?
                  </h2>
                </div>
                <p className="mt-1 text-xs text-red-100">
                  کچھ لکھنے یا فارم بھرنے کی ضرورت نہیں! فوری ایمرجنسی ریڈ کارڈ (RED Card) حاصل کریں، باقی تفصیلات عملہ خود لے گا۔
                </p>
              </div>
              <button
                type="button"
                onClick={handleInstantEmergency}
                disabled={emergencyLoading}
                className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-black text-red-700 shadow-md hover:bg-red-50 active:scale-95 transition disabled:opacity-60"
              >
                {emergencyLoading ? "Generating..." : "🚨 1-Click Emergency RED Card"}
              </button>
            </div>
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
              <label className="block text-sm font-medium text-slate-700">
                CNIC / شناختی کارڈ نمبر (Optional)
              </label>
              <input
                type="text"
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
                placeholder="e.g. 42501-5373126-7 (Links token to your patient portal)"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono text-slate-800"
              />
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
              {aiPreview && (
                <div
                  className={`mt-2 rounded-xl border p-2.5 text-xs ${
                    aiPreview.urgency_tier === "RED"
                      ? "border-red-400 bg-red-50 text-red-900"
                      : aiPreview.urgency_tier === "YELLOW"
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-emerald-300 bg-emerald-50 text-emerald-900"
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>🤖 Smart AI Detection: {aiPreview.card_title}</span>
                    {aiPreview.recommended_department && (
                      <span className="text-[11px] font-semibold opacity-80">
                        Dept: {aiPreview.recommended_department}
                      </span>
                    )}
                  </div>
                  {aiPreview.red_flag_reasons?.length > 0 && (
                    <div className="mt-1 text-[11px] font-medium">
                      • {aiPreview.red_flag_reasons[0]}
                    </div>
                  )}
                </div>
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

            {/* Triage Card / Severity Selection */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                Triage Card / کارڈ کی قسم (Severity Selection)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                If the condition is serious or an emergency, select the RED Card for immediate escalation.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setCardType("AUTO")}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    cardType === "AUTO"
                      ? "border-blue-600 bg-blue-50 ring-2 ring-blue-500"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <span>🤖</span>
                    <span>Auto-Triage</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">AI Evaluates</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCardType("RED")}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    cardType === "RED"
                      ? "border-red-600 bg-red-50 ring-2 ring-red-500"
                      : "border-red-200 bg-red-50/50 hover:bg-red-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-red-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                    <span>RED Card</span>
                  </div>
                  <span className="text-[10px] text-red-600 font-semibold mt-1">🚨 Serious / Emergency</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCardType("YELLOW")}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    cardType === "YELLOW"
                      ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span>YELLOW Card</span>
                  </div>
                  <span className="text-[10px] text-amber-700 mt-1">⚠️ Urgent / Priority</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCardType("GREEN")}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    cardType === "GREEN"
                      ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>GREEN Card</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 mt-1">✅ Standard Routine</span>
                </button>
              </div>

              {cardType === "RED" && (
                <div className="mt-2.5 rounded-xl border-2 border-red-500 bg-red-50 p-3 text-red-950 flex items-start gap-2">
                  <span className="text-xl">🚨</span>
                  <div className="text-xs">
                    <span className="font-bold">CRITICAL / SERIOUS ALERT:</span> You selected RED Card.
                    You will be assigned an immediate Emergency Token (R-XXX) with highest triage priority.
                  </div>
                </div>
              )}
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
          <div
            className={`mt-6 rounded-2xl border-2 p-6 text-center space-y-3 ${
              createdResult.ticket.urgency === "RED"
                ? "border-red-500 bg-red-50"
                : createdResult.ticket.urgency === "YELLOW"
                ? "border-amber-400 bg-amber-50"
                : "border-emerald-300 bg-emerald-50"
            }`}
          >
            <p
              className={`text-xs font-extrabold uppercase tracking-wider ${
                createdResult.ticket.urgency === "RED"
                  ? "text-red-700"
                  : createdResult.ticket.urgency === "YELLOW"
                  ? "text-amber-700"
                  : "text-emerald-700"
              }`}
            >
              {createdResult.ticket.triage_card_title || "Token Issued"}
            </p>
            <p className="text-4xl font-extrabold text-slate-900">
              {createdResult.ticket.token_code}
            </p>
            {createdResult.ticket.triage_card_message && (
              <p className="text-xs font-medium text-slate-700">
                {createdResult.ticket.triage_card_message}
              </p>
            )}
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