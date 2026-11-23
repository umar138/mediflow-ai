import Link from "next/link";
import React from "react";

export interface Doctor {
  doctor_id: string;
  hospital_id?: string;
  hospital_slug?: string;
  full_name: string;
  email: string;
  specialization_name?: string;
  specialization?: string;
}

interface DoctorCardProps {
  doctor: Doctor;
}

export default function DoctorCard({ doctor }: DoctorCardProps) {
  const slug = doctor.hospital_slug || "mediflow-demo-hospital";
  const spec = doctor.specialization_name || doctor.specialization || "General Medicine";
  const joinUrl = `/hospitals/${encodeURIComponent(slug)}/doctors/${doctor.doctor_id}/join`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">
          {doctor.full_name}
        </h3>
        <p className="text-sm text-slate-600 mb-2">
          <span className="font-semibold text-slate-700">Specialization:</span> {spec}
        </p>
        <p className="text-sm text-slate-500 mb-4">
          <span className="font-semibold text-slate-700">Email:</span> {doctor.email}
        </p>
      </div>
      <Link
        href={joinUrl}
        className="inline-block text-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
      >
        Book Appointment
      </Link>
    </div>
  );
}
