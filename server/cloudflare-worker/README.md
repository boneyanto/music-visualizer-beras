# 🌾 Beras Visualizer — Cloudflare Worker (100% Gratis)

Sistem pelacakan user aktif, verifikasi lisensi, dan penguncian 1 perangkat (Single-Device Lock) tanpa menanyakan HWID ke user.

---

## 🚀 Fitur Worker Ini:
1. **Silent Auto-Lock (1 Device)**:
   - User hanya memasukkan **Email/Username** dan **Serial Key Ed25519**.
   - Aplikasi secara otomatis mengirimkan HWID di background.
   - Jika ada orang lain mencoba memasukkan Serial Key yang sama di laptop berbeda, server langsung menolak dengan pesan ramah: *"Lisensi sudah terikat di perangkat lain"*.
2. **Real-time User Tracking**:
   - Aplikasi mengirimkan heartbeat ringan setiap beberapa menit.
   - Anda tahu persis siapa saja user yang sedang membuka/merender video saat ini.
3. **Web Dashboard Bawaan**:
   - Anda bisa membuka halaman admin langsung dari browser untuk melihat daftar pengguna, status online/offline, dan tombol **"Reset Device"** jika pembeli ganti laptop.
4. **100% Gratis**:
   - Berjalan di free tier Cloudflare Worker (100.000 requests/hari dan 1 GB storage KV).

---

## 📦 Cara Deploy ke Cloudflare (Hanya 3 Menit):

### Langkah 1: Install Wrangler (jika belum ada)
```bash
npm install -g wrangler
```

### Langkah 2: Login ke Akun Cloudflare
```bash
wrangler login
```
*(Browser akan terbuka untuk konfirmasi akun gratis Cloudflare Anda).*

### Langkah 3: Buat KV Database Gratis
Jalankan perintah ini di dalam folder `server/cloudflare-worker`:
```bash
cd server/cloudflare-worker
npx wrangler kv namespace create LICENSES
```
Wrangler akan menampilkan ID namespace, contoh:
```text
[[kv_namespaces]]
binding = "LICENSES"
id = "xxxxxx123456789xxxxxx"
```
Salin baris tersebut dan tempelkan ke dalam file `wrangler.toml`.

### Langkah 4: Deploy!
```bash
npx wrangler deploy
```

Setelah deploy, Cloudflare akan memberikan URL publik gratis, contoh:
`https://beras-license-server.<username>.workers.dev`

---

## 🖥️ Cara Akses Dashboard Pemantauan Anda:
Buka di browser:
`https://beras-license-server.<username>.workers.dev/api/admin/users?secret=ganti_dengan_password_rahasia_kamu`

Anda akan melihat antarmuka web modern berisi:
- Total pengguna berlisensi
- Jumlah user yang sedang online saat ini
- Detail perangkat & sistem operasi
- Tombol Reset jika user meminta izin ganti komputer.
