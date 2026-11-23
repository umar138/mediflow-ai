import { useEffect } from "react";

export default function useDoctorWS(onMessage: (msg: any) => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const baseWs = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${baseWs}/api/v1/doctor/ws/listen?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        onMessage(event.data);
      }
    };

    return () => {
      ws.close();
    };
  }, [onMessage]);
}
