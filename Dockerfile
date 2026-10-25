# Backend API only. The frontend is a static Vite build served by any web server
# (npm run build && serve dist/) — the stage pages call the API at /api/*.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend

EXPOSE 8000
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
