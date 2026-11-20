const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const { token, body, ...rest } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      detail = errData.detail || JSON.stringify(errData);
    } catch {
      // ignore non-json error body
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  getClinicBySlug(slug) {
    return request(`/api/v1/public/clinics/${encodeURIComponent(slug)}`);
  },
  createIntake(clinicId, payload) {
    // Exact contract fields: display_name, age_years, preferred_language, symptom_text, input_mode, department_id, patient_reported_duration
    return request(`/api/v1/public/clinics/${encodeURIComponent(clinicId)}/intakes`, {
      method: "POST",
      body: payload,
    });
  },
  trackTicket(trackingToken) {
    return request(`/api/v1/public/tickets/${encodeURIComponent(trackingToken)}`);
  },
  getPublicDisplay(displayToken) {
    return request(`/api/v1/public/display/${encodeURIComponent(displayToken)}`);
  },
  staffLogin(email, password) {
    return request(`/api/v1/auth/login`, {
      method: "POST",
      body: { email, password },
    });
  },
  getQueue(clinicId, departmentId, token) {
    const q = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : "";
    return request(`/api/v1/staff/clinics/${encodeURIComponent(clinicId)}/queue${q}`, { token });
  },
  getTicketDetail(ticketId, token) {
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}`, { token });
  },
  createWalkIn(payload, token) {
    return request(`/api/v1/staff/tickets`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  addVitals(ticketId, vitalsPayload, token) {
    // Exact contract fields: systolic_bp, diastolic_bp, temperature_c, spo2_percent, pulse_bpm, measured_at
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}/vitals`, {
      method: "POST",
      token,
      body: vitalsPayload,
    });
  },
  callTicket(ticketId, token) {
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}/call`, {
      method: "POST",
      token,
      body: {},
    });
  },
  startTicket(ticketId, token) {
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}/start`, {
      method: "POST",
      token,
      body: {},
    });
  },
  completeTicket(ticketId, payload, token) {
    // { doctor_id, clinician_note }
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}/complete`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  updateClinicDelay(clinicId, payload, token) {
    return request(`/api/v1/staff/clinics/${encodeURIComponent(clinicId)}/delay`, {
      method: "POST",
      token,
      body: payload,
    });
  },
};