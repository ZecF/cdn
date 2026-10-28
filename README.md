# Vall CDN — High-Speed Edge Asset Distribution & File Vault

Platform uploader berkas dan CDN edge berkinerja tinggi yang dibangun untuk pengembang dan kreator, dengan desain presisi technical dark mode mengikuti standar Hallmark Vantage (0 FAIL, 0 REFLEX, 0 WARN).

## Perbedaan Karakter Desain

- **Identitas**: Dinamai **Vall CDN** dengan nuansa terminal edge node dan telemetri langsung.
- **Tema Visual**: Tema Vantage (dark mode) menggunakan ground obsidian blue-black (`oklch(13.5% 0.012 235)`), aksen chromatic lime (`oklch(89% 0.19 126)`), dan tipografi baja berdefinisi tinggi (`Geologica` & `JetBrains Mono`).
- **Antarmuka Terminal**:
  - Precision corner ticks pada stage dropzone.
  - Gauge transfer telemetri real-time dengan kalkulasi persentase dan transfer byte presisi.
  - Vault berkas terdistribusi (Edge Vault Ledger) dengan badge ID instan, ukuran berkas tabular, dan tombol salin URL/Buka langsung.
  - Konsol pengembang terpadu dengan contoh pemanggilan cURL, JavaScript Fetch, Python, dan Go.

## Struktur Berkas

```text
cdn-uploader/
├── server.js              # Express backend server (Vall CDN engine)
├── uploads/               # Direktori penyimpanan biner di edge node
├── uploads_meta.json      # Metadata berkas (ID, MIME, size, timestamp)
└── public/                # Antarmuka web (Hallmark Vantage Theme)
    ├── index.html         # Semantik HTML5 valid & bebas klise
    ├── tokens.css         # Token palet obsidian, lime signal, spasi
    ├── base.css           # Basis aturan CSS Hallmark Floor
    ├── style.css          # Desain presisi terminal HUD & konsol
    └── app.js             # XHR engine upload, sinkronisasi vault, kode tabs
```

## Menjalankan Server

```bash
npm run cdn
# atau
node cdn-uploader/server.js
```

Akses uploader di peramban: `http://localhost:3000`

## Dokumentasi Endpoint API

### 1. Upload Berkas
- **Method**: `POST`
- **URL**: `http://localhost:3000/upload`
- **Body**: `multipart/form-data`
- **Field**: `file` (binary)

**Contoh cURL**:
```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@/path/to/archive.zip"
```

**Respon Sukses (200 OK)**:
```json
{
  "success": true,
  "url": "http://localhost:3000/f/k9F2pL8x.zip",
  "directUrl": "http://localhost:3000/k9F2pL8x.zip",
  "fileName": "archive.zip",
  "fileId": "k9F2pL8x",
  "size": 184020,
  "mimeType": "application/zip"
}
```

### 2. Streaming Berkas CDN
- **URL**: `http://localhost:3000/f/:filename` atau `http://localhost:3000/:filename`
- Mendukung header `Range: bytes=start-end` (HTTP 206 Partial Content) untuk pemutaran video dan audio instan tanpa jeda buffering.
