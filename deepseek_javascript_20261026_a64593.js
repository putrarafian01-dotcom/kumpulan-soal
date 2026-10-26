import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { requireAdmin } from './auth.js';
import { reloadBank } from './db.js';

const router = express.Router();
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const UP_DIR = path.join(DATA_DIR, 'soal-upload');
fs.mkdirSync(UP_DIR, { recursive: true });

const MAX_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

function sessionFile(id) { return path.join(UP_DIR, id + '.part'); }
function sessionMeta(id) { return path.join(UP_DIR, id + '.json'); }
function loadSession(id) {
  try { return JSON.parse(fs.readFileSync(sessionMeta(id), 'utf8')); } catch { return null; }
}
function saveSession(s) { fs.writeFileSync(sessionMeta(s.id), JSON.stringify(s)); }

function verifySoalDb(p) {
  const db = new Database(p, { readonly: true, fileMustExist: true });
  let n = 0;
  try { n = db.prepare('SELECT COUNT(*) AS n FROM items').get().n; }
  catch (e) { db.close(); throw new Error('Bukan DB soal (tabel "items" tidak ada).'); }
  db.close();
  return n;
}

// POST /api/admin/soal/start  { size, filename }
router.post('/start', requireAdmin, (req, res) => {
  const size = parseInt(req.body?.size, 10);
  if (!size || size < 1024) return res.status(400).json({ error: 'Ukuran tidak valid.' });
  if (size > MAX_SIZE) return res.status(413).json({ error: 'Maksimal 4 GB.' });
  const id = crypto.randomBytes(12).toString('hex');
  const filePath = sessionFile(id);
  fs.writeFileSync(filePath, '');
  const s = { id, size, uploaded: 0, filename: String(req.body?.filename || 'soal.db'), startedAt: Date.now(), filePath };
  saveSession(s);
  res.json({ uploadId: id, size, offset: 0 });
});

// POST /api/admin/soal/chunk?uploadId=X&offset=N   (body = chunk binary)
router.post('/chunk', requireAdmin, express.raw({ type: () => true, limit: '20mb' }), (req, res) => {
  const id = String(req.query.uploadId || '');
  const s = loadSession(id);
  if (!s) return res.status(400).json({ error: 'Upload session tidak dikenal.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Chunk kosong.' });
  const offset = parseInt(req.query.offset, 10) || 0;
  const fd = fs.openSync(s.filePath, 'r+');
  fs.writeSync(fd, req.body, 0, req.body.length, offset);
  fs.closeSync(fd);
  s.uploaded = fs.statSync(s.filePath).size;
  saveSession(s);
  res.json({ written: s.uploaded, total: s.size, done: s.uploaded >= s.size });
});

// POST /api/admin/soal/finish  { uploadId }
router.post('/finish', requireAdmin, (req, res, next) => {
  try {
    const id = String(req.body?.uploadId || '');
    const s = loadSession(id);
    if (!s) return res.status(400).json({ error: 'Upload session tidak dikenal.' });
    if (s.uploaded < s.size) return res.status(400).json({ error: `Belum lengkap (${s.uploaded}/${s.size}).` });

    let n;
    try { n = verifySoalDb(s.filePath); }
    catch (e) {
      try { fs.unlinkSync(s.filePath); fs.unlinkSync(sessionMeta(id)); } catch {}
      return res.status(400).json({ error: e.message });
    }

    const target = path.join(DATA_DIR, 'soal.db');
    const backup = target + '.bak-' + Date.now();
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    fs.renameSync(s.filePath, target);
    try { fs.unlinkSync(sessionMeta(id)); } catch {}

    reloadBank(); // aktifkan tanpa restart

    console.log(`[upload-soal] aktif: ${n.toLocaleString('id-ID')} soal dari ${s.filename}`);
    res.json({ ok: true, rows: n, activated: true, backup: path.basename(backup) });
  } catch (e) { next(e); }
});

// GET /api/admin/soal/status
router.get('/status', requireAdmin, (req, res) => {
  let rows = 0, sizeBytes = 0, source = null;
  const target = path.join(DATA_DIR, 'soal.db');
  if (fs.existsSync(target)) {
    sizeBytes = fs.statSync(target).size;
    try {
      const db = new Database(target, { readonly: true });
      try { rows = db.prepare('SELECT COUNT(*) AS n FROM items').get().n; } catch {}
      try { source = db.prepare("SELECT v FROM meta WHERE k='source'").get()?.v || null; } catch {}
      db.close();
    } catch {}
  }
  // cek sesi upload yang tertunda
  let uploaded = null;
  try {
    for (const f of fs.readdirSync(UP_DIR)) {
      if (f.endsWith('.json')) {
        const s = JSON.parse(fs.readFileSync(path.join(UP_DIR, f), 'utf8'));
        if (s.uploaded < s.size) { uploaded = { id: s.id, uploaded: s.uploaded, size: s.size, filename: s.filename }; break; }
      }
    }
  } catch {}
  res.json({ rows, sizeBytes, source, uploaded });
});

// DELETE /api/admin/soal/cancel?uploadId=X
router.delete('/cancel', requireAdmin, (req, res) => {
  const id = String(req.query.uploadId || '');
  try { fs.unlinkSync(sessionFile(id)); } catch {}
  try { fs.unlinkSync(sessionMeta(id)); } catch {}
  res.json({ ok: true });
});

export { router as soalUploadRouter };