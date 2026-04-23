# Employee Management System

This repository contains a full Employee Management System with:

- RESTful Employee CRUD API (Node.js + Express + SQLite)
- Employee fields: ID, Name, Email, Department, Role, Hire Date
- Department search/filter support
- React frontend for managing employees
- Error handling for validation, missing records, and duplicate emails

## Project Structure

- `/backend` - Express API + SQLite database
- `/frontend` - React (Vite) frontend

## Backend Setup

```bash
cd /home/runner/work/ai-agent-/ai-agent-/backend
npm install
npm run start
```

API runs at `http://localhost:3000`.

### API Endpoints

- `GET /api/employees`
- `GET /api/employees/:id`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`
- `GET /api/employees?department=Engineering`

## Frontend Setup

```bash
cd /home/runner/work/ai-agent-/ai-agent-/frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and uses `http://localhost:3000/api` by default.

To override API URL, set `VITE_API_URL`.
