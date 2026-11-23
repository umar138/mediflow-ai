"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { connectRealtimeSocket } from "../../../lib/ws";

export default function WaitingRoomDisplayPage({ params }) {
  const { token } = params;
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");

  async function loadDisplay() {
    try {
      const res = await api.getPublicDisplay(token);
      setBoard(res);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load display board.");
    }
  }

  useEffect(() => {
    loadDisplay();
    const stopWs = connectRealtimeSocket(`/api/v1/ws/public-display/${encodeURIComponent(token)}`, {
      onReconnect: loadDisplay,
      onMessage: loadDisplay,
    });
    const poll = setInterval(loadDisplay, 12000);
    return () => {
      stopWs();
      clearInterval(poll);
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 flex flex-col justify-between">
      <header className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-4xl font-black tracking-tight">
            {board?.clinic_name || "MediFlow Waiting Room"}
          </h1>
          <p className="mt-1 text-lg text-amber-300 font-medium">
            {board?.public_notice || ""}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-900 border border-slate-700 px-6 py-3 text-right">
          <div className="text-xs uppercase tracking-widest text-slate-400">Clinic Status</div>
          <div className="text-2xl font-extrabold text-emerald-400">
            {board?.clinic_status || "LOADING"}
          </div>
        </div>
      </header>

      {error && (
        <div className="my-6 rounded-2xl border border-rose-500 bg-rose-950/60 p-6 text-xl text-rose-200">
          {error}
        </div>
      )}

      <section className="my-8 grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 items-stretch">
        <div className="rounded-3xl bg-emerald-950/50 border-2 border-emerald-500/60 p-8 flex flex-col justify-between">
          <div className="text-2xl font-bold uppercase tracking-wider text-emerald-300">
            Now Serving
          </div>
          <div className="my-6 flex flex-wrap gap-4">
            {(board?.now_serving || []).length > 0 ? (
              board.now_serving.map((code) => {
                const itemStatus = board.now_serving_status?.[code] || "CALLED";
                const isConsulting = itemStatus === "IN_CONSULTATION";
                return (
                  <div
                    key={code}
                    className={`rounded-2xl px-7 py-4 text-center border-2 transition-all ${
                      isConsulting
                        ? "bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/30"
                        : "bg-emerald-500 text-slate-950 border-emerald-300 animate-pulse"
                    }`}
                  >
                    <div className="text-6xl font-black tracking-wider">{code}</div>
                    <div
                      className={`text-xs font-bold uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full inline-block ${
                        isConsulting
                          ? "bg-blue-800 text-blue-100"
                          : "bg-slate-900 text-emerald-300"
                      }`}
                    >
                      {isConsulting ? "In Consultation" : "Called • Enter Room"}
                    </div>
                  </div>
                );
              })
            ) : (
              <span className="text-3xl text-slate-400">Please wait for your token</span>
            )}
          </div>
          <div className="text-sm text-emerald-200/80">Token codes only</div>
        </div>

        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-8 flex flex-col justify-between">
          <div className="text-2xl font-bold uppercase tracking-wider text-sky-300">
            Next Up
          </div>
          <div className="my-6 grid grid-cols-2 gap-4">
            {(board?.next_up || []).length > 0 ? (
              board.next_up.map((code) => (
                <div
                  key={code}
                  className="rounded-2xl bg-slate-800 border border-slate-700 px-5 py-3 text-4xl font-extrabold text-center text-white"
                >
                  {code}
                </div>
              ))
            ) : (
              <span className="text-2xl text-slate-500">—</span>
            )}
          </div>
          <div className="text-sm text-slate-400">Ordered by priority & wait time</div>
        </div>
      </section>

      <footer className="border-t border-slate-800 pt-4 flex items-center justify-between text-sm text-slate-400">
        <span>Clinical workflow & triage decision-support tool — not a medical diagnosis.</span>
        <span>Updated: {board?.updated_at ? new Date(board.updated_at).toLocaleTimeString() : "—"}</span>
      </footer>
    </main>
  );
}