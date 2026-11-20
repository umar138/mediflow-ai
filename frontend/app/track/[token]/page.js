"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

export default function TrackTicketPage({ params }) {
  const { token } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchStatus() {
    try {
      const res = await api.trackTicket(token);
      setData(res);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load tracking status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 12000);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs font-medium text-blue-600 hover:underline">
            ← Hub
          </Link>
          <button
            onClick={fetchStatus}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 font-medium">
          ⚠️ {data?.safety_message || "If symptoms are severe or worsening, alert clinic staff now."}
        </div>

        {loading && <p className="mt-6 text-sm text-slate-600">Checking token status...</p>}
        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {data && (
          <div className="mt-6 text-center space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your Queue Token
            </p>
            <div className="text-5xl font-black text-slate-900">{data.token_code}</div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Status</div>
                <div className="mt-1 font-bold text-slate-900">{data.status}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Queue Pos</div>
                <div className="mt-1 font-bold text-slate-900">
                  {data.queue_position ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">ETA Window</div>
                <div className="mt-1 font-bold text-slate-900">
                  {data.eta_min_minutes !== null && data.eta_max_minutes !== null
                    ? `${data.eta_min_minutes}–${data.eta_max_minutes}m`
                    : "—"}
                </div>
              </div>
            </div>

            {data.clinic_notice && (
              <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700 text-left">
                <span className="font-semibold">Clinic Notice:</span> {data.clinic_notice}
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Clinical workflow & triage decision-support tool — not a medical diagnosis.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}