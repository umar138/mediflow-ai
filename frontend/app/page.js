"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { connectRealtimeSocket } from "../lib/ws";

export default function HomePage() {
  const [clinic, setClinic] = useState(null);
  const [liveSummary, setLiveSummary] = useState(null);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState(null);
  const [emergencyError, setEmergencyError] = useState("");
  const [showAnalyticsPreview, setShowAnalyticsPreview] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadLiveSummary = useCallback((clinicId) => {
    if (!clinicId) return;
    api
      .getLiveSummary(clinicId)
      .then((res) => setLiveSummary(res))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getClinicBySlug("mediflow-demo")
      .then((c) => {
        setClinic(c);
        loadLiveSummary(c.clinic_id);
      })
      .catch(() => {});
  }, [loadLiveSummary]);

  useEffect(() => {
    if (!clinic?.clinic_id) return;
    const stopWs = clinic.display_token
      ? connectRealtimeSocket(`/api/v1/ws/public-display/${encodeURIComponent(clinic.display_token)}`, {
          onReconnect: () => loadLiveSummary(clinic.clinic_id),
          onMessage: () => loadLiveSummary(clinic.clinic_id),
        })
      : () => {};
    const poll = setInterval(() => loadLiveSummary(clinic.clinic_id), 6000);
    return () => {
      stopWs();
      clearInterval(poll);
    };
  }, [clinic, loadLiveSummary]);

  async function handleOneClickEmergency() {
    if (!clinic) {
      setEmergencyError("Clinic is loading or unavailable. Please try again.");
      return;
    }
    setEmergencyError("");
    setEmergencyLoading(true);
    try {
      const res = await api.createEmergencyIntake(clinic.clinic_id, {});
      setEmergencyResult(res);
      loadLiveSummary(clinic.clinic_id);
    } catch (err) {
      setEmergencyError(err.message || "Failed to generate emergency RED card.");
    } finally {
      setEmergencyLoading(false);
    }
  }

  const currentServing = liveSummary?.now_serving?.[0] || null;
  const liveQueue = liveSummary?.queue || [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
          {/* Left: Brand + Live Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </div>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              MediFlow <span className="text-teal-600">AI</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Smart Triage
            </span>
          </div>

          {/* Center: Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-slate-600">
            <a href="#top" className="text-slate-900 font-semibold border-b-2 border-teal-600 py-5 -mb-[2px]">
              Home
            </a>
            <a href="#portal" className="hover:text-teal-700 transition">
              Portal
            </a>
            <a href="#modules" className="hover:text-teal-700 transition">
              Features
            </a>
            <a href="#capabilities" className="hover:text-teal-700 transition">
              Resources
            </a>
            <a href="#capabilities" className="hover:text-teal-700 transition">
              About Us
            </a>
          </nav>

          {/* Right: Clinical Support Pill + Mobile Menu Button */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[11px] font-medium text-slate-600">
              <span className="text-teal-600">🛡️</span>
              <span>Clinical workflow &amp; triage support — not a medical diagnosis</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle Menu"
              className="md:hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
            <a href="#top" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-semibold text-teal-700">
              Home
            </a>
            <a href="#portal" onClick={() => setMobileMenuOpen(false)} className="py-1.5 hover:text-teal-700">
              Portal
            </a>
            <a href="#modules" onClick={() => setMobileMenuOpen(false)} className="py-1.5 hover:text-teal-700">
              Features
            </a>
            <a href="#capabilities" onClick={() => setMobileMenuOpen(false)} className="py-1.5 hover:text-teal-700">
              Resources &amp; About Us
            </a>
            <div className="pt-1 text-[11px] text-slate-500 border-t border-slate-100">
              🛡️ Clinical workflow &amp; triage support — not a medical diagnosis
            </div>
          </nav>
        )}
      </header>

      <main id="top" className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6 flex-1">
        {/* HERO SECTION */}
        <section className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-6 space-y-5">
            <h1 className="text-3xl sm:text-5xl xl:text-[54px] font-black tracking-tight text-slate-900 leading-[1.1]">
              Intelligent Triage.
              <br />
              Smarter Care.
              <br />
              <span className="text-teal-600">Better Outcomes.</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
              AI-powered triage, real-time queue tracking, digital prescriptions, and seamless care coordination — built for modern hospitals.
            </p>

            {/* 4 Feature Mini Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="rounded-2xl bg-white border border-slate-200/80 p-3 shadow-xs flex items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center text-base">
                  🩺
                </span>
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  AI-Powered Triage
                </span>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/80 p-3 shadow-xs flex items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-base">
                  👥
                </span>
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  Live Queue Tracking
                </span>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/80 p-3 shadow-xs flex items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-base">
                  📄
                </span>
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  Digital Prescriptions
                </span>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/80 p-3 shadow-xs flex items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-base">
                  🔔
                </span>
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  Instant Alerts
                </span>
              </div>
            </div>
          </div>

          {/* Right Hero Hospital Reception & Live Queue Scene */}
          <div className="lg:col-span-6">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-teal-50/40 to-sky-50/60 p-5 shadow-xl">
              {/* Top Wall: Now Serving TV + Queue Board */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-4">
                {/* Dark Digital TV Screen */}
                <div className="sm:col-span-7 rounded-2xl bg-slate-900 text-white p-4 shadow-md border border-slate-700 flex flex-col justify-between min-h-[156px]">
                  <div className="flex items-center justify-between text-[11px] text-teal-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Now Serving (Live)
                    </span>
                    <span className="text-slate-400">
                      {currentServing
                        ? currentServing.status === "IN_CONSULTATION"
                          ? "In Consultation"
                          : "Called"
                        : "OPD Display"}
                    </span>
                  </div>
                  <div className="py-2 text-center">
                    <div className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                      {currentServing ? currentServing.token_code : liveQueue[0]?.token_code || "READY"}
                    </div>
                    <div className="text-xs font-semibold text-slate-300 mt-1">
                      {currentServing
                        ? `${currentServing.room_number} • ${currentServing.department_name}`
                        : liveQueue[0]
                        ? `Next Up • ${liveQueue[0].department_name}`
                        : "No active patient in consultation"}
                    </div>
                  </div>
                </div>

                {/* Vertical Queue Board */}
                <div className="sm:col-span-5 rounded-2xl bg-white border border-slate-200 p-3 shadow-sm space-y-1.5 min-h-[156px]">
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-800 border-b border-slate-100 pb-1">
                    <span>Live Queue</span>
                    <span className="text-[10px] font-semibold text-teal-700">
                      {liveSummary ? `${liveSummary.waiting_count} Waiting` : "Syncing..."}
                    </span>
                  </div>
                  {liveQueue.length === 0 ? (
                    <div className="py-6 text-center text-[11px] text-slate-400">
                      Queue is currently clear
                    </div>
                  ) : (
                    liveQueue.slice(0, 4).map((row, idx) => (
                      <div
                        key={row.token_code}
                        className={`flex items-center justify-between text-[11px] px-2 py-1 rounded-lg ${
                          idx === 0 ? "bg-teal-50 text-teal-800 font-bold" : "text-slate-600"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              row.urgency === "RED"
                                ? "bg-red-500"
                                : row.urgency === "YELLOW"
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                            }`}
                          />
                          <span className="font-bold">{row.token_code}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 truncate max-w-[95px]">
                          {row.department_name}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reception Desk & Real-time Counts */}
              <div className="rounded-2xl bg-white/90 border border-slate-200/80 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-lg shadow-sm">
                    👩‍⚕️
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-slate-900">
                      Live Clinic Status
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Auto-updates on Check-in, Consultation &amp; Complete
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1">
                    ● {liveSummary?.waiting_count ?? 0} Waiting
                  </span>
                  <span className="rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold px-2.5 py-1">
                    🩺 {liveSummary?.in_consultation_count ?? 0} In Consult
                  </span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-1">
                    ✅ {liveSummary?.completed_count ?? 0} Completed
                  </span>
                  <span className="rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold px-2.5 py-1">
                    ~{liveSummary?.avg_wait_minutes ?? 12}m Avg
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FULL-WIDTH CORAL / RED EMERGENCY BANNER (OUTSIDE, ZERO-FORM) */}
        {!emergencyResult ? (
          <section className="rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-rose-400 p-4 sm:px-6 sm:py-4 text-white shadow-lg shadow-red-500/15">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-white flex items-center justify-center text-2xl shadow-sm">
                  🚨
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                    Accident or Critical Emergency?
                  </h2>
                  <p className="text-xs sm:text-sm text-rose-50">
                    Get immediate priority and notify the right team in one click. (بغیر فارم کے فوری ریڈ کارڈ)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOneClickEmergency}
                disabled={emergencyLoading}
                className="w-full sm:w-auto shrink-0 rounded-xl bg-red-900 hover:bg-red-950 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md active:scale-95 transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🚨</span>
                <span>{emergencyLoading ? "Issuing RED Card..." : "1-Click Emergency RED Card →"}</span>
              </button>
            </div>
            {emergencyError && (
              <p className="mt-2 text-xs font-semibold text-yellow-200">{emergencyError}</p>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border-2 border-red-500 bg-gradient-to-b from-red-50 to-white p-6 text-center shadow-lg space-y-3">
            <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-red-700">
              {emergencyResult.ticket.triage_card_title}
            </span>
            <p className="text-5xl font-black text-red-600 tracking-tight">
              {emergencyResult.ticket.token_code}
            </p>
            <p className="text-xs sm:text-sm text-slate-700 font-medium max-w-md mx-auto">
              {emergencyResult.ticket.triage_card_message}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href={`/track/${encodeURIComponent(emergencyResult.tracking_token)}`}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-red-700 transition"
              >
                Open Live Emergency Tracker →
              </Link>
              <button
                type="button"
                onClick={() => setEmergencyResult(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                New Emergency / Close
              </button>
            </div>
          </section>
        )}

        {/* PATIENT PORTAL FEATURE CARD */}
        <section
          id="portal"
          className="rounded-3xl border border-teal-100 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-white p-6 sm:p-8 shadow-sm"
        >
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            {/* Left Info */}
            <div className="lg:col-span-5 space-y-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-teal-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-teal-700 shadow-2xs">
                🔒 PATIENT PORTAL
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Your Health, Anytime Anywhere
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Login to track your live queue, get AI-powered triage, download prescriptions, and stay informed.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="text-teal-600">✔</span> Secure Login
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-teal-600">✔</span> Live Queue Position
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-teal-600">✔</span> Digital Prescriptions
                </span>
              </div>
              <div className="pt-2">
                <Link
                  href="/patient"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 px-5 py-3 text-sm font-bold text-white shadow-md transition"
                >
                  <span>Open Patient Portal</span>
                  <span>→</span>
                </Link>
              </div>
            </div>

            {/* Right Interactive Portal Mockup (Desktop + Mobile) */}
            <div className="lg:col-span-7 relative flex items-center justify-center lg:justify-end">
              {/* Desktop Card Mockup */}
              <div className="w-full max-w-xl rounded-2xl border border-slate-200/90 bg-white shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">mediflow.ai/patient</span>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Welcome, Ahmed</span>
                    <span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
                      ● Connected
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-teal-50/70 border border-teal-100 p-3">
                      <div className="text-[10px] font-semibold text-slate-500">Live Queue</div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-black text-teal-700">A-23</span>
                        <span className="text-xs font-bold text-slate-700">18 min</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <div className="text-[10px] font-semibold text-slate-500">Upcoming Appointment</div>
                      <div className="text-xs font-bold text-slate-800 mt-1">Cardiology OPD</div>
                      <div className="text-[10px] text-slate-500">10:30 AM • Room 101</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-2">
                    <div className="text-[11px] font-bold text-slate-700">Recent Prescriptions</div>
                    <div className="flex items-center justify-between text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                      <span className="font-semibold text-slate-800">💊 Paracetamol 500mg</span>
                      <span className="text-slate-400">1-0-1</span>
                      <span className="rounded bg-teal-50 text-teal-700 font-bold px-2 py-0.5">Download</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                      <span className="font-semibold text-slate-800">💊 Amoxicillin 250mg</span>
                      <span className="text-slate-400">1-0-1</span>
                      <span className="rounded bg-teal-50 text-teal-700 font-bold px-2 py-0.5">Download</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlapping Mobile Card Mockup (Desktop/Tablet) */}
              <div className="hidden md:block w-44 -ml-10 mt-10 rounded-3xl border-4 border-slate-900 bg-white shadow-2xl overflow-hidden shrink-0">
                <div className="bg-slate-900 h-3 w-16 mx-auto rounded-b-xl" />
                <div className="p-3 text-center space-y-2">
                  <div className="text-[10px] font-bold text-slate-700">Hello, Ahmed</div>
                  <div className="rounded-xl bg-teal-50 border border-teal-100 p-2.5">
                    <div className="text-[9px] text-slate-500">Live Queue</div>
                    <div className="text-xl font-black text-teal-700">A-23</div>
                    <div className="text-[9px] font-semibold text-slate-600">18 min wait</div>
                  </div>
                  <div className="rounded-lg bg-teal-700 text-white text-[9px] font-bold py-1.5">
                    View Queue Details
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4-COLUMN MODULE CARDS */}
        <section id="modules" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 01 Reception & Nurse */}
          <Link
            href="/reception"
            className="group rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs hover:shadow-md hover:border-teal-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <span className="h-11 w-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-xl">
                  👥
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  01
                </span>
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Reception &amp; Nurse</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Register walk-ins, manually update RED card details, and monitor real-time alerts.
              </p>
            </div>
            <div className="mt-4 text-xs font-bold text-teal-700 group-hover:translate-x-1 transition-transform">
              Open Console →
            </div>
          </Link>

          {/* 02 Doctor Dashboard */}
          <Link
            href="/doctor"
            className="group rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs hover:shadow-md hover:border-blue-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <span className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
                  🩺
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  02
                </span>
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Doctor Dashboard</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                AI clinical brief, patient history, vitals summary, and digital prescriptions.
              </p>
            </div>
            <div className="mt-4 text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
              Open Dashboard →
            </div>
          </Link>

          {/* 03 Waiting Room Display */}
          <Link
            href="/display/mediflow-main-display"
            className="group rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs hover:shadow-md hover:border-purple-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <span className="h-11 w-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl">
                  📺
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  03
                </span>
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Waiting Room Display</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Live token updates, health tips, and important notices for patients.
              </p>
            </div>
            <div className="mt-4 text-xs font-bold text-purple-600 group-hover:translate-x-1 transition-transform">
              Launch Display →
            </div>
          </Link>

          {/* 04 Analytics & Reports */}
          <button
            type="button"
            onClick={() => setShowAnalyticsPreview((v) => !v)}
            className="group text-left rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs hover:shadow-md hover:border-amber-300 transition flex flex-col justify-between cursor-pointer"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <span className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
                  📊
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  04
                </span>
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Analytics &amp; Reports</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Insights on wait times, patient flow, and department performance.
              </p>
            </div>
            <div className="mt-4 text-xs font-bold text-amber-600 group-hover:translate-x-1 transition-transform">
              View Reports →
            </div>
          </button>
        </section>

        {showAnalyticsPreview && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-4 text-xs text-amber-950">
            <div>
              <span className="font-bold">📊 Analytics &amp; Reports Module:</span>{" "}
              UI ready — department wait-time metrics, daily patient throughput, and triage distribution backend endpoints can be connected here next.
            </div>
            <button
              type="button"
              onClick={() => setShowAnalyticsPreview(false)}
              className="rounded-lg bg-white px-3 py-1 font-bold text-amber-800 border border-amber-200 hover:bg-amber-100"
            >
              Close
            </button>
          </div>
        )}

        {/* BOTTOM 4-COLUMN CAPABILITY STRIP */}
        <section
          id="capabilities"
          className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base">
              🛡️
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Enterprise Security</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Role-based access &amp; data encryption
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-base">
              ☁️
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Real-time Sync</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Live updates across all screens &amp; devices
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-base">
              📶
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Works Offline</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Local fallback with auto sync when online
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-base">
              📚
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Scalable Platform</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Built for hospitals of every size
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
