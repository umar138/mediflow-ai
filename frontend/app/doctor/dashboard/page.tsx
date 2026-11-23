"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import useDoctorWS from "../../../hooks/useDoctorWS";

export default function DoctorDashboard() {
  const [events, setEvents] = useState<any[]>([]);

  const handleMessage = useCallback((msg: any) => {
    setEvents((prev) => [msg, ...prev]);
  }, []);

  useDoctorWS(handleMessage);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
        <div>
          <Link href="/doctor" className="text-xs font-semibold text-blue-600 hover:underline">
            ← Switch to Consultation Workspace
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Doctor Dashboard (Real-time Live Feed)
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-slate-600">WebSocket Connected</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">
            Incoming Queue & Triage Events
          </h2>
          <button
            onClick={() => setEvents([])}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Clear Log
          </button>
        </div>

        {events.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Listening on <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">/api/v1/doctor/ws/listen</code>.
            New patient check-ins and queue updates will appear here instantly.
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((e, i) => (
              <li
                key={i}
                className="p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 shadow-sm transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Event: {e.type || "Update"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    #{events.length - i}
                  </span>
                </div>
                <pre className="text-xs font-mono text-slate-800 overflow-x-auto p-2 bg-white rounded border border-slate-100">
                  {JSON.stringify(e, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
