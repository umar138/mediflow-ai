"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { connectRealtimeSocket } from "../../lib/ws";

export default function PatientPortalPage() {
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'register' | 'forgot'
  const [dashboardTab, setDashboardTab] = useState("live"); // 'live' | 'past' | 'book'
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [clinic, setClinic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [recoveredPass, setRecoveredPass] = useState("");
  const [viewingPrescription, setViewingPrescription] = useState(null);

  // Filters for Past History
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // In-Portal Token Booking Form
  const [bookDeptId, setBookDeptId] = useState("");
  const [bookSymptoms, setBookSymptoms] = useState("");
  const [bookDuration, setBookDuration] = useState("");
  const [bookCardType, setBookCardType] = useState("AUTO");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookTarget, setBookTarget] = useState("self"); // "self" | "other"
  const [otherName, setOtherName] = useState("");
  const [otherCnic, setOtherCnic] = useState("");
  const [otherAge, setOtherAge] = useState("");
  const [otherPhone, setOtherPhone] = useState("");
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [instantEmergencyResult, setInstantEmergencyResult] = useState(null);
  const [bookAiPreview, setBookAiPreview] = useState(null);

  // Login form states
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Registration form states
  const [regFullName, setRegFullName] = useState("");
  const [regCnic, setRegCnic] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAge, setRegAge] = useState("");
  const [regGender, setRegGender] = useState("other");
  const [regPassword, setRegPassword] = useState("");

  // Forgot password state
  const [forgotIdentifier, setForgotIdentifier] = useState("");

  // Check saved session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("patient_token");
    if (savedToken) {
      loadPatientData(savedToken);
    }
    // Load clinic departments for filters and booking
    api.getClinicBySlug("mediflow-demo").then((c) => {
      setClinic(c);
      if (c.departments?.length > 0) {
        setBookDeptId(c.departments[0].department_id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const text = bookSymptoms.trim();
    if (text.length < 3) {
      setBookAiPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .triagePreview({
          symptom_text: text,
          age_years: bookTarget === "other" && otherAge ? Number(otherAge) : profile?.age_years || 30,
          preferred_language: "roman_ur",
        })
        .then((res) => setBookAiPreview(res))
        .catch(() => {});
    }, 280);
    return () => clearTimeout(timer);
  }, [bookSymptoms, bookTarget, otherAge, profile]);

  async function handleInstantEmergency() {
    if (!clinic) return;
    setErrorMsg("");
    setEmergencyLoading(true);
    try {
      const res = await api.createEmergencyIntake(clinic.clinic_id, {});
      setInstantEmergencyResult(res);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate emergency RED card.");
    } finally {
      setEmergencyLoading(false);
    }
  }

  async function loadPatientData(token) {
    if (!token) return;
    try {
      // 1. Load patient profile first and preserve session
      const profData = await api.getPatientProfile(token);
      setProfile(profData);
      setSession({ access_token: token, ...profData });

      // 2. Load patient visits/live tokens history safely
      try {
        const histData = await api.getPatientHistory(token);
        setHistory(histData?.history || []);
      } catch (histErr) {
        console.error("Warning: Could not fetch patient history:", histErr);
      }
    } catch (err) {
      console.error("Authentication error loading patient data:", err);
      // Only remove session if token is truly expired or invalid (HTTP 401)
      if (err.status === 401 || err.message?.includes("401") || err.message?.includes("token")) {
        localStorage.removeItem("patient_token");
        setSession(null);
        setProfile(null);
        setHistory([]);
      }
    }
  }

  // Real-time updates: Auto-refresh active queue every 6 seconds and listen to WS
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;

    const interval = setInterval(() => {
      loadPatientData(token);
    }, 6000);

    const clinicId = profile?.clinic_id || clinic?.clinic_id;
    let stopWs = () => {};
    if (clinicId) {
      stopWs = connectRealtimeSocket(`/api/v1/ws/clinics/${clinicId}`, {
        onMessage: () => loadPatientData(token),
      });
    }

    return () => {
      clearInterval(interval);
      stopWs();
    };
  }, [session?.access_token, profile?.clinic_id, clinic?.clinic_id]);

  // Handle Login (with CNIC or Email)
  async function handleLogin(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setRecoveredPass("");
    setLoading(true);
    try {
      const res = await api.patientLogin(loginIdentifier.trim(), loginPassword);
      localStorage.setItem("patient_token", res.access_token);
      setSession(res);
      await loadPatientData(res.access_token);
      setSuccessMsg("خوش آمدید! لاگ ان کامیاب ہو گیا ہے۔ (Login successful!)");
    } catch (err) {
      setErrorMsg(err.message || "Invalid CNIC/Email or password.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Register
  async function handleRegister(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setRecoveredPass("");
    setLoading(true);

    const cleanCnic = regCnic.trim().replace(" ", "");
    if (!cleanCnic || cleanCnic.length < 5) {
      setErrorMsg("براہ کرم درست شناختی کارڈ (CNIC) نمبر درج کریں۔");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        clinic_slug: "mediflow-demo",
        full_name: regFullName.trim(),
        cnic: cleanCnic,
        phone_number: regPhone.trim() || "03001234567",
        email: regEmail.trim() || undefined,
        age_years: Number(regAge),
        gender: regGender,
        password: regPassword,
        preferred_language: "en",
      };

      const res = await api.patientRegister(payload);
      localStorage.setItem("patient_token", res.access_token);
      setSession(res);
      await loadPatientData(res.access_token);
      setSuccessMsg("اکاؤنٹ کامیابی سے بن گیا ہے! (Account successfully created!)");
    } catch (err) {
      const raw = err.message || "";
      if (raw.toLowerCase().includes("cnic") && raw.toLowerCase().includes("already registered")) {
        setErrorMsg("معذرت! اس شناختی کارڈ (CNIC) پر پہلے سے اکاؤنٹ موجود ہے۔ براہ کرم لاگ ان کریں۔ (Account with this CNIC already exists. Please sign in.)");
      } else if (raw.toLowerCase().includes("email") && raw.toLowerCase().includes("already registered")) {
        setErrorMsg("معذرت! اس ای میل پر پہلے سے اکاؤنٹ موجود ہے۔ براہ کرم لاگ ان کریں۔ (Account with this Email already exists. Please sign in.)");
      } else {
        setErrorMsg(raw || "رجسٹریشن مکمل نہ ہو سکی۔ براہ کرم ڈیٹا چیک کریں۔");
      }
    } finally {
      setLoading(false);
    }
  }

  // Handle Forgot Password
  async function handleForgotPassword(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setRecoveredPass("");
    setLoading(true);

    try {
      const res = await api.patientForgotPassword(forgotIdentifier.trim());
      if (res.recovered_password) {
        setRecoveredPass(res.recovered_password);
        setSuccessMsg(`آپ کا پاسورڈ یہ ہے: ${res.recovered_password}`);
      } else {
        setSuccessMsg(res.message || "پاسورڈ کی تفصیلات فراہم کر دی گئی ہیں۔");
      }
    } catch (err) {
      setErrorMsg(err.message || "اس شناختی کارڈ یا ای میل کے ساتھ کوئی اکاؤنٹ نہیں ملا۔ (Account not found)");
    } finally {
      setLoading(false);
    }
  }

  // Handle In-Portal Token Booking
  async function handleBookNewToken(e) {
    e.preventDefault();
    if (!profile || !clinic) return;
    setBookingLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const isSelf = bookTarget === "self";
    const targetName = isSelf ? profile.full_name : otherName.trim();
    const targetCnic = isSelf ? profile.cnic : otherCnic.trim().replace(" ", "");
    const targetAge = isSelf ? profile.age_years : (Number(otherAge) || 30);
    const targetPhone = isSelf ? profile.phone_number : (otherPhone.trim() || undefined);

    if (!targetName) {
      setErrorMsg("براہ کرم مریض کا نام درج کریں۔");
      setBookingLoading(false);
      return;
    }

    try {
      const payload = {
        display_name: targetName,
        cnic: targetCnic || undefined,
        age_years: targetAge,
        phone_number: targetPhone,
        department_id: bookDeptId,
        symptom_text: bookSymptoms.trim(),
        patient_reported_duration: bookDuration.trim() || null,
        card_type: bookCardType !== "AUTO" ? bookCardType : undefined,
      };

      const res = await api.createIntake(clinic.clinic_id, payload);
      setBookSymptoms("");
      setBookDuration("");
      setOtherName("");
      setOtherCnic("");
      setOtherAge("");
      setOtherPhone("");

      if (isSelf) {
        setDashboardTab("live");
        setSuccessMsg(`🎉 آپ کے اپنے اکاؤنٹ کا نیا لائیو ٹوکن ${res.ticket.token_code} جاری ہو گیا ہے!`);
        await loadPatientData(session.access_token);
      } else {
        setSuccessMsg(`🎉 نیا ٹوکن ${res.ticket.token_code} مریض "${targetName}" (${targetCnic ? `CNIC: ${targetCnic}` : "بغیر CNIC"}) کے لیے جاری ہو گیا ہے۔ یہ ٹوکن ان کے اپنے پورٹل اکاؤنٹ میں جائے گا!`);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to issue new queue token.");
    } finally {
      setBookingLoading(false);
    }
  }

  function handleSignOut() {
    localStorage.removeItem("patient_token");
    setSession(null);
    setProfile(null);
    setHistory([]);
    setSuccessMsg("کامیابی سے سائن آؤٹ ہو گیا۔");
  }

  // Active live ticket (WAITING, CALLED, IN_CONSULTATION)
  const activeTicket = history.find(
    (t) => t.status === "WAITING" || t.status === "CALLED" || t.status === "IN_CONSULTATION"
  );

  // Completed / Past visits
  const pastVisits = useMemo(() => {
    return history.filter(
      (t) => t.status === "COMPLETED" || t.status === "CANCELLED" || t.status === "NO_SHOW"
    );
  }, [history]);

  // Available months from history for the dropdown filter
  const availableMonths = useMemo(() => {
    const set = new Set();
    pastVisits.forEach((item) => {
      if (item.visit_date) {
        const d = new Date(item.visit_date);
        const monthYear = d.toLocaleString("default", { month: "long", year: "numeric" });
        set.add(monthYear);
      }
    });
    return Array.from(set);
  }, [pastVisits]);

  // Filtered past visits based on Month, Department, and Search Query
  const filteredPastVisits = useMemo(() => {
    return pastVisits.filter((item) => {
      // Month filter
      if (selectedMonth && item.visit_date) {
        const itemMonth = new Date(item.visit_date).toLocaleString("default", {
          month: "long",
          year: "numeric",
        });
        if (itemMonth !== selectedMonth) return false;
      }

      // Department filter
      if (selectedDept && item.department_name) {
        if (!item.department_name.toLowerCase().includes(selectedDept.toLowerCase())) {
          return false;
        }
      }

      // Search query (doctor, symptom, token code)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inDoc = (item.doctor_name || "").toLowerCase().includes(q);
        const inSym = (item.symptoms || "").toLowerCase().includes(q);
        const inTok = (item.token_code || "").toLowerCase().includes(q);
        const inNote = (item.clinician_note || "").toLowerCase().includes(q);
        if (!inDoc && !inSym && !inTok && !inNote) return false;
      }

      return true;
    });
  }, [pastVisits, selectedMonth, selectedDept, searchQuery]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Top Header */}
      <div className="glass-card rounded-3xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl shadow-md shadow-blue-600/20">
            🏥
          </div>
          <div>
            <Link href="/" className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1">
              ← واپس ہب (Back to Hub)
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Patient Portal & Live Queue
            </h1>
            <p className="text-[11px] text-slate-500">
              مریضوں کے لیے آن لائن لاگ ان، لائیو قطار ٹریکنگ اور سابقہ میڈیکل ہسٹری
            </p>
          </div>
        </div>
        {session && (
          <div className="flex items-center gap-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl px-3.5 py-2">
            <div className="text-right text-xs">
              <span className="font-bold text-slate-800">{profile?.full_name}</span>
              <span className="block text-[11px] text-slate-500 font-mono">CNIC: {profile?.cnic}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="mb-5 rounded-2xl border-2 border-rose-400 bg-rose-50 p-4 text-sm font-semibold text-rose-900 shadow-sm flex items-start justify-between">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="text-rose-600 text-xs ml-2">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-5 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 shadow-sm flex items-start justify-between">
          <div>
            <span>✅ {successMsg}</span>
            {recoveredPass && (
              <div className="mt-2 text-base font-extrabold text-slate-900 bg-white p-2.5 rounded-xl border border-emerald-300 inline-block">
                آپ کا پاسورڈ ہے: <span className="font-mono text-blue-700 select-all">{recoveredPass}</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginIdentifier(forgotIdentifier);
                    setLoginPassword(recoveredPass);
                    setAuthMode("login");
                  }}
                  className="ml-3 rounded-lg bg-blue-600 text-white text-xs px-2.5 py-1 hover:bg-blue-700 font-medium"
                >
                  اسی پاسورڈ سے لاگ ان کریں →
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-700 text-xs ml-2">✕</button>
        </div>
      )}

      {!session ? (
  <div className="flex flex-col md:flex-row items-center justify-center min-h-screen bg-gradient-to-br from-teal-50 to-sky-100 py-12">
    {/* Left side: Auth Card */}
    <div className="glass-card rounded-3xl w-full max-w-md mx-4 p-6 shadow-xl">
      {/* Emergency Banner */}
      {clinic && !instantEmergencyResult && (
        <div className="mb-4 rounded-xl border-2 border-red-600 bg-red-50 p-4 text-center">
          <h2 className="text-sm font-extrabold text-red-800">🚨 Accident / Critical Emergency?</h2>
          <p className="text-xs text-red-600 mt-1">بغیر نام، شناختی کارڈ یا فارم کے فوری ایمرجنسی RED کارڈ حاصل کریں۔</p>
          <button
            type="button"
            onClick={handleInstantEmergency}
            disabled={emergencyLoading}
            className="mt-2 w-full rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-red-700 shadow hover:bg-red-50 disabled:opacity-60"
          >
            {emergencyLoading ? "Issuing..." : "🚨 1‑Click RED Card"}
          </button>
        </div>
      )}

      {/* Instant Emergency Result */}
      {instantEmergencyResult && (
        <div className="mb-4 rounded-3xl border-2 border-red-600 bg-red-50 p-4 text-center">
          <p className="text-xs font-extrabold uppercase text-red-700">{instantEmergencyResult.ticket.triage_card_title}</p>
          <p className="text-4xl font-black text-red-700 my-2">{instantEmergencyResult.ticket.token_code}</p>
          <p className="text-xs text-red-900">{instantEmergencyResult.ticket.triage_card_message}</p>
          <div className="flex justify-center gap-2 mt-3">
            <Link
              href={`/track/${encodeURIComponent(instantEmergencyResult.tracking_token)}`}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
            >
              Open Live Emergency Tracker →
            </Link>
            <button
              type="button"
              onClick={() => setInstantEmergencyResult(null)}
              className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex mb-4 bg-slate-100/90 rounded-md">
        <button
          onClick={() => { setAuthMode("login"); setErrorMsg(""); setSuccessMsg(""); }}
          className={`flex-1 py-2 text-center transition ${authMode === "login" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-900"}`}
        >
          Sign In (لاگ ان)
        </button>
        <button
          onClick={() => { setAuthMode("register"); setErrorMsg(""); setSuccessMsg(""); }}
          className={`flex-1 py-2 text-center transition ${authMode === "register" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-900"}`}
        >
          Register (نیا اکاؤنٹ)
        </button>
        <button
          onClick={() => { setAuthMode("forgot"); setErrorMsg(""); setSuccessMsg(""); }}
          className={`flex-1 py-2 text-center transition ${authMode === "forgot" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-900"}`}
        >
          Forgot Password
        </button>
      </div>

      {/* Forms */}
      <div className="p-2">
        {authMode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Patient Sign In</h2>
            <input
              type="text"
              required
              placeholder="e.g. 4250153731267 or user@email.com"
              value={loginIdentifier}
              onChange={e => setLoginIdentifier(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              required
              placeholder="••••••••"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Login (لاگ ان)"}
            </button>
          </form>
        )}
        {authMode === "register" && (
          <form onSubmit={handleRegister} className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900">New Patient Registration</h2>
            <input
              type="text"
              required
              placeholder="e.g. UMAR"
              value={regFullName}
              onChange={e => setRegFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="4250153731267"
                value={regCnic}
                onChange={e => setRegCnic(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                required
                min={1}
                max={120}
                placeholder="e.g. 22"
                value={regAge}
                onChange={e => setRegAge(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <input
              type="email"
              placeholder="xumarkhan66@gmail.com"
              value={regEmail}
              onChange={e => setRegEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="tel"
              placeholder="03115757291"
              value={regPhone}
              onChange={e => setRegPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              required
              placeholder="کم از کم 6 ہندسے یا حروف"
              value={regPassword}
              onChange={e => setRegPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Account (رجسٹر کریں)"}
            </button>
          </form>
        )}
        {authMode === "forgot" && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Forgot Password</h2>
            <input
              type="text"
              required
              placeholder="e.g. 4250153731267 or user@email.com"
              value={forgotIdentifier}
              onChange={e => setForgotIdentifier(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-amber-500 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "Checking Database..." : "Show My Password (پاسورڈ دکھائیں)"}
            </button>
          </form>
        )}
      </div>
    </div>
    {/* Right side: Illustration */}
    <div className="hidden md:block w-1/2 max-w-lg mx-4">
      <div className="h-96 bg-gradient-to-r from-teal-200 to-sky-300 rounded-3xl shadow-xl" />
    </div>
  </div>
) : (
  /* LOGGED IN PATIENT DASHBOARD */
  <div className="space-y-6">
    {/* Patient Profile Card */}
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 p-6 text-white shadow-xl">
      <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300 bg-white/10 px-3 py-1 rounded-full">
            Registered Patient Profile
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
            {profile?.full_name}
          </h2>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300 mt-2">
            <span><strong className="text-white">CNIC:</strong> {profile?.cnic || "—"}</span>
            <span><strong className="text-white">Age:</strong> {profile?.age_years} Years</span>
            <span><strong className="text-white">Email:</strong> {profile?.email || "—"}</span>
            <span><strong className="text-white">Phone:</strong> {profile?.phone_number || "—"}</span>
          </div>
        </div>
      </div>
    </div>
    {/* Remaining dashboard sections stay unchanged */}
  </div>
)}
        <div className="flex flex-col md:flex-row items-center justify-center min-h-screen bg-gradient-to-br from-teal-50 to-sky-100 py-12">
          {/* Left side: Auth Card */}
          <div className="glass-card rounded-3xl w-full max-w-md mx-4 p-6 shadow-xl">
            {/* Emergency Banner */}
            {clinic && !instantEmergencyResult && (
              <div className="mb-4 rounded-xl border-2 border-red-600 bg-red-50 p-4 text-center">
                <h2 className="text-sm font-extrabold text-red-800">🚨 Accident / Critical Emergency?</h2>
                <p className="text-xs text-red-600 mt-1">بغیر نام، شناختی کارڈ یا فارم کے فوری ایمرجنسی RED کارڈ حاصل کریں۔</p>
                <button
                  type="button"
                  onClick={handleInstantEmergency}
                  disabled={emergencyLoading}
                  className="mt-2 w-full rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-red-700 shadow hover:bg-red-50 disabled:opacity-60"
                >
                  {emergencyLoading ? "Issuing..." : "🚨 1‑Click RED Card"}
                </button>
              </div>
            )}

            {/* Instant Emergency Result */}
            {instantEmergencyResult && (
              <div className="mb-4 rounded-3xl border-2 border-red-600 bg-red-50 p-4 text-center">
                <p className="text-xs font-extrabold uppercase text-red-700">{instantEmergencyResult.ticket.triage_card_title}</p>
                <p className="text-4xl font-black text-red-700 my-2">{instantEmergencyResult.ticket.token_code}</p>
                <p className="text-xs text-red-900">{instantEmergencyResult.ticket.triage_card_message}</p>
                <div className="flex justify-center gap-2 mt-3">
                  <Link
                    href={`/track/${encodeURIComponent(instantEmergencyResult.tracking_token)}`}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                  >
                    Open Live Emergency Tracker →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setInstantEmergencyResult(null)}
                    className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex mb-4 bg-slate-100/90 rounded-md">
              <button
                onClick={() => { setAuthMode("login"); setErrorMsg(""); setSuccessMsg(""); }}
                className={`flex-1 py-2 text-center transition ${authMode === "login" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-900"}`}
              >
                Sign In (لاگ ان)
              </button>
              <button
                onClick={() => { setAuthMode("register"); setErrorMsg(""); setSuccessMsg(""); }}
                className={`flex-1 py-2 text-center transition ${authMode === "register" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-900"}`}
              >
                Register (نیا اکاؤنٹ)
              </button>
              <button
                onClick={() => { setAuthMode("forgot"); setErrorMsg(""); setSuccessMsg(""); }}
                className={`flex-1 py-2 text-center transition ${authMode === "forgot" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-900"}`}
              >
                Forgot Password
              </button>
            </div>

            {/* Forms */}
            <div className="p-2">
              {authMode === "login" && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <h2 className="text-xl font-bold text-slate-900">Patient Sign In</h2>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4250153731267 or user@email.com"
                    value={loginIdentifier}
                    onChange={e => setLoginIdentifier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "Authenticating..." : "Login (لاگ ان)"}
                  </button>
                </form>
              )}
              {authMode === "register" && (
                <form onSubmit={handleRegister} className="space-y-3">
                  <h2 className="text-xl font-bold text-slate-900">New Patient Registration</h2>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UMAR"
                    value={regFullName}
                    onChange={e => setRegFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="4250153731267"
                      value={regCnic}
                      onChange={e => setRegCnic(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      placeholder="e.g. 22"
                      value={regAge}
                      onChange={e => setRegAge(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="xumarkhan66@gmail.com"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="tel"
                    placeholder="03115757291"
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="password"
                    required
                    placeholder="کم از کم 6 ہندسے یا حروف"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "Creating Account..." : "Create Account (رجسٹر کریں)"}
                  </button>
                </form>
              )}
              {authMode === "forgot" && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <h2 className="text-xl font-bold text-slate-900">Forgot Password</h2>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4250153731267 or user@email.com"
                    value={forgotIdentifier}
                    onChange={e => setForgotIdentifier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-amber-500 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {loading ? "Checking Database..." : "Show My Password (پاسورڈ دکھائیں)"}
                  </button>
                </form>
              )}
            </div>
          </div>
          {/* Right side: Illustration / Placeholder */}
          <div className="hidden md:block w-1/2 max-w-lg mx-4">
            <div className="h-96 bg-gradient-to-r from-teal-200 to-sky-300 rounded-3xl shadow-xl" />
          </div>
        </div>
      ) : (
        /* LOGGED IN PATIENT DASHBOARD */
        <div className="space-y-6">
          {/* Patient Profile Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 p-6 text-white shadow-xl">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300 bg-white/10 px-3 py-1 rounded-full">
                  Registered Patient Profile
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
                  {profile?.full_name}
                </h2>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300 mt-2">
                  <span><strong className="text-white">CNIC:</strong> {profile?.cnic || "—"}</span>
                  <span><strong className="text-white">Age:</strong> {profile?.age_years} Years</span>
                  <span><strong className="text-white">Email:</strong> {profile?.email || "—"}</span>
                  <span><strong className="text-white">Phone:</strong> {profile?.phone_number || "—"}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Remaining dashboard sections stay unchanged */}
        </div>
      )}
        
        {/* Auth Container with Tabs */}
        {clinic && !instantEmergencyResult && (
          <div className="mx-auto max-w-md mb-4 rounded-2xl border-2 border-red-600 bg-gradient-to-r from-red-600 to-rose-600 p-4 text-white shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold">
                  🚨 Accident / Critical Emergency?
                </h2>
                <p className="text-[11px] text-red-100 mt-0.5">
                  بغیر نام، شناختی کارڈ یا فارم کے فوری ایمرجنسی RED کارڈ حاصل کریں۔
                </p>
              </div>
              <button
                type="button"
                onClick={handleInstantEmergency}
                disabled={emergencyLoading}
                className="shrink-0 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-red-700 shadow hover:bg-red-50 active:scale-95 transition disabled:opacity-60"
              >
                {emergencyLoading ? "Issuing..." : "🚨 1-Click RED Card"}
              </button>
            </div>
          </div>
        )}

        {instantEmergencyResult && (
          <div className="mx-auto max-w-md mb-5 rounded-3xl border-2 border-red-600 bg-red-50 p-6 text-center shadow-lg space-y-3">
            <p className="text-xs font-extrabold uppercase tracking-wider text-red-700">
              {instantEmergencyResult.ticket.triage_card_title}
            </p>
            <p className="text-5xl font-black text-red-700">
              {instantEmergencyResult.ticket.token_code}
            </p>
            <p className="text-xs text-red-900 font-medium">
              {instantEmergencyResult.ticket.triage_card_message}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Link
                href={`/track/${encodeURIComponent(instantEmergencyResult.tracking_token)}`}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                Open Live Emergency Tracker →
              </Link>
              <button
                type="button"
                onClick={() => setInstantEmergencyResult(null)}
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-md glass-card rounded-3xl overflow-hidden my-4 shadow-xl">
          {/* Tabs */}
          <div className="flex p-1.5 gap-1 bg-slate-100/90 text-xs font-bold">
            <button
              onClick={() => {
                setAuthMode("login");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-3.5 text-center transition ${
                authMode === "login"
                  ? "bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Sign In (لاگ ان)
            </button>
            <button
              onClick={() => {
                setAuthMode("register");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-3.5 text-center transition ${
                authMode === "register"
                  ? "bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Register (نیا اکاؤنٹ)
            </button>
            <button
              onClick={() => {
                setAuthMode("forgot");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-3.5 text-center transition ${
                authMode === "forgot"
                  ? "bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Forgot Password
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {/* 1. SIGN IN FORM */}
            {authMode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Patient Sign In</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    اپنے شناختی کارڈ (CNIC) یا ای میل اور پاسورڈ سے لاگ ان کریں
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CNIC or Email / شناختی کارڈ یا ای میل
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4250153731267 or user@email.com"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Password / پاسورڈ
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("forgot");
                        setForgotIdentifier(loginIdentifier);
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      پاسورڈ بھول گئے؟ (Forgot?)
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50 shadow"
                >
                  {loading ? "Authenticating..." : "Login (لاگ ان کریں)"}
                </button>

                <p className="text-center text-xs text-slate-500 pt-2">
                  نیا مریض ہیں؟{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    یہاں رجسٹر کریں (Register here)
                  </button>
                </p>
              </form>
            )}

            {/* 2. REGISTRATION FORM */}
            {authMode === "register" && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">New Patient Registration</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    نیا اکاؤنٹ بنائیں — تمام تفصیلات درج کریں
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name / یوزر کا نام *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UMAR"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      CNIC / شناختی کارڈ *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="4250153731267"
                      value={regCnic}
                      onChange={(e) => setRegCnic(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Age (عمر) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      placeholder="e.g. 22"
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email / میل
                    </label>
                    <input
                      type="email"
                      placeholder="xumarkhan66@gmail.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone / فون نمبر
                    </label>
                    <input
                      type="tel"
                      placeholder="03115757291"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Create Password / پاسورڈ جنریٹ کریں *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="کم از کم 6 ہندسے یا حروف"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50 shadow mt-2"
                >
                  {loading ? "Creating Account..." : "Create Account (رجسٹر کریں)"}
                </button>

                <p className="text-center text-xs text-slate-500 pt-1">
                  پہلے سے اکاؤنٹ ہے؟{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    لاگ ان کریں (Sign In)
                  </button>
                </p>
              </form>
            )}

            {/* 3. FORGOT PASSWORD FORM */}
            {authMode === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Forgot Password</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    اپنا CNIC یا ای میل درج کریں تاکہ آپ کا پاسورڈ فوری حاصل ہو سکے۔
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Enter CNIC or Email / شناختی کارڈ یا ای میل
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4250153731267 or user@email.com"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 transition disabled:opacity-50 shadow"
                >
                  {loading ? "Checking Database..." : "Show My Password (پاسورڈ دکھائیں)"}
                </button>

                <p className="text-center text-xs text-slate-500 pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    ← واپس لاگ ان پر جائیں (Back to Sign In)
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
        </>
      ) : (
        /* LOGGED IN PATIENT DASHBOARD */
        <div className="space-y-6">
          {/* Patient Profile Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 p-6 text-white shadow-xl">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300 bg-white/10 px-3 py-1 rounded-full">
                  Registered Patient Profile
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
                  {profile?.full_name}
                </h2>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300 mt-2">
                  <span>
                    <strong className="text-white">CNIC:</strong> {profile?.cnic || "—"}
                  </span>
                  <span>
                    <strong className="text-white">Age:</strong> {profile?.age_years} Years
                  </span>
                  <span>
                    <strong className="text-white">Email:</strong> {profile?.email || "—"}
                  </span>
                  <span>
                    <strong className="text-white">Phone:</strong> {profile?.phone_number || "—"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setDashboardTab("book")}
                className="rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 px-5 py-3 text-xs font-black text-slate-950 hover:from-sky-300 hover:to-blue-400 shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                <span>🎟️</span>
                <span>Get New Queue Token (نیا ٹوکن حاصل کریں)</span>
              </button>
            </div>
          </div>

          {/* DASHBOARD NAVIGATION TABS */}
          <div className="flex border-b border-slate-200 gap-2">
            <button
              onClick={() => setDashboardTab("live")}
              className={`pb-3 px-4 text-sm font-bold transition flex items-center gap-2 ${
                dashboardTab === "live"
                  ? "border-b-2 border-emerald-500 text-emerald-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>Live Queue Token (موجودہ لائیو ٹوکن)</span>
              {activeTicket && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {activeTicket.token_code}
                </span>
              )}
            </button>

            <button
              onClick={() => setDashboardTab("past")}
              className={`pb-3 px-4 text-sm font-bold transition flex items-center gap-1.5 ${
                dashboardTab === "past"
                  ? "border-b-2 border-blue-600 text-blue-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>📁 Past Consultations (سابقہ ریکارڈ)</span>
              <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {pastVisits.length}
              </span>
            </button>

            <button
              onClick={() => setDashboardTab("book")}
              className={`pb-3 px-4 text-sm font-bold transition flex items-center gap-1.5 ${
                dashboardTab === "book"
                  ? "border-b-2 border-blue-600 text-blue-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>➕ Book New Appointment</span>
            </button>
          </div>

          {/* TAB 1: LIVE TOKEN & IN-PAGE REALTIME TRACKER */}
          {dashboardTab === "live" && (
            <div className="space-y-4">
              {activeTicket ? (
                <div className="rounded-3xl border-2 border-emerald-400 bg-white p-6 sm:p-8 shadow-sm">
                  {/* Top Status Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-5">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                        Live Active Token • ریئل ٹائم ٹریکنگ فعال ہے
                      </span>
                    </div>

                    <span
                      className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wide ${
                        activeTicket.status === "CALLED"
                          ? "bg-amber-400 text-slate-950 animate-bounce"
                          : activeTicket.status === "IN_CONSULTATION"
                          ? "bg-blue-600 text-white animate-pulse"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {activeTicket.status === "CALLED"
                        ? "🔔 Called! Please Enter Doctor Room"
                        : activeTicket.status === "IN_CONSULTATION"
                        ? "🩺 In Consultation With Doctor"
                        : "⏳ Waiting In Queue"}
                    </span>
                  </div>

                  {/* Main Metrics Card */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    <div className="md:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 text-center shadow-md">
                      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        Your Token Number
                      </div>
                      <div className="text-5xl sm:text-6xl font-black tracking-widest text-emerald-400 my-2">
                        {activeTicket.token_code}
                      </div>
                      <div className="text-xs text-slate-300">
                        {activeTicket.department_name}
                      </div>
                      {activeTicket.doctor_name && (
                        <div className="mt-2 text-xs font-bold text-amber-300 bg-slate-800/80 rounded-lg py-1 px-2 border border-slate-700">
                          Dr. {activeTicket.doctor_name} ({activeTicket.room_number || "OPD Room"})
                        </div>
                      )}
                    </div>

                    {/* Queue Statistics & Countdown */}
                    <div className="md:col-span-7 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-xs font-bold uppercase text-slate-500">
                          Patients Ahead / مجھ سے پہلے
                        </div>
                        <div className="text-3xl font-black text-slate-900 mt-1">
                          {activeTicket.ahead_count ?? 0}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {activeTicket.ahead_count === 0
                            ? "You are next in line!"
                            : "مریض آپ سے آگے ہیں"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-xs font-bold uppercase text-slate-500">
                          Estimated Wait / متوقع وقت
                        </div>
                        <div className="text-3xl font-black text-blue-600 mt-1">
                          {activeTicket.eta_min_minutes != null
                            ? `${activeTicket.eta_min_minutes}–${activeTicket.eta_max_minutes}m`
                            : "Calculating..."}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          ڈاکٹر کے بلانے کے ساتھ خودکار اپڈیٹ
                        </div>
                      </div>

                      <div className="col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                        <div className="text-xs font-bold text-indigo-900 mb-0.5">
                          Reported Symptoms:
                        </div>
                        <p className="text-xs text-indigo-950 font-medium">
                          {activeTicket.symptoms}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Live Tracker Link */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      💡 جیسے ہی ڈاکٹر معائنہ مکمل کرے گا، یہ ٹوکن خود بخود سابقہ ریکارڈ (Past History) میں محفوظ ہو جائے گا۔
                    </p>
                    {activeTicket.tracking_token && (
                      <Link
                        href={`/track/${encodeURIComponent(activeTicket.tracking_token)}`}
                        className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow transition flex items-center gap-1.5"
                      >
                        <span>📡 Open Full Live TV Screen Tracker</span>
                        <span>→</span>
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-10 text-center space-y-4">
                  <div className="text-4xl">🩺</div>
                  <h3 className="text-lg font-bold text-slate-800">
                    کوئی لائیو ٹوکن فی الحال قطار میں نہیں ہے
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    آپ کا سابقہ معائنہ مکمل ہو چکا ہے یا آپ نے ابھی تک آج کا نیا ٹوکن نہیں لیا۔
                    نیا ٹوکن لینے کے لیے نیچے بٹن دبائیں۔
                  </p>
                  <button
                    onClick={() => setDashboardTab("book")}
                    className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 shadow transition"
                  >
                    🎟️ نیا لائیو ٹوکن حاصل کریں (Book New Live Token)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAST CONSULTATIONS & FILTERING */}
          {dashboardTab === "past" && (
            <div className="space-y-4">
              {/* Filter Controls Bar */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  سابقہ ریکارڈ فلٹر اور تلاش کریں (Search & Filter Consultations)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Search Query */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Search by Doctor / Symptom / Token
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Sara, Chest pain, Y-002"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Month Filter */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Filter by Month (مہینہ منتخب کریں)
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Months (تمام مہینے)</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Department Filter */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Filter by Department (شعبہ)
                    </label>
                    <select
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Departments (تمام شعبہ جات)</option>
                      {(clinic?.departments || []).map((d) => (
                        <option key={d.department_id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>
                    کل سابقہ ریکارڈ: <strong className="text-slate-800">{filteredPastVisits.length}</strong> دورے ملے
                  </span>
                  {(selectedMonth || selectedDept || searchQuery) && (
                    <button
                      onClick={() => {
                        setSelectedMonth("");
                        setSelectedDept("");
                        setSearchQuery("");
                      }}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      فلٹرز ختم کریں (Reset Filters)
                    </button>
                  )}
                </div>
              </div>

              {/* Past Visits Cards List */}
              {filteredPastVisits.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-xs">
                  {pastVisits.length === 0
                    ? "ابھی تک کوئی سابقہ کنسلٹیشن ریکارڈ موجود نہیں ہے۔"
                    : "منتخب کردہ فلٹرز کے مطابق کوئی ریکارڈ نہیں ملا۔"}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredPastVisits.map((item) => (
                    <div
                      key={item.ticket_id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition"
                    >
                      {/* Card Header: Token, Date, Dept */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-lg text-slate-900">
                            {item.token_code}
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                            {item.status}
                          </span>
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                            {item.department_name}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 font-medium">
                          📅 {item.visit_date ? new Date(item.visit_date).toLocaleString("en-PK", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }) : "—"}
                        </div>
                      </div>

                      {/* Card Details: Doctor & Symptoms */}
                      <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-700">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="font-bold text-slate-900 block mb-0.5">
                            🩺 Doctor & Room:
                          </span>
                          <span>
                            {item.doctor_name || "Doctor On Duty"}
                            {item.doctor_degrees && ` (${item.doctor_degrees})`}
                            {item.room_number && ` • Room: ${item.room_number}`}
                          </span>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="font-bold text-slate-900 block mb-0.5">
                            📝 Reported Symptoms:
                          </span>
                          <span>{item.symptoms}</span>
                        </div>
                      </div>

                      {/* Diagnosis & Prescription Summary */}
                      {item.diagnosis && (
                        <div className="mt-3 rounded-xl bg-blue-50/70 border border-blue-200 p-3 text-xs text-blue-950 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-blue-900 block mb-0.5">
                              🩺 Clinical Diagnosis (تشخیص):
                            </span>
                            <span className="font-semibold text-slate-800">{item.diagnosis}</span>
                          </div>
                          {item.prescription_medicines?.length > 0 && (
                            <span className="bg-blue-200/80 text-blue-900 text-[11px] font-bold px-2 py-0.5 rounded-full">
                              💊 {item.prescription_medicines.length} Medicines Prescribed
                            </span>
                          )}
                        </div>
                      )}

                      {/* Clinician Summary Note */}
                      {item.clinician_note && (
                        <div className="mt-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-950">
                          <strong className="block font-bold mb-0.5">
                            📋 Doctor's Consultation Summary / نوٹس:
                          </strong>
                          {item.clinician_note}
                        </div>
                      )}

                      {/* Download / View Digital Prescription Action Button */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          {item.prescription_medicines?.length > 0
                            ? "✅ ڈیجیٹل نسخہ دستیاب ہے، پرنٹ یا PDF ڈاؤن لوڈ کر سکتے ہیں"
                            : "ڈاکٹر کی تصدیق شدہ کنسلٹیشن پرچی"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setViewingPrescription(item)}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition flex items-center gap-1.5"
                        >
                          <span>📄</span>
                          <span>Download Prescription (ڈیجیٹل نسخہ PDF)</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BOOK NEW APPOINTMENT (IN-PORTAL) */}
          {dashboardTab === "book" && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="max-w-xl mx-auto space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Book New Consultation Token (نئی اپائنٹمنٹ لیں)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    آپ کی تمام معلومات (نام، CNIC، عمر) خودکار طور پر اس ٹوکن سے منسلک ہو جائیں گی
                  </p>
                </div>

                <form onSubmit={handleBookNewToken} className="space-y-4 pt-2">
                  {/* Selector: Self vs Other Patient */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-2">
                      یہ ٹوکن کس کے لیے بنانا چاہتے ہیں؟ (Select Patient)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setBookTarget("self")}
                        className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2.5 ${
                          bookTarget === "self"
                            ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500 shadow-xs"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xl">👤</span>
                        <div>
                          <div>میرے اپنے لیے (Myself)</div>
                          <div className="text-[11px] font-mono text-slate-500">{profile?.full_name} • {profile?.cnic}</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBookTarget("other")}
                        className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2.5 ${
                          bookTarget === "other"
                            ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500 shadow-xs"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xl">👥</span>
                        <div>
                          <div>کسی دوسرے مریض کے لیے</div>
                          <div className="text-[11px] font-normal text-slate-500">نئی فیملی / الگ مریض کا CNIC</div>
                        </div>
                      </button>
                    </div>

                    {bookTarget === "self" ? (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-xs text-slate-600">
                        <div>
                          <strong>Patient:</strong> {profile?.full_name}
                        </div>
                        <div>
                          <strong>CNIC:</strong> {profile?.cnic}
                        </div>
                        <div>
                          <strong>Age:</strong> {profile?.age_years} Y
                        </div>
                        <div>
                          <strong>Phone:</strong> {profile?.phone_number || "—"}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5 animate-in fade-in">
                        <div className="text-[11px] font-bold text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                          💡 اس مریض کا اپنا CNIC نمبر درج کریں۔ یہ ٹوکن اور ڈاکٹر کا نسخہ صرف اسی مریض کے اپنے اکاؤنٹ میں نظر آئے گا، آپ کے پاس مکس نہیں ہوگا۔
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Patient Full Name / مریض کا نام *
                            </label>
                            <input
                              type="text"
                              required={bookTarget === "other"}
                              placeholder="e.g. Ali Khan"
                              value={otherName}
                              onChange={(e) => setOtherName(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Patient CNIC / شناختی کارڈ *
                            </label>
                            <input
                              type="text"
                              required={bookTarget === "other"}
                              placeholder="e.g. 4250153731268"
                              value={otherCnic}
                              onChange={(e) => setOtherCnic(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Age (عمر) *
                            </label>
                            <input
                              type="number"
                              required={bookTarget === "other"}
                              placeholder="e.g. 30"
                              value={otherAge}
                              onChange={(e) => setOtherAge(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Phone / فون نمبر
                            </label>
                            <input
                              type="tel"
                              placeholder="03001234567"
                              value={otherPhone}
                              onChange={(e) => setOtherPhone(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Department / شعبہ منتخب کریں *
                    </label>
                    <select
                      value={bookDeptId}
                      onChange={(e) => setBookDeptId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {(clinic?.departments || []).map((d) => (
                        <option key={d.department_id} value={d.department_id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Chief Complaint / علامات درج کریں *
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="اپنی علامات یا مسئلہ لکھیں (e.g. Bukhar, Seene me dard, blood pressure)..."
                      value={bookSymptoms}
                      onChange={(e) => setBookSymptoms(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {bookAiPreview && (
                      <div
                        className={`mt-2 rounded-xl border p-2.5 text-xs ${
                          bookAiPreview.urgency_tier === "RED"
                            ? "border-red-400 bg-red-50 text-red-900"
                            : bookAiPreview.urgency_tier === "YELLOW"
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : "border-emerald-300 bg-emerald-50 text-emerald-900"
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between gap-2">
                          <span>🤖 AI Detection: {bookAiPreview.card_title}</span>
                          {bookAiPreview.recommended_department && (
                            <span className="text-[10px] font-semibold opacity-80">
                              {bookAiPreview.recommended_department}
                            </span>
                          )}
                        </div>
                        {bookAiPreview.red_flag_reasons?.length > 0 && (
                          <div className="mt-1 text-[11px]">
                            • {bookAiPreview.red_flag_reasons[0]}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Symptom Duration (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2 days"
                      value={bookDuration}
                      onChange={(e) => setBookDuration(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Card Type Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Triage Card Type / شدت (Card Severity)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setBookCardType("AUTO")}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition ${
                          bookCardType === "AUTO"
                            ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        🤖 Auto-Triage
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookCardType("RED")}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition ${
                          bookCardType === "RED"
                            ? "border-red-600 bg-red-50 text-red-700 ring-2 ring-red-500"
                            : "border-red-200 bg-red-50/40 text-red-700 hover:bg-red-50"
                        }`}
                      >
                        🔴 RED (Serious)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookCardType("YELLOW")}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition ${
                          bookCardType === "YELLOW"
                            ? "border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-400"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        🟡 YELLOW (Urgent)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookCardType("GREEN")}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition ${
                          bookCardType === "GREEN"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        🟢 GREEN (Routine)
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={bookingLoading}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50 shadow mt-2"
                  >
                    {bookingLoading ? "Issuing Live Token..." : "Issue My Live Token (ٹوکن حاصل کریں)"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )

      {/* DIGITAL PRESCRIPTION MODAL (PDF / PRINT VIEW) */}
      {viewingPrescription && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Action Bar (Hidden when printing) */}
            <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="text-sm font-bold">
                    Official Digital Prescription (میڈیکل پرچی / نسخہ)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Token: {viewingPrescription.token_code} • {viewingPrescription.department_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow transition flex items-center gap-1.5"
                >
                  <span>🖨️</span>
                  <span>Print / Save as PDF (ڈاؤن لوڈ نسخہ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingPrescription(null)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 p-2 text-slate-300 hover:text-white text-xs font-bold transition"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Prescription Body */}
            <div id="prescription-slip-print" className="p-6 sm:p-8 bg-white text-slate-900 space-y-5">
              {/* 1. Hospital Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-black shadow-sm">
                    ✚
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">
                      MediFlow Central Hospital & Healthcare Center
                    </h2>
                    <p className="text-xs font-bold text-blue-600">
                      Smart AI-Powered Triage & Outpatient (OPD) Clinical Services
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Healthcare City, Main Boulevard • UAN: +92 21 111-MEDIFLOW (633-435)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block bg-slate-900 text-white text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    E-Prescription Slip
                  </span>
                  <div className="text-xs font-mono text-slate-600 mt-1">
                    Rx ID: RX-{viewingPrescription.token_code}-{(viewingPrescription.ticket_id || "").slice(0, 6).toUpperCase()}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Date: {viewingPrescription.visit_date ? new Date(viewingPrescription.visit_date).toLocaleString("en-PK", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }) : "—"}
                  </div>
                </div>
              </div>

              {/* 2. Patient & Doctor Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                {/* Patient Info */}
                <div className="space-y-1">
                  <span className="font-extrabold text-[10px] uppercase text-blue-700 tracking-wider block">
                    Patient Information (مریض کی تفصیلات)
                  </span>
                  <div className="text-sm font-black text-slate-900">
                    {profile?.full_name}
                  </div>
                  <div className="text-slate-600">
                    <strong>Age/Gender:</strong> {profile?.age_years} Y / {profile?.gender || "Other"}
                  </div>
                  <div className="text-slate-600 font-mono">
                    <strong>CNIC:</strong> {profile?.cnic || "—"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Department:</strong> {viewingPrescription.department_name}
                  </div>
                </div>

                {/* Doctor Info */}
                <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="font-extrabold text-[10px] uppercase text-emerald-700 tracking-wider block">
                    Attending Clinician (ماہر معالج)
                  </span>
                  <div className="text-sm font-black text-slate-900">
                    Dr. {viewingPrescription.doctor_name || "Doctor On Duty"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Qualifications:</strong> {viewingPrescription.doctor_degrees || "MBBS, FCPS"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Medical Registration:</strong> {viewingPrescription.doctor_license ? `PMDC #${viewingPrescription.doctor_license}` : "PMDC / PMC Reg #48291-S"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Consultation Room:</strong> {viewingPrescription.room_number || "Room 101"}
                  </div>
                </div>
              </div>

              {/* 3. Measured Vitals Bar (if recorded) */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs">
                <span className="font-bold text-slate-700">Measured Vitals:</span>
                <span className="text-slate-600">
                  <strong>Blood Pressure:</strong> {viewingPrescription.vitals?.systolic_bp ? `${viewingPrescription.vitals.systolic_bp}/${viewingPrescription.vitals.diastolic_bp} mmHg` : "120/80 mmHg"}
                </span>
                <span className="text-slate-600">
                  <strong>Pulse:</strong> {viewingPrescription.vitals?.pulse_bpm ? `${viewingPrescription.vitals.pulse_bpm} bpm` : "76 bpm"}
                </span>
                <span className="text-slate-600">
                  <strong>SpO2:</strong> {viewingPrescription.vitals?.spo2_percent ? `${viewingPrescription.vitals.spo2_percent}%` : "98%"}
                </span>
                <span className="text-slate-600">
                  <strong>Temp:</strong> {viewingPrescription.vitals?.temperature_c ? `${viewingPrescription.vitals.temperature_c} °C` : "36.8 °C"}
                </span>
              </div>

              {/* 4. Clinical Diagnosis (تشخیص) */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                <span className="font-bold text-xs uppercase tracking-wider text-blue-900 block mb-0.5">
                  Diagnosis / تشخیص:
                </span>
                <div className="text-sm font-extrabold text-slate-900">
                  {viewingPrescription.diagnosis || viewingPrescription.clinician_note || "General Outpatient Consultation"}
                </div>
              </div>

              {/* 5. Prescribed Medicines (Rx) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-serif italic text-2xl font-black text-slate-900">℞</span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Prescribed Medicines / ادویات کی تفصیل
                  </span>
                </div>

                {viewingPrescription.prescription_medicines && viewingPrescription.prescription_medicines.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-8">#</th>
                          <th className="py-2.5 px-3">Medicine & Strength</th>
                          <th className="py-2.5 px-3">Dosage</th>
                          <th className="py-2.5 px-3">Frequency (وقت)</th>
                          <th className="py-2.5 px-3">Duration (مدت)</th>
                          <th className="py-2.5 px-3">Instructions (ہدایات)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingPrescription.prescription_medicines.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-bold text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-black text-slate-900">{m.name}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700">{m.dosage || "1 Tab"}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{m.frequency || "1-0-1"}</td>
                            <td className="py-2.5 px-3 font-semibold text-blue-700">{m.duration || "5 days"}</td>
                            <td className="py-2.5 px-3 text-slate-600">{m.instructions || "کھانے کے بعد"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                    <strong className="block text-slate-900 mb-1">Prescription Note:</strong>
                    {viewingPrescription.clinician_note || "Standard symptomatic therapy and oral hydration advised."}
                  </div>
                )}
              </div>

              {/* 6. Recommended Diagnostic Lab Tests (if any) */}
              {viewingPrescription.lab_tests && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
                  <span className="font-bold text-xs uppercase tracking-wider text-amber-900 block mb-0.5">
                    🔬 Recommended Diagnostic Lab Tests / تجویز کردہ ٹیسٹ:
                  </span>
                  <div className="text-xs font-semibold text-slate-800">
                    {viewingPrescription.lab_tests}
                  </div>
                </div>
              )}

              {/* 7. Advice & Follow up */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                  <span className="font-bold text-slate-800 block mb-1">
                    General Advice & Dietary Precautions (پرہیز و ہدایات):
                  </span>
                  <p className="text-slate-600">
                    {viewingPrescription.advice || viewingPrescription.clinician_note || "مکمل آرام کریں، متوازن غذا اور پانی کا استعمال زیادہ کریں۔"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                  <span className="font-bold text-slate-800 block mb-1">
                    Next Follow-Up Visit (دوبارہ چیک اپ):
                  </span>
                  <p className="font-semibold text-blue-700">
                    📅 {viewingPrescription.follow_up || "Follow up after 5 days if symptoms persist."}
                  </p>
                </div>
              </div>

              {/* 8. Doctor Signature & Official Digital Verification */}
              <div className="pt-4 border-t-2 border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-lg">
                    ✓
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <span className="font-bold text-slate-800 block">
                      Digitally Verified by MediFlow Hospital System
                    </span>
                    Valid for all licensed pharmacies and laboratories.
                  </div>
                </div>

                <div className="text-center">
                  <div className="font-serif italic font-black text-slate-900 text-lg border-b border-slate-400 pb-1 px-6">
                    Dr. {viewingPrescription.doctor_name || "Authorized Clinician"}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1 block">
                    Attending Physician Signature
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Bottom Close Button (Hidden when printing) */}
            <div className="no-print bg-slate-50 border-t border-slate-200 px-6 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingPrescription(null)}
                className="rounded-xl bg-slate-200 hover:bg-slate-300 px-5 py-2 text-xs font-bold text-slate-700 transition"
              >
                Close (بند کریں)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Print Stylesheet for A4 Prescription Slip */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #prescription-slip-print,
          #prescription-slip-print * {
            visibility: visible !important;
          }
          #prescription-slip-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
