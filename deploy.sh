#!/usr/bin/env bash
# Set environment variables for production
export NEXT_PUBLIC_API_BASE="https://your-live-backend.example.com"
export NEXT_PUBLIC_WS_URL="wss://your-live-backend.example.com"

# Build frontend
cd frontend
npm run build

# (Optional) start backend with gunicorn/uvicorn in production mode
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
