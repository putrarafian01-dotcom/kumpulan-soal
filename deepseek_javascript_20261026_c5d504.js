// ====== UPLOAD soal.db (chunked + resumable) ======
const CHUNK_SOAL = 8 * 1024 * 1024; // 8 MB
async function soalStatus(){
  try {
    const s = await api('/api/admin/soal/status');
    const mb = (s.sizeBytes / 1048576).toFixed(1);
    let txt = `Aktif: <b style="color:#eef2fb">${s.rows.toLocaleString('id-ID')}</b> soal · ${mb} MB` + (s.source ? ` · sumber: ${esc(s.source)}` : '');
    if (s.uploaded) txt += `<br><span style="color:#fcd34d">⏸ Upload tertunda: ${esc(s.uploaded.filename)} (${(s.uploaded.uploaded/1048576).toFixed(1)}/${(s.uploaded.size/1048576).toFixed(1)} MB) — klik Upload lagi untuk lanjut</span>`;
    $('soalInfo').innerHTML = txt;
    return s;
  } catch(e){ $('soalInfo').textContent = e.message; return null; }
}
async function uploadSoalFile(file){
  $('soalMsg').className = 'msg'; $('soalMsg').textContent = 'Memulai…';
  show($('soalProg'), true); $('soalProgBar').style.width = '0%';
  $('btnUploadSoal').disabled = true;
  try {
    // Cek sesi tertunda (resume)
    const st = await soalStatus();
    let uploadId, offset = 0;
    if (st && st.uploaded && st.uploaded.size === file.size) {
      uploadId = st.uploaded.id; offset = st.uploaded.uploaded;
      $('soalMsg').textContent = `Lanjut dari ${(offset/1048576).toFixed(1)} MB…`;
    } else {
      const s = await api('/api/admin/soal/start', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ size: file.size, filename: file.name }) });
      uploadId = s.uploadId;
    }
    while (offset < file.size) {
      const slice = file.slice(offset, Math.min(offset + CHUNK_SOAL, file.size));
      const buf = await slice.arrayBuffer();
      const r = await api(`/api/admin/soal/chunk?uploadId=${uploadId}&offset=${offset}`, { method:'POST', headers:{'content-type':'application/octet-stream'}, body: buf });
      offset = r.written;
      const pct = Math.round(offset / file.size * 100);
      $('soalProgBar').style.width = pct + '%';
      $('soalMsg').textContent = `Mengunggah ${pct}% (${(offset/1048576).toFixed(1)} / ${(file.size/1048576).toFixed(1)} MB)`;
    }
    $('soalMsg').textContent = 'Memverifikasi & mengaktifkan…';
    const fin = await api('/api/admin/soal/finish', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ uploadId }) });
    $('soalMsg').className = 'msg ok';
    $('soalMsg').textContent = `✅ Aktif! ${fin.rows.toLocaleString('id-ID')} soal. Semua pengunjung langsung dapat update.`;
    await soalStatus();
    await syncCounts();
    if ($('q').value.trim()) run(false);
  } catch(e){
    $('soalMsg').className = 'msg err';
    $('soalMsg').textContent = 'Gagal: ' + e.message + (e.message.includes('lengkap') ? ' — klik Upload lagi untuk lanjut.' : '');
  }
  $('btnUploadSoal').disabled = false;
  setTimeout(() => show($('soalProg'), false), 1500);
}
document.addEventListener('DOMContentLoaded', () => {
  $('btnUploadSoal').onclick = () => {
    const f = $('soalFile').files[0];
    if (!f) return $('soalMsg').textContent = 'Pilih file soal.db dulu.';
    if (!/\.db$/i.test(f.name)) return $('soalMsg').textContent = 'File harus .db';
    uploadSoalFile(f);
  };
});
// Panggil soalStatus saat panel admin dibuka
document.getElementById('btnAdmin').addEventListener('click', () => setTimeout(soalStatus, 100));