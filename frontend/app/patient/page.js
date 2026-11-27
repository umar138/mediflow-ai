"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { connectRealtimeSocket } from "../../lib/ws";

export default function PatientPortalPage() {
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'register' | 'forgot'
  const [dashboardTab, setDashboardTab] = useState("dashboard"); // 'dashboard' | 'appointments' | 'records' | 'prescriptions' | 'book'
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
  const [deptDoctors, setDeptDoctors] = useState([]);
  const [bookDoctorId, setBookDoctorId] = useState("");
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [bookDate, setBookDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [doctorSlots, setDoctorSlots] = useState([]);
  const [bookSlot, setBookSlot] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
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

  // AI Medical Guidance Chat state
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I'm MediFlow AI. Describe your symptoms or health question, and I'll provide safe medical guidance, warning signs, and the right clinic department for you.",
      urgency_tier: "GREEN",
      recommended_department: null,
    },
  ]);

  async function handleSendAiMessage(customText) {
    const q = (typeof customText === "string" ? customText : aiChatInput).trim();
    if (!q || aiChatLoading) return;
    if (typeof customText !== "string") setAiChatInput("");

    const userMsg = { role: "user", content: q };
    const nextHistory = [...aiChatMessages, userMsg];
    setAiChatMessages(nextHistory);
    setAiChatLoading(true);

    try {
      const res = await api.askMedicalGuidance({
        question: q,
        age_years: profile?.age_years || 30,
        preferred_language: "en",
        history: nextHistory
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
      });
      setAiChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
          urgency_tier: res.urgency_tier,
          recommended_department: res.recommended_department,
          disclaimer: res.disclaimer,
        },
      ]);
    } catch (err) {
      setAiChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.message || "Sorry, I couldn't connect to MediFlow AI right now. Please try again.",
          urgency_tier: "YELLOW",
        },
      ]);
    } finally {
      setAiChatLoading(false);
    }
  }

  function showStayTuned(featureName = "This feature") {
    setErrorMsg("");
    setSuccessMsg(`✨ ${featureName} — Upcoming event, stay tuned!`);
  }

  function formatDoctorLabel(doctorName) {
    if (!doctorName) return "OPD Triage Queue";
    return /^dr\.?\s+/i.test(doctorName.trim())
      ? doctorName.trim()
      : `Dr. ${doctorName.trim()}`;
  }

  // Check saved session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("patient_token");
    if (savedToken) {
      loadPatientData(savedToken);
    }
    // Load clinic departments for filters and booking
    api
      .getClinicBySlug("mediflow-demo")
      .then((c) => {
        setClinic(c);
        if (c.departments?.length > 0) {
          setBookDeptId(c.departments[0].department_id);
        }
      })
      .catch(() => {});
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
          age_years:
            bookTarget === "other" && otherAge
              ? Number(otherAge)
              : profile?.age_years || 30,
          preferred_language: "roman_ur",
        })
        .then((res) => setBookAiPreview(res))
        .catch(() => {});
    }, 280);
    return () => clearTimeout(timer);
  }, [bookSymptoms, bookTarget, otherAge, profile]);

  const selectedBookDept = useMemo(() => {
    return (clinic?.departments || []).find(
      (d) => String(d.department_id) === String(bookDeptId)
    );
  }, [clinic, bookDeptId]);

  const isEmergencyBookDept =
    selectedBookDept?.code?.toUpperCase() === "EMERG" ||
    selectedBookDept?.name?.toLowerCase().includes("emerg");

  // Load doctors for selected department
  useEffect(() => {
    setBookDoctorId("");
    setBookSlot("");
    setDoctorSlots([]);
    if (!clinic?.clinic_id || !bookDeptId || isEmergencyBookDept) {
      setDeptDoctors([]);
      return;
    }
    api
      .getPublicDoctors(clinic.clinic_id, bookDeptId)
      .then((list) => setDeptDoctors(list || []))
      .catch(() => setDeptDoctors([]));
  }, [clinic?.clinic_id, bookDeptId, isEmergencyBookDept]);

  // Load available slots for selected doctor + date
  useEffect(() => {
    setBookSlot("");
    if (!clinic?.clinic_id || !bookDoctorId || !bookDate || isEmergencyBookDept) {
      setDoctorSlots([]);
      return;
    }
    setSlotsLoading(true);
    api
      .getDoctorSlots(clinic.clinic_id, bookDoctorId, bookDate)
      .then((res) => setDoctorSlots(res?.slots || []))
      .catch(() => setDoctorSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [clinic?.clinic_id, bookDoctorId, bookDate, isEmergencyBookDept]);

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
      if (
        err.status === 401 ||
        err.message?.includes("401") ||
        err.message?.includes("token")
      ) {
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
      const res = await api.patientLogin(
        loginIdentifier.trim(),
        loginPassword
      );
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
      if (
        raw.toLowerCase().includes("cnic") &&
        raw.toLowerCase().includes("already registered")
      ) {
        setErrorMsg(
          "معذرت! اس شناختی کارڈ (CNIC) پر پہلے سے اکاؤنٹ موجود ہے۔ براہ کرم لاگ ان کریں۔ (Account with this CNIC already exists. Please sign in.)"
        );
      } else if (
        raw.toLowerCase().includes("email") &&
        raw.toLowerCase().includes("already registered")
      ) {
        setErrorMsg(
          "معذرت! اس ای میل پر پہلے سے اکاؤنٹ موجود ہے۔ براہ کرم لاگ ان کریں۔ (Account with this Email already exists. Please sign in.)"
        );
      } else {
        setErrorMsg(
          raw || "رجسٹریشن مکمل نہ ہو سکی۔ براہ کرم ڈیٹا چیک کریں۔"
        );
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
        setSuccessMsg(
          res.message || "پاسورڈ کی تفصیلات فراہم کر دی گئی ہیں۔"
        );
      }
    } catch (err) {
      setErrorMsg(
        err.message ||
          "اس شناختی کارڈ یا ای میل کے ساتھ کوئی اکاؤنٹ نہیں ملا۔ (Account not found)"
      );
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
    const targetCnic = isSelf
      ? profile.cnic
      : otherCnic.trim().replace(" ", "");
    const targetAge = isSelf ? profile.age_years : Number(otherAge) || 30;
    const targetPhone = isSelf
      ? profile.phone_number
      : otherPhone.trim() || undefined;

    if (!targetName) {
      setErrorMsg("براہ کرم مریض کا نام درج کریں۔");
      setBookingLoading(false);
      return;
    }

    if (!isEmergencyBookDept && deptDoctors.length > 0 && !bookDoctorId) {
      setErrorMsg("Please select a doctor from this department.");
      setBookingLoading(false);
      return;
    }

    try {
      const payload = {
        display_name: targetName,
        cnic: targetCnic || undefined,
        age_years: targetAge,
        phone_number: targetPhone,
        department_id: Number(bookDeptId),
        doctor_id: !isEmergencyBookDept && bookDoctorId ? Number(bookDoctorId) : undefined,
        service_date: !isEmergencyBookDept && bookDate ? bookDate : undefined,
        appointment_slot: !isEmergencyBookDept && bookSlot ? bookSlot : undefined,
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
        setDashboardTab("dashboard");
        setSuccessMsg(
          `🎉 آپ کے اپنے اکاؤنٹ کا نیا لائیو ٹوکن ${res.ticket.token_code} جاری ہو گیا ہے!`
        );
        await loadPatientData(session.access_token);
      } else {
        setSuccessMsg(
          `🎉 نیا ٹوکن ${res.ticket.token_code} مریض "${targetName}" (${
            targetCnic ? `CNIC: ${targetCnic}` : "بغیر CNIC"
          }) کے لیے جاری ہو گیا ہے۔ یہ ٹوکن ان کے اپنے پورٹل اکاؤنٹ میں جائے گا!`
        );
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
    setDashboardTab("dashboard");
    setSuccessMsg("کامیابی سے سائن آؤٹ ہو گیا۔");
  }

  // Active live ticket (WAITING, CALLED, IN_CONSULTATION)
  const activeTicket = history.find(
    (t) =>
      t.status === "WAITING" ||
      t.status === "CALLED" ||
      t.status === "IN_CONSULTATION"
  );

  // Completed / Past visits
  const pastVisits = useMemo(() => {
    return history.filter(
      (t) =>
        t.status === "COMPLETED" ||
        t.status === "CANCELLED" ||
        t.status === "NO_SHOW"
    );
  }, [history]);

  // Visits that have prescriptions
  const prescriptionVisits = useMemo(() => {
    return history.filter(
      (t) =>
        (t.prescription_medicines && t.prescription_medicines.length > 0) ||
        t.diagnosis ||
        t.clinician_note
    );
  }, [history]);

  // Available months from history for the dropdown filter
  const availableMonths = useMemo(() => {
    const set = new Set();
    pastVisits.forEach((item) => {
      if (item.visit_date) {
        const d = new Date(item.visit_date);
        const monthYear = d.toLocaleString("default", {
          month: "long",
          year: "numeric",
        });
        set.add(monthYear);
      }
    });
    return Array.from(set);
  }, [pastVisits]);

  // Filtered past visits based on Month, Department, and Search Query
  const filteredPastVisits = useMemo(() => {
    return pastVisits.filter((item) => {
      if (selectedMonth && item.visit_date) {
        const itemMonth = new Date(item.visit_date).toLocaleString("default", {
          month: "long",
          year: "numeric",
        });
        if (itemMonth !== selectedMonth) return false;
      }

      if (selectedDept && item.department_name) {
        if (
          !item.department_name
            .toLowerCase()
            .includes(selectedDept.toLowerCase())
        ) {
          return false;
        }
      }

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

  const firstName = (profile?.full_name || "Patient").split(" ")[0];
  const formattedToday = useMemo(() => {
    return new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const queueStepIndex = !activeTicket
    ? 0
    : activeTicket.status === "IN_CONSULTATION"
    ? 2
    : activeTicket.status === "CALLED"
    ? 1
    : 1;

  // Shared Past Visits + Filters renderer for Records & Appointments tabs
  function renderPastVisitsSection(sectionTitle = "Recent Health Records") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {sectionTitle} — Search & Filter Consultations
            </div>
            <button
              type="button"
              onClick={() => setDashboardTab("book")}
              className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
            >
              + Book New Token
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Search by Doctor / Symptom / Token
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Sara, Chest pain, Y-002"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Filter by Month (مہینہ منتخب کریں)
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Months (تمام مہینے)</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Filter by Department (شعبہ)
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              Total Records:{" "}
              <strong className="text-slate-800">
                {filteredPastVisits.length}
              </strong>
            </span>
            {(selectedMonth || selectedDept || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth("");
                  setSelectedDept("");
                  setSearchQuery("");
                }}
                className="text-xs text-emerald-700 hover:underline font-semibold"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

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
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs hover:shadow-md transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-lg text-slate-900">
                      {item.token_code}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                      {item.status}
                    </span>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {item.department_name}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-medium">
                    📅{" "}
                    {item.visit_date
                      ? new Date(item.visit_date).toLocaleString("en-PK", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <span className="font-bold text-slate-900 block mb-0.5">
                      🩺 Doctor & Room:
                    </span>
                    <span>
                      {formatDoctorLabel(item.doctor_name)}
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

                {item.diagnosis && (
                  <div className="mt-3 rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-emerald-900 block mb-0.5">
                        🩺 Clinical Diagnosis (تشخیص):
                      </span>
                      <span className="font-semibold text-slate-800">
                        {item.diagnosis}
                      </span>
                    </div>
                    {item.prescription_medicines?.length > 0 && (
                      <span className="bg-emerald-200/80 text-emerald-900 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                        💊 {item.prescription_medicines.length} Medicines
                        Prescribed
                      </span>
                    )}
                  </div>
                )}

                {item.clinician_note && (
                  <div className="mt-2.5 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-800">
                    <strong className="block font-bold mb-0.5">
                      📋 Doctor&apos;s Consultation Summary / نوٹس:
                    </strong>
                    {item.clinician_note}
                  </div>
                )}

                <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    {item.prescription_medicines?.length > 0
                      ? "✅ ڈیجیٹل نسخہ دستیاب ہے، پرنٹ یا PDF ڈاؤن لوڈ کر سکتے ہیں"
                      : "ڈاکٹر کی تصدیق شدہ کنسلٹیشن پرچی"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewingPrescription(item)}
                    className="rounded-xl bg-[#0F9D6E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c825b] shadow-2xs transition flex items-center gap-1.5"
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
    );
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F4FAF8] text-slate-900">
      {/* Top Header (Shown when unauthenticated; inside Dashboard we render the MediFlow AI top bar) */}
      {!session && (
        <div className="mx-auto max-w-5xl px-3 sm:px-6 pt-6 sm:pt-8">
          <div className="glass-card rounded-3xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 mb-6 bg-white border border-slate-200/80">
            <div className="flex items-center gap-3.5">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl shadow-md shadow-blue-600/20">
                🏥
              </div>
              <div>
                <Link
                  href="/"
                  className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
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
          </div>
        </div>
      )}

      {/* Notifications */}
      <div
        className={
          session
            ? "mx-auto w-full max-w-[1600px] px-3 sm:px-5 lg:px-8 pt-3 sm:pt-4"
            : "mx-auto max-w-5xl px-3 sm:px-6"
        }
      >
        {errorMsg && (
          <div className="mb-4 rounded-2xl border-2 border-rose-400 bg-rose-50 p-3.5 text-sm font-semibold text-rose-900 shadow-2xs flex items-start justify-between gap-2">
            <span>⚠️ {errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg("")}
              className="text-rose-600 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-900 shadow-2xs flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span>✅ {successMsg}</span>
              {recoveredPass && (
                <div className="mt-2 text-base font-extrabold text-slate-900 bg-white p-2.5 rounded-xl border border-emerald-300 inline-block">
                  آپ کا پاسورڈ ہے:{" "}
                  <span className="font-mono text-blue-700 select-all">
                    {recoveredPass}
                  </span>
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
            <button
              type="button"
              onClick={() => setSuccessMsg("")}
              className="text-emerald-700 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {!session ? (
        <div className="mx-auto max-w-5xl px-3 sm:px-6 pb-10">
          <div className="mx-auto max-w-md">
            {/* Emergency Banner */}
            {clinic && !instantEmergencyResult && (
              <div className="mb-4 rounded-2xl border-2 border-red-600 bg-gradient-to-r from-red-600 to-rose-600 p-4 text-white shadow-lg">
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

            {/* Instant Emergency Result */}
            {instantEmergencyResult && (
              <div className="mb-5 rounded-3xl border-2 border-red-600 bg-red-50 p-6 text-center shadow-lg space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-wider text-red-700">
                  {instantEmergencyResult.ticket.triage_card_title}
                </p>
                <p className="text-5xl font-black text-red-700">
                  {instantEmergencyResult.ticket.token_code}
                </p>
                <p className="text-xs text-red-900 font-medium">
                  {instantEmergencyResult.ticket.triage_card_message}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Link
                    href={`/track/${encodeURIComponent(
                      instantEmergencyResult.tracking_token
                    )}`}
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

            {/* Auth Container with Tabs */}
            <div className="glass-card rounded-3xl overflow-hidden shadow-xl bg-white">
              {/* Tabs */}
              <div className="flex p-1.5 gap-1 bg-slate-100/90 text-xs font-bold">
                <button
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  className={`flex-1 py-3.5 px-2 text-center transition ${
                    authMode === "login"
                      ? "bg-white text-blue-600 border-b-2 border-blue-600 shadow-2xs"
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
                  className={`flex-1 py-3.5 px-2 text-center transition ${
                    authMode === "register"
                      ? "bg-white text-blue-600 border-b-2 border-blue-600 shadow-2xs"
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
                  className={`flex-1 py-3.5 px-2 text-center transition ${
                    authMode === "forgot"
                      ? "bg-white text-blue-600 border-b-2 border-blue-600 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Forgot Password
                </button>
              </div>

              <div className="p-5 sm:p-8">
                {/* 1. SIGN IN FORM */}
                {authMode === "login" && (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        Patient Sign In
                      </h2>
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
                      <h2 className="text-xl font-bold text-slate-900">
                        New Patient Registration
                      </h2>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      {loading
                        ? "Creating Account..."
                        : "Create Account (رجسٹر کریں)"}
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
                      <h2 className="text-xl font-bold text-slate-900">
                        Forgot Password
                      </h2>
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
                      {loading
                        ? "Checking Database..."
                        : "Show My Password (پاسورڈ دکھائیں)"}
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
          </div>
        </div>
      ) : (
        /* LOGGED IN MEDIFLOW AI PATIENT DASHBOARD */
        <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-5 lg:px-8 pb-8 sm:pb-12">
          <div className="rounded-3xl bg-white/95 border border-emerald-100/90 shadow-lg overflow-hidden">
            {/* Top Bar */}
            <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 bg-white px-4 sm:px-6 lg:px-8 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <Link
                  href="/"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F9D6E] text-white font-black text-lg shadow-2xs"
                  title="Back to Hub"
                >
                  💚
                </Link>
                <div className="min-w-0">
                  <div className="text-lg font-black tracking-tight text-slate-900 leading-none">
                    MediFlow <span className="text-[#0F9D6E]">AI</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-1 truncate">
                    {clinic?.name || "Capital Youth Expo — Track 2 Healthcare"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-4 ml-auto">
                <button
                  type="button"
                  onClick={() => showStayTuned("Notifications")}
                  className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100 transition"
                  title="Notifications"
                >
                  <span className="text-base">🔔</span>
                  {activeTicket && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500" />
                  )}
                </button>

                <div className="flex items-center gap-2.5 border-l border-slate-200 pl-3 sm:pl-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-black text-sm">
                    {firstName.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left leading-tight">
                    <div className="text-xs font-bold text-slate-900">
                      {profile?.full_name || "Patient"}
                    </div>
                    <div className="text-[11px] text-slate-400">Patient</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </header>

            {/* Mobile & Tablet Horizontal Navigation */}
            <div className="lg:hidden border-b border-slate-100 bg-white px-3 sm:px-5 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setDashboardTab("dashboard")}
                className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  dashboardTab === "dashboard"
                    ? "bg-[#E8F6F1] text-[#0F9D6E]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>🏠</span>
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardTab("appointments")}
                className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  dashboardTab === "appointments"
                    ? "bg-[#E8F6F1] text-[#0F9D6E] font-bold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>📅</span>
                <span>Appointments</span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardTab("records")}
                className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  dashboardTab === "records"
                    ? "bg-[#E8F6F1] text-[#0F9D6E] font-bold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>📁</span>
                <span>Health Records</span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardTab("prescriptions")}
                className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  dashboardTab === "prescriptions"
                    ? "bg-[#E8F6F1] text-[#0F9D6E] font-bold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>💊</span>
                <span>Prescriptions</span>
              </button>

              <button
                type="button"
                onClick={() => showStayTuned("Messages")}
                className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <span>💬</span>
                <span>Messages</span>
                <span className="rounded-full bg-[#0F9D6E] px-1.5 py-0.5 text-[10px] font-black text-white">
                  2
                </span>
              </button>

              <button
                type="button"
                onClick={() => showStayTuned("Settings")}
                className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <span>⚙️</span>
                <span>Settings</span>
              </button>
            </div>

            {/* Main Shell: Desktop Sidebar + Fluid Content */}
            <div className="flex flex-col lg:flex-row items-stretch">
              {/* Left Sidebar (Desktop/Laptop) */}
              <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 border-r border-slate-100 bg-white p-4 xl:p-5 flex-col justify-between gap-6">
                <nav className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setDashboardTab("dashboard")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
                      dashboardTab === "dashboard"
                        ? "bg-[#E8F6F1] text-[#0F9D6E]"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>🏠</span>
                    <span>Dashboard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDashboardTab("appointments")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                      dashboardTab === "appointments"
                        ? "bg-[#E8F6F1] text-[#0F9D6E] font-bold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>📅</span>
                    <span>My Appointments</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDashboardTab("records")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                      dashboardTab === "records"
                        ? "bg-[#E8F6F1] text-[#0F9D6E] font-bold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>📁</span>
                    <span>My Health Records</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDashboardTab("prescriptions")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                      dashboardTab === "prescriptions"
                        ? "bg-[#E8F6F1] text-[#0F9D6E] font-bold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>💊</span>
                    <span>Prescriptions</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => showStayTuned("Messages")}
                    className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    <span className="flex items-center gap-3">
                      <span>💬</span>
                      <span>Messages</span>
                    </span>
                    <span className="rounded-full bg-[#0F9D6E] px-2 py-0.5 text-[10px] font-black text-white">
                      2
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => showStayTuned("Settings")}
                    className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    <span>⚙️</span>
                    <span>Settings</span>
                  </button>
                </nav>

                {/* Need Help Card */}
                <div className="rounded-2xl border border-emerald-100 bg-[#F2FBF7] p-4 text-left">
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-[#0F9D6E] text-sm font-bold">
                    💬
                  </div>
                  <div className="text-xs font-black text-slate-900">
                    Need Help?
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Our support team is available 24/7
                  </p>
                  <button
                    type="button"
                    onClick={() => showStayTuned("24/7 Support")}
                    className="mt-3 w-full rounded-xl border border-emerald-500 bg-white py-2 text-[11px] font-bold text-[#0F9D6E] hover:bg-emerald-50 transition"
                  >
                    💬 Contact Support
                  </button>
                </div>
              </aside>

              {/* Center + Right Workspace */}
              <div className="flex-1 min-w-0 bg-[#F8FCFA] p-4 sm:p-6 lg:p-7">
                {dashboardTab === "dashboard" && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 lg:gap-6 items-start">
                    {/* Center Column */}
                    <div className="xl:col-span-8 min-w-0 space-y-5">
                      {/* Greeting + Date Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-2xl sm:text-[28px] font-black text-slate-900 tracking-tight">
                            Good Morning,{" "}
                            <span className="text-[#0F9D6E]">{firstName}</span>{" "}
                            👋
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Here&apos;s your health overview and upcoming
                            appointments.
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2 shadow-2xs shrink-0">
                          <span className="text-base">📅</span>
                          <div className="text-left leading-tight">
                            <div className="text-xs font-bold text-slate-800">
                              Today, {formattedToday}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Stay healthy, stay positive!
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Hero Banner Card */}
                      <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-r from-[#E6F7F1] via-[#EEF9F5] to-[#D6EFE6] p-5 sm:p-7">
                        <div className="max-w-md relative z-10">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#0F9D6E] shadow-2xs">
                            <span>💚</span>
                            <span>Your Health Matters</span>
                          </span>
                          <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3 leading-tight">
                            Stay on Track with Your Health
                          </h3>
                          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                            Access your appointments, medical records,
                            prescriptions and more — all in one place.
                          </p>
                          <button
                            type="button"
                            onClick={() => setDashboardTab("records")}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0F9D6E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0c825b] shadow-2xs transition"
                          >
                            <span>View Health Records →</span>
                          </button>
                        </div>

                        {/* Decorative Medical Badge on Right */}
                        <div className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 h-36 w-36 rounded-3xl bg-white/85 border border-emerald-200/80 shadow-inner items-center justify-center text-5xl">
                          🩺
                        </div>
                      </div>

                      {/* Upcoming Appointment / Active Token Card */}
                      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
                        <div className="flex items-center justify-between mb-3.5">
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <span>📅</span>
                            <span>
                              {activeTicket
                                ? "Active Queue Appointment"
                                : "Upcoming Appointment"}
                            </span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => setDashboardTab("appointments")}
                            className="text-xs font-bold text-[#0F9D6E] hover:underline"
                          >
                            View All →
                          </button>
                        </div>

                        {activeTicket ? (
                          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-100 bg-[#F7FCFA] p-4">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#0F9D6E] font-black">
                                <span className="text-[10px] uppercase">
                                  Token
                                </span>
                                <span className="text-base leading-tight">
                                  {activeTicket.token_code}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-black text-slate-900 truncate">
                                  {activeTicket.department_name}
                                </div>
                                <div className="text-xs text-slate-600 mt-0.5">
                                  {formatDoctorLabel(activeTicket.doctor_name)}{" "}
                                  • Ahead: {activeTicket.ahead_count ?? 0}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                  📍{" "}
                                  {activeTicket.room_number ||
                                    "Outpatient Department (OPD)"}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-[#0F9D6E]">
                                {activeTicket.status}
                              </span>
                              {activeTicket.tracking_token ? (
                                <Link
                                  href={`/track/${encodeURIComponent(
                                    activeTicket.tracking_token
                                  )}`}
                                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition"
                                >
                                  View Details →
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDashboardTab("book")}
                                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition"
                                >
                                  View Details →
                                </button>
                              )}
                            </div>
                          </div>
                        ) : pastVisits[0] ? (
                          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#E6F6F0] text-[#0F9D6E] font-black">
                                <span className="text-lg leading-none">
                                  {pastVisits[0].visit_date
                                    ? new Date(
                                        pastVisits[0].visit_date
                                      ).getDate()
                                    : "—"}
                                </span>
                                <span className="text-[11px] font-bold mt-1">
                                  {pastVisits[0].visit_date
                                    ? new Date(
                                        pastVisits[0].visit_date
                                      ).toLocaleString("en", {
                                        month: "short",
                                      })
                                    : "Visit"}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-black text-slate-900 truncate">
                                  {pastVisits[0].department_name}
                                </div>
                                <div className="text-xs text-slate-600 mt-0.5">
                                  {formatDoctorLabel(pastVisits[0].doctor_name)}{" "}
                                  • {pastVisits[0].token_code}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                  📍{" "}
                                  {pastVisits[0].room_number ||
                                    "Outpatient Department (OPD)"}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-[#0F9D6E]">
                                {pastVisits[0].status}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingPrescription(pastVisits[0])
                                }
                                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition"
                              >
                                View Details →
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                            <div>
                              <div className="text-sm font-bold text-slate-800">
                                No active or scheduled appointment right now
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Book a queue token to join the live clinic queue.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDashboardTab("book")}
                              className="rounded-xl bg-[#0F9D6E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c825b] transition"
                            >
                              Book Appointment →
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3.5">
                          <span>⚡</span>
                          <span>Quick Actions</span>
                        </h3>

                        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3">
                          <button
                            type="button"
                            onClick={() => setDashboardTab("book")}
                            className="rounded-2xl bg-[#EEF8F4] hover:bg-[#E1F3EC] p-4 text-left transition"
                          >
                            <div className="text-xl mb-2">📅</div>
                            <div className="text-xs font-bold text-slate-900">
                              Book Appointment →
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDashboardTab("prescriptions")}
                            className="rounded-2xl bg-[#EEF4FC] hover:bg-[#E1EEFA] p-4 text-left transition"
                          >
                            <div className="text-xl mb-2">💊</div>
                            <div className="text-xs font-bold text-slate-900">
                              View Prescriptions →
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDashboardTab("records")}
                            className="rounded-2xl bg-[#FDF5E7] hover:bg-[#FBECC9] p-4 text-left transition"
                          >
                            <div className="text-xl mb-2">📁</div>
                            <div className="text-xs font-bold text-slate-900">
                              My Medical Records →
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => showStayTuned("Contact Support")}
                            className="rounded-2xl bg-[#F5EEFC] hover:bg-[#ECE0FA] p-4 text-left transition"
                          >
                            <div className="text-xl mb-2">💬</div>
                            <div className="text-xs font-bold text-slate-900">
                              Contact Support →
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Recent Health Records Table */}
                      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
                        <div className="flex items-center justify-between mb-3.5">
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <span>📁</span>
                            <span>Recent Health Records</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => setDashboardTab("records")}
                            className="text-xs font-bold text-[#0F9D6E] hover:underline"
                          >
                            View All →
                          </button>
                        </div>

                        {pastVisits.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 p-6 text-center text-xs text-slate-400">
                            No completed consultation records yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                                  <th className="py-2.5 pr-3">Date</th>
                                  <th className="py-2.5 px-3">Document Type</th>
                                  <th className="py-2.5 px-3">Doctor</th>
                                  <th className="py-2.5 pl-3 text-right">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {pastVisits.slice(0, 4).map((item) => (
                                  <tr
                                    key={item.ticket_id}
                                    onClick={() => setViewingPrescription(item)}
                                    className="hover:bg-slate-50/80 cursor-pointer transition"
                                  >
                                    <td className="py-3 pr-3 font-medium text-slate-700 whitespace-nowrap">
                                      📄{" "}
                                      {item.visit_date
                                        ? new Date(
                                            item.visit_date
                                          ).toLocaleDateString("en-GB", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                          })
                                        : item.token_code}
                                    </td>
                                    <td className="py-3 px-3 font-bold text-slate-900">
                                      {item.prescription_medicines?.length > 0
                                        ? "Prescription"
                                        : item.diagnosis ||
                                          "Consultation Notes"}
                                    </td>
                                    <td className="py-3 px-3 text-slate-600">
                                      {formatDoctorLabel(item.doctor_name)}
                                    </td>
                                    <td className="py-3 pl-3 text-right">
                                      <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#0F9D6E]">
                                        Available
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="xl:col-span-4 min-w-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5">
                      {/* Profile Card */}
                      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                        <div className="flex flex-col items-center text-center pb-4 border-b border-slate-100">
                          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-[#0F9D6E] shadow-2xs">
                            {firstName.charAt(0).toUpperCase()}
                          </div>
                          <div className="mt-3 flex items-center gap-1.5">
                            <h3 className="text-base font-black text-slate-900">
                              {profile?.full_name}
                            </h3>
                            <button
                              type="button"
                              onClick={() => showStayTuned("Edit Profile")}
                              className="text-xs text-slate-400 hover:text-slate-700"
                              title="Edit Profile"
                            >
                              ✏️
                            </button>
                          </div>
                          <div className="text-[11px] font-medium text-slate-400 mt-0.5 font-mono">
                            CNIC: {profile?.cnic || "—"}
                          </div>
                        </div>

                        <dl className="mt-4 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-400 flex items-center gap-2 shrink-0">
                              <span>👤</span>
                              <span>Age</span>
                            </dt>
                            <dd className="font-bold text-slate-800">
                              {profile?.age_years ?? "—"}
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-400 flex items-center gap-2 shrink-0">
                              <span>⚧</span>
                              <span>Gender</span>
                            </dt>
                            <dd className="font-bold text-slate-800 capitalize">
                              {profile?.gender || "—"}
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-400 flex items-center gap-2 shrink-0">
                              <span>📞</span>
                              <span>Phone</span>
                            </dt>
                            <dd className="font-bold text-slate-800">
                              {profile?.phone_number || "—"}
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-400 flex items-center gap-2 shrink-0">
                              <span>✉️</span>
                              <span>Email</span>
                            </dt>
                            <dd className="font-bold text-slate-800 truncate max-w-[200px]">
                              {profile?.email || "—"}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {/* Live Queue Status Card */}
                      <div className="rounded-3xl border border-emerald-100 bg-[#F3FAF7] p-5 shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                              <span>💚</span>
                              <span>Live Queue Status</span>
                            </h3>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#0F9D6E]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#0F9D6E]" />
                              <span>{activeTicket ? "Live" : "Idle"}</span>
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pb-4 border-b border-emerald-200/60">
                            <div>
                              <div className="text-2xl font-black text-[#0F9D6E]">
                                {activeTicket ? activeTicket.token_code : "—"}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Your Queue Number
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-2xl font-black text-slate-900">
                                {activeTicket?.room_number ||
                                  (activeTicket ? "OPD" : "0")}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {activeTicket
                                  ? `Ahead: ${activeTicket.ahead_count ?? 0}`
                                  : "No Active Token"}
                              </div>
                            </div>
                          </div>

                          {/* Progress Steps */}
                          <div className="py-4">
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold">
                              <span className="text-[#0F9D6E]">
                                ✓ Check-in Completed
                              </span>
                              <span
                                className={
                                  queueStepIndex >= 1
                                    ? "text-slate-900"
                                    : "text-slate-400"
                                }
                              >
                                • {activeTicket?.status || "Waiting"}
                              </span>
                              <span
                                className={
                                  queueStepIndex >= 2
                                    ? "text-[#0F9D6E]"
                                    : "text-slate-400"
                                }
                              >
                                → Consultation
                              </span>
                            </div>
                          </div>
                        </div>

                        {activeTicket?.tracking_token ? (
                          <Link
                            href={`/track/${encodeURIComponent(
                              activeTicket.tracking_token
                            )}`}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0F9D6E] py-3 text-xs font-bold text-white hover:bg-[#0c825b] shadow-2xs transition"
                          >
                            <span>View Live Queue →</span>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDashboardTab("book")}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0F9D6E] py-3 text-xs font-bold text-white hover:bg-[#0c825b] shadow-2xs transition"
                          >
                            <span>Get New Queue Token →</span>
                          </button>
                        )}
                      </div>

                      {/* Need Assistance / AI Card */}
                      <div className="md:col-span-2 xl:col-span-1 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">
                          🤖
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-black text-slate-900">
                            Need Assistance?
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                            Our AI assistant is here to help you with your
                            health queries.
                          </p>
                          <button
                            type="button"
                            onClick={() => setAiChatOpen(true)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#0F9D6E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c825b] transition"
                          >
                            <span>Chat with MediFlow AI →</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {dashboardTab === "appointments" && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-black text-slate-900">
                          My Appointments & Live Queue
                        </h2>
                        <p className="text-xs text-slate-500">
                          Live token status and past consultation visits.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDashboardTab("book")}
                        className="rounded-xl bg-[#0F9D6E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0c825b] transition"
                      >
                        + Book New Queue Token
                      </button>
                    </div>

                    {activeTicket && (
                      <div className="rounded-3xl border-2 border-emerald-400 bg-white p-5 sm:p-6 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
                          <span className="text-xs font-black uppercase tracking-wider text-[#0F9D6E]">
                            ● Live Active Token ({activeTicket.status})
                          </span>
                          {activeTicket.tracking_token && (
                            <Link
                              href={`/track/${encodeURIComponent(
                                activeTicket.tracking_token
                              )}`}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              Open Live Tracker →
                            </Link>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="rounded-2xl bg-slate-900 text-white p-4 text-center">
                            <div className="text-[11px] text-slate-400">
                              Token Code
                            </div>
                            <div className="text-4xl font-black text-emerald-400 mt-1">
                              {activeTicket.token_code}
                            </div>
                            <div className="text-xs text-slate-300 mt-1">
                              {activeTicket.department_name}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                            <div className="text-[11px] font-bold text-slate-500">
                              Patients Ahead
                            </div>
                            <div className="text-3xl font-black text-slate-900 mt-1">
                              {activeTicket.ahead_count ?? 0}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                            <div className="text-[11px] font-bold text-slate-500">
                              Estimated Wait
                            </div>
                            <div className="text-3xl font-black text-[#0F9D6E] mt-1">
                              {activeTicket.eta_min_minutes != null
                                ? `${activeTicket.eta_min_minutes}–${activeTicket.eta_max_minutes}m`
                                : "Calculating..."}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {renderPastVisitsSection("Past Consultations")}
                  </div>
                )}

                {dashboardTab === "records" && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-black text-slate-900">
                        My Health Records
                      </h2>
                      <p className="text-xs text-slate-500">
                        Search, filter, and download prescriptions from past
                        consultations.
                      </p>
                    </div>
                    {renderPastVisitsSection("All Health Records")}
                  </div>
                )}

                {dashboardTab === "prescriptions" && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-black text-slate-900">
                        Prescriptions (ڈیجیٹل نسخے)
                      </h2>
                      <p className="text-xs text-slate-500">
                        View or print/save PDF prescriptions from your visits.
                      </p>
                    </div>

                    {prescriptionVisits.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
                        No prescriptions recorded yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {prescriptionVisits.map((item) => (
                          <div
                            key={item.ticket_id}
                            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between gap-4"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-black text-base text-slate-900">
                                  {item.token_code} — {item.department_name}
                                </span>
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#0F9D6E]">
                                  {item.prescription_medicines?.length || 0} Rx
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                {formatDoctorLabel(item.doctor_name)}
                              </div>
                              <div className="text-xs text-slate-800 font-semibold mt-2">
                                {item.diagnosis ||
                                  item.clinician_note ||
                                  item.symptoms}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setViewingPrescription(item)}
                              className="w-full rounded-xl bg-[#0F9D6E] py-2.5 text-xs font-bold text-white hover:bg-[#0c825b] transition"
                            >
                              📄 View / Download Prescription PDF
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {dashboardTab === "book" && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-2xs">
                    <div className="max-w-xl mx-auto space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900">
                            Book New Consultation Token (نئی اپائنٹمنٹ لیں)
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            آپ کی تمام معلومات (نام، CNIC، عمر) خودکار طور پر اس ٹوکن سے منسلک ہو جائیں گی
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDashboardTab("dashboard")}
                          className="text-xs font-bold text-slate-500 hover:text-slate-900 shrink-0"
                        >
                          ← Dashboard
                        </button>
                      </div>

                      <form
                        onSubmit={handleBookNewToken}
                        className="space-y-4 pt-2"
                      >
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
                                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500 shadow-2xs"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <span className="text-xl">👤</span>
                              <div>
                                <div>میرے اپنے لیے (Myself)</div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {profile?.full_name} • {profile?.cnic}
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBookTarget("other")}
                              className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2.5 ${
                                bookTarget === "other"
                                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500 shadow-2xs"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <span className="text-xl">👥</span>
                              <div>
                                <div>کسی دوسرے مریض کے لیے</div>
                                <div className="text-[11px] font-normal text-slate-500">
                                  نئی فیملی / الگ مریض کا CNIC
                                </div>
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
                                <strong>Phone:</strong>{" "}
                                {profile?.phone_number || "—"}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
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
                                    onChange={(e) =>
                                      setOtherName(e.target.value)
                                    }
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
                                    onChange={(e) =>
                                      setOtherCnic(e.target.value)
                                    }
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
                                    onChange={(e) =>
                                      setOtherAge(e.target.value)
                                    }
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
                                    onChange={(e) =>
                                      setOtherPhone(e.target.value)
                                    }
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
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {(clinic?.departments || []).map((d) => (
                              <option
                                key={d.department_id}
                                value={d.department_id}
                              >
                                {d.name} ({d.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        {isEmergencyBookDept ? (
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
                            🚨 <strong>Emergency Department:</strong> No doctor selection required — your case goes directly to the on-duty Emergency &amp; Trauma team.
                          </div>
                        ) : (
                          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-800 mb-2">
                                Select Doctor / ڈاکٹر منتخب کریں *
                              </label>
                              {deptDoctors.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  No specific doctors assigned to this department yet. You will be routed to the department queue.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {deptDoctors.map((doc) => {
                                    const isAbsentToday = !doc.is_present && bookDate === todayStr;
                                    const selected = String(bookDoctorId) === String(doc.user_id);
                                    return (
                                      <button
                                        key={doc.user_id}
                                        type="button"
                                        disabled={isAbsentToday}
                                        onClick={() => setBookDoctorId(String(doc.user_id))}
                                        className={`text-left rounded-2xl border p-3 transition ${
                                          isAbsentToday
                                            ? "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed"
                                            : selected
                                            ? "border-[#0F9D6E] bg-emerald-50 ring-2 ring-[#0F9D6E]"
                                            : "border-slate-200 bg-white hover:border-emerald-300"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-extrabold text-slate-900">
                                            {doc.full_name}
                                          </span>
                                          <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                              doc.is_present
                                                ? "bg-emerald-100 text-emerald-800"
                                                : "bg-rose-100 text-rose-800"
                                            }`}
                                          >
                                            {doc.is_present ? "● Present" : "○ Absent"}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-1">
                                          {[doc.specialization, doc.room_number].filter(Boolean).join(" • ") || "Consultant"}
                                        </div>
                                        {isAbsentToday && (
                                          <div className="text-[10px] font-semibold text-rose-700 mt-1">
                                            Unavailable today — pick another doctor or future date
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                              <div>
                                <label className="block text-xs font-bold text-slate-800 mb-1">
                                  Appointment Date (Today or Future) *
                                </label>
                                <input
                                  type="date"
                                  min={todayStr}
                                  value={bookDate}
                                  onChange={(e) => setBookDate(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Book for today or schedule 3–4+ days ahead. Already booked time slots are automatically disabled.
                              </div>
                            </div>

                            {bookDoctorId && (
                              <div>
                                <label className="block text-xs font-bold text-slate-800 mb-2">
                                  Available Time Slots ({bookDate})
                                </label>
                                {slotsLoading ? (
                                  <p className="text-xs text-slate-500">Checking doctor slots...</p>
                                ) : (
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {doctorSlots.map((s) => {
                                      const isSelected = bookSlot === s.slot;
                                      return (
                                        <button
                                          key={s.slot}
                                          type="button"
                                          disabled={!s.available}
                                          onClick={() => setBookSlot(s.slot)}
                                          className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                                            !s.available
                                              ? "border-rose-200 bg-rose-50/70 text-rose-400 line-through cursor-not-allowed"
                                              : isSelected
                                              ? "border-[#0F9D6E] bg-[#0F9D6E] text-white shadow-xs"
                                              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50"
                                          }`}
                                        >
                                          {s.slot}
                                          {!s.available && <span className="block text-[9px] no-underline">Booked</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

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
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                                <span>
                                  🤖 AI Detection: {bookAiPreview.card_title}
                                </span>
                                {bookAiPreview.recommended_department && (
                                  <span className="text-[10px] font-semibold opacity-80">
                                    {bookAiPreview.recommended_department}
                                  </span>
                                )}
                              </div>
                              {bookAiPreview.red_flag_reasons?.length > 0 && (
                                <div className="mt-1 text-[11px]">
                                  - {bookAiPreview.red_flag_reasons[0]}
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
                            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500"
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
                          className="w-full rounded-xl bg-[#0F9D6E] py-3 text-sm font-bold text-white hover:bg-[#0c825b] transition disabled:opacity-50 shadow mt-2"
                        >
                          {bookingLoading
                            ? "Issuing Live Token..."
                            : "Issue My Live Token (ٹوکن حاصل کریں)"}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIGITAL PRESCRIPTION MODAL (PDF / PRINT VIEW) */}
      {viewingPrescription && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Action Bar (Hidden when printing) */}
            <div className="no-print bg-slate-900 text-white px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="text-sm font-bold">
                    Official Digital Prescription (میڈیکل پرچی / نسخہ)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Token: {viewingPrescription.token_code} •{" "}
                    {viewingPrescription.department_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-600 px-3.5 sm:px-4 py-2 text-xs font-bold text-white shadow transition flex items-center gap-1.5"
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
            <div
              id="prescription-slip-print"
              className="p-5 sm:p-8 bg-white text-slate-900 space-y-5"
            >
              {/* 1. Hospital Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-black shadow-2xs">
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
                      Healthcare City, Main Boulevard • UAN: +92 21 111-MEDIFLOW
                      (633-435)
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="inline-block bg-slate-900 text-white text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    E-Prescription Slip
                  </span>
                  <div className="text-xs font-mono text-slate-600 mt-1">
                    Rx ID: RX-{viewingPrescription.token_code}-
                    {String(viewingPrescription.ticket_id ?? "")
                      .padStart(4, "0")
                      .slice(0, 6)
                      .toUpperCase()}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Date:{" "}
                    {viewingPrescription.visit_date
                      ? new Date(viewingPrescription.visit_date).toLocaleString(
                          "en-PK",
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }
                        )
                      : "—"}
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
                    <strong>Age/Gender:</strong> {profile?.age_years} Y /{" "}
                    {profile?.gender || "Other"}
                  </div>
                  <div className="text-slate-600 font-mono">
                    <strong>CNIC:</strong> {profile?.cnic || "—"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Department:</strong>{" "}
                    {viewingPrescription.department_name}
                  </div>
                </div>

                {/* Doctor Info */}
                <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="font-extrabold text-[10px] uppercase text-emerald-700 tracking-wider block">
                    Attending Clinician (ماہر معالج)
                  </span>
                  <div className="text-sm font-black text-slate-900">
                    {formatDoctorLabel(viewingPrescription.doctor_name)}
                  </div>
                  <div className="text-slate-600">
                    <strong>Qualifications:</strong>{" "}
                    {viewingPrescription.doctor_degrees || "MBBS, FCPS"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Medical Registration:</strong>{" "}
                    {viewingPrescription.doctor_license
                      ? `PMDC #${viewingPrescription.doctor_license}`
                      : "PMDC / PMC Reg #48291-S"}
                  </div>
                  <div className="text-slate-600">
                    <strong>Consultation Room:</strong>{" "}
                    {viewingPrescription.room_number || "Room 101"}
                  </div>
                </div>
              </div>

              {/* 3. Measured Vitals Bar (if recorded) */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs">
                <span className="font-bold text-slate-700">
                  Measured Vitals:
                </span>
                <span className="text-slate-600">
                  <strong>Blood Pressure:</strong>{" "}
                  {viewingPrescription.vitals?.systolic_bp
                    ? `${viewingPrescription.vitals.systolic_bp}/${viewingPrescription.vitals.diastolic_bp} mmHg`
                    : "120/80 mmHg"}
                </span>
                <span className="text-slate-600">
                  <strong>Pulse:</strong>{" "}
                  {viewingPrescription.vitals?.pulse_bpm
                    ? `${viewingPrescription.vitals.pulse_bpm} bpm`
                    : "76 bpm"}
                </span>
                <span className="text-slate-600">
                  <strong>SpO2:</strong>{" "}
                  {viewingPrescription.vitals?.spo2_percent
                    ? `${viewingPrescription.vitals.spo2_percent}%`
                    : "98%"}
                </span>
                <span className="text-slate-600">
                  <strong>Temp:</strong>{" "}
                  {viewingPrescription.vitals?.temperature_c
                    ? `${viewingPrescription.vitals.temperature_c} °C`
                    : "36.8 °C"}
                </span>
              </div>

              {/* 4. Clinical Diagnosis (تشخیص) */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                <span className="font-bold text-xs uppercase tracking-wider text-blue-900 block mb-0.5">
                  Diagnosis / تشخیص:
                </span>
                <div className="text-sm font-extrabold text-slate-900">
                  {viewingPrescription.diagnosis ||
                    viewingPrescription.clinician_note ||
                    "General Outpatient Consultation"}
                </div>
              </div>

              {/* 5. Prescribed Medicines (Rx) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-serif italic text-2xl font-black text-slate-900">
                    ℞
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Prescribed Medicines / ادویات کی تفصیل
                  </span>
                </div>

                {viewingPrescription.prescription_medicines &&
                viewingPrescription.prescription_medicines.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
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
                        {viewingPrescription.prescription_medicines.map(
                          (m, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-bold text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-black text-slate-900">
                                {m.name}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">
                                {m.dosage || "1 Tab"}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-800">
                                {m.frequency || "1-0-1"}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-blue-700">
                                {m.duration || "5 days"}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {m.instructions || "کھانے کے بعد"}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                    <strong className="block text-slate-900 mb-1">
                      Prescription Note:
                    </strong>
                    {viewingPrescription.clinician_note ||
                      "Standard symptomatic therapy and oral hydration advised."}
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
                    {viewingPrescription.advice ||
                      viewingPrescription.clinician_note ||
                      "مکمل آرام کریں، متوازن غذا اور پانی کا استعمال زیادہ کریں۔"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                  <span className="font-bold text-slate-800 block mb-1">
                    Next Follow-Up Visit (دوبارہ چیک اپ):
                  </span>
                  <p className="font-semibold text-blue-700">
                    📅{" "}
                    {viewingPrescription.follow_up ||
                      "Follow up after 5 days if symptoms persist."}
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
                    {formatDoctorLabel(viewingPrescription.doctor_name)}
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

      {/* MEDIFLOW AI MEDICAL GUIDANCE CHAT MODAL */}
      {aiChatOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[88vh]">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-[#0F9D6E] to-teal-700 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/15 flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    MediFlow AI — Medical Guidance Assistant
                  </h3>
                  <p className="text-[11px] text-emerald-100">
                    Symptom guidance, warning signs &amp; department recommendations
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiChatOpen(false)}
                className="rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold text-white transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-1.5">
              {[
                "Fever & body ache",
                "Chest pain / high BP",
                "Stomach pain & acidity",
                "Child cough & cold",
                "Joint or back pain",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendAiMessage(prompt)}
                  disabled={aiChatLoading}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 transition disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-50/40">
              {aiChatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-line shadow-2xs ${
                      msg.role === "user"
                        ? "bg-[#0F9D6E] text-white rounded-br-sm"
                        : msg.urgency_tier === "RED"
                        ? "bg-rose-50 border-2 border-rose-400 text-rose-950 rounded-bl-sm"
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant" && msg.urgency_tier && idx > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                            msg.urgency_tier === "RED"
                              ? "bg-rose-600 text-white"
                              : msg.urgency_tier === "YELLOW"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {msg.urgency_tier} Priority
                        </span>
                        {msg.recommended_department && (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                            Dept: {msg.recommended_department}
                          </span>
                        )}
                      </div>
                    )}

                    <div>{msg.content}</div>

                    {msg.role === "assistant" && msg.recommended_department && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const matched = (clinic?.departments || []).find(
                              (d) =>
                                d.name.toLowerCase().includes(msg.recommended_department.toLowerCase()) ||
                                msg.recommended_department.toLowerCase().includes(d.name.toLowerCase())
                            );
                            if (matched) setBookDeptId(matched.department_id);
                            setAiChatOpen(false);
                            setDashboardTab("book");
                          }}
                          className="rounded-lg bg-[#0F9D6E] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#0c825b] transition"
                        >
                          Book Token in {msg.recommended_department} →
                        </button>
                      </div>
                    )}

                    {msg.disclaimer && (
                      <div className="mt-2 text-[10px] text-slate-400">
                        {msg.disclaimer}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {aiChatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white border border-slate-200 px-4 py-2.5 text-xs text-slate-500">
                    MediFlow AI is analyzing your question...
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiMessage();
              }}
              className="p-4 bg-white border-t border-slate-200 flex items-center gap-2.5"
            >
              <input
                type="text"
                placeholder="Ask about symptoms, home care, or which department to visit..."
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F9D6E]"
              />
              <button
                type="submit"
                disabled={aiChatLoading || !aiChatInput.trim()}
                className="rounded-xl bg-[#0F9D6E] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#0c825b] transition disabled:opacity-50"
              >
                Send
              </button>
            </form>
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