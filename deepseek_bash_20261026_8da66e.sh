npm i -g @railway/cli
railway login
railway link                     # pilih project Anda
railway volume add -m /data      # sekali saja
railway run -- bash -c "cat > /data/soal.db" < soal.db
# restart service di dashboard Railway