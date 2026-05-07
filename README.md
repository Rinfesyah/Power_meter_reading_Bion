# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ndMC9-aK-DHUygIq7tpPk-qWUcI0wScA

## 🚀 Cara Menjalankan Aplikasi

Aplikasi ini terdiri dari tiga bagian: **Backend**, **Frontend Mobile**, dan **Frontend Dashboard**.

### 1. Terminal 1: Backend (FastAPI)
```bash
cd backend
python main.py
```

### 2. Terminal 2: Frontend Mobile (Operator)
```bash
cd frontend-mobile
npm run dev
```
*Berjalan di port 3001.*

### 3. Terminal 3: Frontend Dashboard (Manager)
```bash
cd frontend-dashboard
npm run dev
```
*Berjalan di port 3000.*
