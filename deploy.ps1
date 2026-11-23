# Set environment variables for production
$env:NEXT_PUBLIC_API_BASE = "https://your-live-backend.example.com"
$env:NEXT_PUBLIC_WS_URL = "wss://your-live-backend.example.com"

Write-Host "Building frontend with production settings..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\frontend"
npm run build

Write-Host "Starting backend in production mode..." -ForegroundColor Green
Set-Location -Path "$PSScriptRoot\backend"
uvicorn app.main:app --host 0.0.0.0 --port 8000
