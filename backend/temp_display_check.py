import httpx, json, sys
r = httpx.get('http://127.0.0.1:8000/api/v1/public/display/mediflow-main-display')
print('Status:', r.status_code)
print('Body:', r.text)
