/** Tutup dan buka ulang koneksi bank soal setelah soal.db di-swap. */
export function reloadBank() {
  if (bankDb) { try { bankDb.close(); } catch {} bankDb = null; }
  return getBankDb();
}