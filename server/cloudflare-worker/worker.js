/**
 * Beras Visualizer - Cloudflare Worker License & Telemetry API
 * Free tier: 100,000 requests/day, KV Storage 1GB (Lebih dari cukup untuk ribuan user)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Headers agar bisa diakses dari desktop Tauri maupun browser
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Endpoint: Healthcheck
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'Beras License Server' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Endpoint: Aktivasi & Kunci ke 1 Device (/api/activate)
      if (url.pathname === '/api/activate' && request.method === 'POST') {
        const body = await request.json();
        const { licensee, license_key, hwid, os, version } = body;

        if (!licensee || !license_key || !hwid) {
          return new Response(JSON.stringify({ success: false, error: 'Parameter tidak lengkap.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const cleanId = licensee.trim().toLowerCase();
        const cleanKey = license_key.trim();

        // Ambil data binding lisensi dari KV
        const kvKey = `lic:${cleanId}`;
        const existingDataStr = await env.LICENSES.get(kvKey);

        let licenseData = existingDataStr ? JSON.parse(existingDataStr) : null;

        if (licenseData) {
          // Jika lisensi sudah pernah aktif di perangkat lain
          if (licenseData.bound_hwid && licenseData.bound_hwid !== hwid) {
            return new Response(JSON.stringify({
              success: false,
              error: `Lisensi ini sudah terikat pada perangkat lain (${licenseData.os || 'Lainnya'}). Hubungi developer jika ingin memindahkan ke laptop baru.`
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Update heartbeat & OS info
          licenseData.last_active = new Date().toISOString();
          licenseData.version = version;
          licenseData.activations_count = (licenseData.activations_count || 1) + 1;
        } else {
          // Binding pertama kali (Otomatis mengunci ke device ini)
          licenseData = {
            licensee: cleanId,
            license_key: cleanKey,
            bound_hwid: hwid,
            os: os || 'unknown',
            version: version || 'unknown',
            first_activated: new Date().toISOString(),
            last_active: new Date().toISOString(),
            activations_count: 1
          };
        }

        // Simpan ke KV
        await env.LICENSES.put(kvKey, JSON.stringify(licenseData));

        return new Response(JSON.stringify({
          success: true,
          message: 'Lisensi berhasil diverifikasi dan terikat pada perangkat ini.',
          licensee: cleanId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. Endpoint: Heartbeat untuk Melacak User yang Sedang Aktif (/api/heartbeat)
      if (url.pathname === '/api/heartbeat' && request.method === 'POST') {
        const body = await request.json();
        const { licensee, hwid, version, os } = body;

        if (!licensee || !hwid) {
          return new Response(JSON.stringify({ success: false }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const cleanId = licensee.trim().toLowerCase();
        const kvKey = `lic:${cleanId}`;
        const existingDataStr = await env.LICENSES.get(kvKey);

        if (existingDataStr) {
          const licenseData = JSON.parse(existingDataStr);
          
          // Deteksi pemakaian ganda / pembajakan key
          if (licenseData.bound_hwid && licenseData.bound_hwid !== hwid) {
            return new Response(JSON.stringify({
              success: false,
              is_valid: false,
              error: 'Lisensi digunakan pada perangkat yang tidak diizinkan.'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          licenseData.last_active = new Date().toISOString();
          licenseData.version = version || licenseData.version;
          licenseData.os = os || licenseData.os;
          await env.LICENSES.put(kvKey, JSON.stringify(licenseData));
        }

        return new Response(JSON.stringify({ success: true, is_valid: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 4. Endpoint: Dashboard Pemilik untuk Melihat Siapa Saja yang Aktif (/api/admin/users)
      if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        const secretHeader = request.headers.get('X-Admin-Secret') || url.searchParams.get('secret');
        const expectedSecret = env.ADMIN_SECRET || 'beras_rahasia_admin_2026';

        if (secretHeader !== expectedSecret) {
          return new Response(JSON.stringify({ error: 'Unauthorized: Masukkan secret admin yang benar.' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // List semua lisensi
        const list = await env.LICENSES.list({ prefix: 'lic:' });
        const users = [];

        for (const key of list.keys) {
          const val = await env.LICENSES.get(key.name);
          if (val) {
            const data = JSON.parse(val);
            // Cek apakah user aktif dalam 15 menit terakhir
            const lastActiveTime = new Date(data.last_active).getTime();
            const now = Date.now();
            const isCurrentlyActive = (now - lastActiveTime) < (15 * 60 * 1000);

            users.push({
              ...data,
              is_currently_active: isCurrentlyActive
            });
          }
        }

        // Urutkan berdasarkan waktu aktif terbaru
        users.sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime());

        // Jika user membuka dari browser biasa, tampilkan tabel HTML yang elegan
        if (request.headers.get('Accept')?.includes('text/html') || url.searchParams.get('format') === 'html') {
          return new Response(renderAdminHtml(users, expectedSecret), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }

        return new Response(JSON.stringify({
          total_users: users.length,
          active_now: users.filter(u => u.is_currently_active).length,
          users
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 5. Endpoint: Reset Binding Device jika user ganti komputer (/api/admin/reset)
      if (url.pathname === '/api/admin/reset' && request.method === 'POST') {
        const secretHeader = request.headers.get('X-Admin-Secret');
        const expectedSecret = env.ADMIN_SECRET || 'beras_rahasia_admin_2026';

        if (secretHeader !== expectedSecret) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const { licensee } = body;
        const cleanId = licensee.trim().toLowerCase();
        const kvKey = `lic:${cleanId}`;
        const existing = await env.LICENSES.get(kvKey);

        if (!existing) {
          return new Response(JSON.stringify({ error: 'User tidak ditemukan' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = JSON.parse(existing);
        data.bound_hwid = null; // Unbind device
        await env.LICENSES.put(kvKey, JSON.stringify(data));

        return new Response(JSON.stringify({ success: true, message: `Device binding untuk ${cleanId} telah di-reset.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

function renderAdminHtml(users, secret) {
  const activeCount = users.filter(u => u.is_currently_active).length;
  const rows = users.map(u => `
    <tr class="border-b border-neutral-800 hover:bg-neutral-800/50">
      <td class="p-3">
        <span class="inline-flex items-center gap-1.5 font-medium ${u.is_currently_active ? 'text-emerald-400' : 'text-neutral-400'}">
          <span class="w-2 h-2 rounded-full ${u.is_currently_active ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}"></span>
          ${u.is_currently_active ? 'Sedang Online' : 'Offline'}
        </span>
      </td>
      <td class="p-3 font-semibold text-white">${u.licensee}</td>
      <td class="p-3 font-mono text-xs text-neutral-400">${u.bound_hwid ? u.bound_hwid.substring(0, 16) + '...' : '<span class="text-amber-400">Belum Terikat</span>'}</td>
      <td class="p-3 text-xs text-neutral-300">${u.os} (v${u.version})</td>
      <td class="p-3 text-xs text-neutral-400">${new Date(u.last_active).toLocaleString('id-ID')}</td>
      <td class="p-3">
        <button onclick="resetDevice('${u.licensee}')" class="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-xs rounded border border-amber-500/30 cursor-pointer">
          Reset Device
        </button>
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Beras Visualizer - User Tracking Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-neutral-950 text-neutral-100 min-h-screen p-6 font-sans">
      <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <h1 class="text-xl font-bold text-white flex items-center gap-2">
              🌾 Beras Visualizer — Real-time User Tracking
            </h1>
            <p class="text-xs text-neutral-400 mt-1">Pantau user yang sedang aktif dan perangkat yang terikat lisensi</p>
          </div>
          <div class="flex gap-3">
            <div class="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-center">
              <div class="text-[10px] text-neutral-500 uppercase font-semibold">Total Lisensi</div>
              <div class="text-lg font-bold text-white">${users.length}</div>
            </div>
            <div class="bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-4 py-2 text-center">
              <div class="text-[10px] text-emerald-400 uppercase font-semibold">Sedang Online</div>
              <div class="text-lg font-bold text-emerald-300">${activeCount}</div>
            </div>
          </div>
        </div>

        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-neutral-950/80 text-neutral-400 uppercase text-[10px] border-b border-neutral-800">
              <tr>
                <th class="p-3">Status</th>
                <th class="p-3">Email / Username</th>
                <th class="p-3">Device HWID</th>
                <th class="p-3">Platform</th>
                <th class="p-3">Aktivitas Terakhir</th>
                <th class="p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows : '<tr><td colspan="6" class="p-6 text-center text-neutral-500">Belum ada user yang aktif.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <script>
        async function resetDevice(licensee) {
          if (!confirm('Yakin ingin mereset device untuk ' + licensee + '? User akan bisa login di laptop baru.')) return;
          const res = await fetch('/api/admin/reset', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Secret': '${secret}'
            },
            body: JSON.stringify({ licensee })
          });
          const json = await res.json();
          alert(json.message || json.error);
          location.reload();
        }
      </script>
    </body>
    </html>
  `;
}
