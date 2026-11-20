const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL || "ws://localhost:8000";

export function connectRealtimeSocket(path, { onMessage, onReconnect }) {
  let stopped = false;
  let retryDelay = 1500;
  let ws = null;
  let timer = null;

  function open() {
    if (stopped) return;
    const url = `${WS_BASE}${path}`;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retryDelay = 1500;
      if (typeof onReconnect === "function") onReconnect();
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (typeof onMessage === "function") onMessage(data);
      } catch {
        // ignore non-JSON frame
      }
    };

    ws.onclose = () => {
      if (!stopped) scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }

  function scheduleReconnect() {
    if (stopped) return;
    timer = setTimeout(() => {
      retryDelay = Math.min(12000, retryDelay * 1.5);
      open();
    }, retryDelay);
  }

  open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };
}