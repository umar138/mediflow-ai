import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          Capital Youth Expo — Track 2 Healthcare
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          MediFlow AI — Clinical Queue & Triage System
        </h1>
        <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Disclaimer: Clinical workflow & triage decision-support tool — not a medical diagnosis.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/c/islamabad-care-clinic/join"
            className="rounded-xl border border-slate-200 p-5 hover:border-blue-500 hover:bg-blue-50/40 transition"
          >
            <h2 className="font-semibold text-lg text-slate-900">1. Patient QR Intake</h2>
            <p className="mt-1 text-sm text-slate-600">
              Mobile-first intake with Urdu (RTL), Roman Urdu, and English + voice fallback.
            </p>
          </Link>

          <Link
            href="/track/track-demo-005"
            className="rounded-xl border border-slate-200 p-5 hover:border-blue-500 hover:bg-blue-50/40 transition"
          >
            <h2 className="font-semibold text-lg text-slate-900">2. Patient Live Tracker</h2>
            <p className="mt-1 text-sm text-slate-600">
              Track token status, queue position, and ETA window without exposing PHI.
            </p>
          </Link>

          <Link
            href="/reception"
            className="rounded-xl border border-slate-200 p-5 hover:border-blue-500 hover:bg-blue-50/40 transition"
          >
            <h2 className="font-semibold text-lg text-slate-900">3. Reception & Nurse Console</h2>
            <p className="mt-1 text-sm text-slate-600">
              Register walk-ins, record vitals, and view RED flag escalations.
            </p>
          </Link>

          <Link
            href="/doctor"
            className="rounded-xl border border-slate-200 p-5 hover:border-blue-500 hover:bg-blue-50/40 transition"
          >
            <h2 className="font-semibold text-lg text-slate-900">4. Doctor Dashboard</h2>
            <p className="mt-1 text-sm text-slate-600">
              Server-prioritized queue, AI draft pre-brief, vitals vs symptoms, Call/Start/Complete.
            </p>
          </Link>

          <Link
            href="/display/demo-tv-display-token-2026"
            className="rounded-xl border border-slate-200 p-5 hover:border-blue-500 hover:bg-blue-50/40 transition sm:col-span-2"
          >
            <h2 className="font-semibold text-lg text-slate-900">5. Waiting Room TV Display (16:9)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sanitized public screen showing token codes, clinic status, and notices only.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}