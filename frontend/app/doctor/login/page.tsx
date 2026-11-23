"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { useRouter } from "next/navigation";

export default function DoctorLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await api.doctorLogin(email, password);
      localStorage.setItem("token", data.access_token);
      router.push("/doctor/dashboard");
    } catch (err: any) {
      alert(err.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-slate-900">
          Doctor Portal Login
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to access your real-time consultation dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow rounded-2xl sm:px-10 border border-slate-200">
          <form onSubmit={handle} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Doctor Email
              </label>
              <input
                type="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
              type="submit"
            >
              Login to Doctor Dashboard
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
