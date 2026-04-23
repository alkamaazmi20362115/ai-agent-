const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

let db;

async function initDb() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = await open({
    filename: path.join(dataDir, 'employees.db'),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      role TEXT NOT NULL,
      hireDate TEXT NOT NULL
    )
  `);
}

function validateEmployeePayload(payload) {
  const requiredFields = ['name', 'email', 'department', 'role', 'hireDate'];

  for (const field of requiredFields) {
    if (!payload[field] || String(payload[field]).trim() === '') {
      return `${field} is required`;
    }
  }

  const email = String(payload.email).trim();
  const atIndex = email.indexOf('@');
  const dotAfterAt = email.lastIndexOf('.');
  const isValidEmail =
    atIndex > 0 && dotAfterAt > atIndex + 1 && dotAfterAt < email.length - 1;

  if (!isValidEmail) {
    return 'email must be a valid email address';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.hireDate)) {
    return 'hireDate must be in YYYY-MM-DD format';
  }

  return null;
}

app.get('/api/employees', async (req, res, next) => {
  try {
    const { department } = req.query;
    const rows = department
      ? await db.all(
          'SELECT * FROM employees WHERE department = ? ORDER BY id DESC',
          department,
        )
      : await db.all('SELECT * FROM employees ORDER BY id DESC');

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/employees/:id', async (req, res, next) => {
  try {
    const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.json(employee);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/employees', async (req, res, next) => {
  try {
    const validationError = validateEmployeePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { name, email, department, role, hireDate } = req.body;

    const result = await db.run(
      'INSERT INTO employees (name, email, department, role, hireDate) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim(), department.trim(), role.trim(), hireDate],
    );

    const employee = await db.get('SELECT * FROM employees WHERE id = ?', result.lastID);
    return res.status(201).json(employee);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'Email already exists' });
    }

    return next(error);
  }
});

app.put('/api/employees/:id', async (req, res, next) => {
  try {
    const validationError = validateEmployeePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const existing = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { name, email, department, role, hireDate } = req.body;

    await db.run(
      'UPDATE employees SET name = ?, email = ?, department = ?, role = ?, hireDate = ? WHERE id = ?',
      [name.trim(), email.trim(), department.trim(), role.trim(), hireDate, req.params.id],
    );

    const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
    return res.json(employee);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'Email already exists' });
    }

    return next(error);
  }
});

app.delete('/api/employees/:id', async (req, res, next) => {
  try {
    const result = await db.run('DELETE FROM employees WHERE id = ?', req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

/** Global error handler for uncaught route and middleware errors. */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
