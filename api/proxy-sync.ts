export default async function handler(req: any, res: any) {
  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { appsScriptUrl, payload } = body;

    if (!appsScriptUrl) {
      return res.status(400).json({
        status: 'error',
        message: 'URL Google Apps Script kosong atau tidak valid.'
      });
    }

    const cleanUrl = String(appsScriptUrl).trim();

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return res.status(400).json({
        status: 'error',
        message: 'URL Google Apps Script harus diawali dengan http:// atau https://'
      });
    }

    if (cleanUrl.includes('docs.google.com/spreadsheets')) {
      return res.status(400).json({
        status: 'error',
        message: 'Tampaknya Anda memasukkan URL Google Spreadsheet, bukan URL Web App Google Apps Script. Silakan buka menu "Panduan" di aplikasi ini untuk petunjuk lengkap.'
      });
    }

    if (cleanUrl.includes('drive.google.com')) {
      return res.status(400).json({
        status: 'error',
        message: 'Tampaknya Anda memasukkan URL Google Drive, bukan URL Web App Google Apps Script.'
      });
    }

    if (cleanUrl.includes('script.google.com') && !cleanUrl.includes('/exec')) {
      return res.status(400).json({
        status: 'error',
        message: 'URL yang dimasukkan adalah URL Editor Script atau draf, bukan URL Web App yang aktif. Silakan lakukan deployment ulang di editor Apps Script Anda: Terapkan > Deployment Baru > Aplikasi Web, setel akses ke "Siapa saja" (Anyone).'
      });
    }

    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let customMessage = `Gagal terhubung ke Google Apps Script (HTTP Status: ${response.status}).`;
      if (response.status === 401 || response.status === 403) {
        customMessage = 'Koneksi Ditolak (HTTP 401/403). Pastikan Apps Script Anda sudah di-deploy sebagai Aplikasi Web (Web App), setelan "Who has access" adalah "Anyone" (Siapa saja), dan dijalankan sebagai "Me" (Saya).';
      } else if (response.status === 404) {
        customMessage = 'URL Google Apps Script tidak ditemukan (HTTP 404). Pastikan URL yang disalin sudah benar dan lengkap.';
      }
      return res.status(400).json({
        status: 'error',
        message: customMessage,
        detail: errorText.substring(0, 300)
      });
    }

    const rawText = await response.text();

    if (rawText.trim().startsWith('<!DOCTYPE html') || rawText.trim().startsWith('<html') || rawText.includes('<script')) {
      return res.status(400).json({
        status: 'error',
        message: 'Google Apps Script mengembalikan halaman HTML (Login/Error). Pastikan skrip sudah dideploy sebagai Web App dengan akses "Anyone" (Siapa saja) dan dijalankan sebagai "Me" (Saya).'
      });
    }

    try {
      const jsonResult = JSON.parse(rawText);
      return res.status(200).json(jsonResult);
    } catch (jsonErr: any) {
      return res.status(400).json({
        status: 'error',
        message: 'Format data dari Google Apps Script tidak valid (Bukan JSON). Pastikan skrip dijalankan dengan benar.',
        detail: rawText.substring(0, 200)
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: `Terjadi kesalahan saat memproses permintaan sinkronisasi di Vercel: ${error.message}`
    });
  }
}
