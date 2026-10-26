# salin file ke VPS (SCP)
scp soal.db root@IP-VPS:/tmp/soal.db

# impor + restart
cd /opt/cari-jawaban-soal
docker compose exec app node scripts/seed-from-db.js /tmp/soal.db
docker compose restart