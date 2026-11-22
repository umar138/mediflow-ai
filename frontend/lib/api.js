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
  // Hospitals
  getHospitals() {
    return request(`/api/v1/hospitals`);
  },
  getDoctorsByHospital(slug) {
    return request(`/api/v1/hospitals/${encodeURIComponent(slug)}/doctors`);
  },

  getClinicBySlug(slug) {
    return request(`/api/v1/public/clinics/${encodeURIComponent(slug)}`);
  },
  createIntake(clinicId, payload) {
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
  doctorRegister(payload) {
    return request(`/api/v1/auth/doctor/register`, {
      method: "POST",
      body: payload,
    });
  },
  patientRegister(payload) {
    return request(`/api/v1/patient/register`, {
      method: "POST",
      body: payload,
    });
  },
  patientLogin(identifier, password) {
    return request(`/api/v1/patient/login`, {
      method: "POST",
      body: { identifier, password },
    });
  },
  patientForgotPassword(identifier) {
    return request(`/api/v1/patient/forgot-password`, {
      method: "POST",
      body: { identifier },
    });
  },
  getPatientProfile(token) {
    return request(`/api/v1/patient/profile`, { token });
  },
  getPatientHistory(token) {
    return request(`/api/v1/patient/history`, { token });
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
  // New helper to create a ticket that includes a doctor_id (used in hospital flow)
  createTicketWithDoctor(payload, token) {
    return request(`/api/v1/staff/tickets`, {
      method: "POST",
      token,
      body: payload,
    });
  },
    return request(`/api/v1/staff/tickets`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  addVitals(ticketId, vitalsPayload, token) {
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}/vitals`, {
      method: "POST",
      token,
      body: vitalsPayload,
    });
  },
  callTicket(ticketId, token, roomNumber) {
    return request(`/api/v1/staff/tickets/${encodeURIComponent(ticketId)}/call`, {
      method: "POST",
      token,
      body: roomNumber ? { room_number: roomNumber } : {},
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
