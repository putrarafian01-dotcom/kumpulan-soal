#!/usr/bin/env node
/**
 * Impor soal.db yang sudah jadi (hasil bangun_db_ringan.py) ke server.
 *
 * Pakai:
 *   node scripts/seed-from-db.js /path/ke/soal.db
 *
 * Atau di VPS/Coolify:
 *   docker cp soal.db cari-jawaban-soal:/tmp/soal.db
 *   docker compose exec app node scripts/seed-from-db.js /tmp/soal.db
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const src = process.argv[2];
if (!src) { console.error('Pakai: node scripts/seed-from-db.js /path/ke/soal.db'); process.exit(1); }
if (!fs.existsSync(src)) { console.error('File tidak ada:', src); process.exit(1); }

// Validasi: tabel items wajib ada
let n = 0;
try {
  const db = new Database(src, { readonly: true, fileMustExist: true });
  n = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  db.close();
} catch (e) {
  console.error('Bukan DB soal valid:', e.message);
  process.exit(1);
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
fs.mkdirSync(dataDir, { recursive: true });
const target = path.join(dataDir, 'soal.db');

if (fs.existsSync(target)) {
  const bak = target + '.bak-' + Date.now();
  fs.renameSync(target, bak);
  console.log(`Backup: ${path.basename(bak)}`);
}

fs.copyFileSync(src, target);
console.log(`✓ ${n.toLocaleString('id-ID')} soal → ${target}`);
console.log('Restart server untuk aktifkan:');
console.log('  docker compose restart    (VPS/Coolify)');
console.log('  railway restart           (Railway)');