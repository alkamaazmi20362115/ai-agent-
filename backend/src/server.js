const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json());

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and TIFF images are supported'));
    }
  },
});
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

/**
 * POST /api/enhance-image
 * Accepts a multipart image upload and returns a DSLR-quality enhanced version.
 * Enhancements applied:
 *   - Sharpen (high-frequency detail boost)
 *   - Contrast lift via linear levels
 *   - Saturation / vibrance boost
 *   - Subtle background blur (simulated bokeh via a mild gaussian blur on the
 *     full image when the subject fills the frame, preserving centre sharpness)
 *   - Auto-orientation from EXIF
 */
app.post(
  '/api/enhance-image',
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const { buffer } = req.file;

      // Retrieve metadata so we can size the bokeh mask to the image dimensions.
      // The defaults (800×1000) match a typical portrait aspect ratio and are
      // only reached for unusual image formats where sharp cannot read dimensions.
      const metadata = await sharp(buffer).rotate().metadata();
      const { width = 800, height = 1000 } = metadata;

      // --- Step 1: background bokeh layer ---
      // Create a softly-blurred copy of the whole image.
      const blurredBg = await sharp(buffer)
        .rotate()
        .blur(8)
        .toBuffer();

      // --- Step 2: sharp subject layer ---
      // Apply DSLR-like tonal and colour improvements.
      const sharpSubject = await sharp(buffer)
        .rotate()
        // Sharpening: sigma controls radius, flat/jagged control threshold
        .sharpen({ sigma: 1.8, m1: 1.5, m2: 0.7 })
        // Slight contrast lift: multiply by 1.08, add 5 to lift shadows
        .linear(1.08, 5)
        // Vibrant colours
        .modulate({ brightness: 1.03, saturation: 1.25 })
        .toBuffer();

      // --- Step 3: composite sharp centre over blurred bg ---
      // The subject mask is an ellipse covering the centre 62 % of the width and
      // 78 % of the height – empirically chosen to encompass a portrait subject
      // (head + shoulders) while leaving enough border for visible bokeh blur.
      const maskW = Math.round(width * 0.62);
      const maskH = Math.round(height * 0.78);
      const offsetX = Math.round((width - maskW) / 2);
      const offsetY = Math.round((height - maskH) / 2);

      // SVG ellipse mask (white = keep sharp layer, black = show blurred bg)
      const maskSvg = Buffer.from(
        `<svg width="${width}" height="${height}">
          <defs>
            <radialGradient id="g" cx="50%" cy="50%" rx="50%" ry="50%">
              <stop offset="50%" stop-color="white" stop-opacity="1"/>
              <stop offset="100%" stop-color="white" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="black"/>
          <ellipse cx="${offsetX + maskW / 2}" cy="${offsetY + maskH / 2}"
                   rx="${maskW / 2}" ry="${maskH / 2}"
                   fill="url(#g)"/>
        </svg>`,
      );

      const maskedSubject = await sharp(sharpSubject)
        .composite([{ input: maskSvg, blend: 'dest-in' }])
        .toBuffer();

      const finalBuffer = await sharp(blurredBg)
        .composite([{ input: maskedSubject, blend: 'over' }])
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', 'inline; filename="enhanced.jpg"');
      return res.send(finalBuffer);
    } catch (error) {
      return next(error);
    }
  },
);

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
