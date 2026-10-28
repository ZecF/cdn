const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy for Heroku SSL/HTTPS detection
app.set('trust proxy', 1);

// Storage configuration (local fallback + temp directory)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(os.tmpdir(), 'vall_cdn_temp');
const META_FILE = path.join(__dirname, 'uploads_meta.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// MongoDB Atlas Configuration (Heroku persistent storage via GridFS)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://dimasryanjr_db_user:dimasugesti@cluster0.yyngy7.mongodb.net/vall_cdn?appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB || 'vall_cdn';

let mongoClient = null;
let mongoDb = null;
let gridFSBucket = null;
let isMongoActive = false;

// Connect to MongoDB Atlas
async function initMongo() {
  try {
    console.log('[Vall CDN] Connecting to MongoDB Atlas...');
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(DB_NAME);
    gridFSBucket = new GridFSBucket(mongoDb, { bucketName: 'uploads' });
    isMongoActive = true;
    console.log('[Vall CDN] MongoDB Atlas connected! Persistent storage via GridFS is active.');
  } catch (err) {
    console.warn('[Vall CDN] MongoDB connection failed, using local filesystem fallback:', err.message);
    isMongoActive = false;
  }
}

// Local metadata helpers
function loadMetadata() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read metadata:', err);
  }
  return [];
}

function saveMetadata(metaList) {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(metaList.slice(-200), null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save metadata:', err);
  }
}

// Generate secure random short ID (alphanumeric 10 chars)
function generateFileId(length = 10) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// Multer storage engine using temp disk stream
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = generateFileId(10);
    const finalName = `${id}${ext}`;
    file.generatedId = id;
    file.savedFilename = finalName;
    cb(null, `${id}_temp_${Date.now()}${ext}`);
  }
});

// Configure upload limits (2GB max)
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MIME Type Map
const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed'
};

function getMimeType(filename, defaultMime) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || defaultMime || 'application/octet-stream';
}

// Upload Endpoint: Stores permanently to MongoDB GridFS or local disk
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File too large. Maximum size is 2.00GB'
        });
      }
      return res.status(400).json({
        success: false,
        error: `Upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(500).json({
        success: false,
        error: `Server error: ${err.message}`
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided. Ensure field name is "file".'
      });
    }

    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;
    const fileUrl = `${baseUrl}/f/${req.file.savedFilename}`;
    const directUrl = `${baseUrl}/${req.file.savedFilename}`;
    const mimeType = getMimeType(req.file.savedFilename, req.file.mimetype);

    const tempFilePath = req.file.path;

    try {
      if (isMongoActive && gridFSBucket) {
        // Store permanently in MongoDB Atlas via GridFS
        const uploadStream = gridFSBucket.openUploadStream(req.file.savedFilename, {
          metadata: {
            fileId: req.file.generatedId,
            fileName: req.file.originalname,
            savedFilename: req.file.savedFilename,
            size: req.file.size,
            mimeType: mimeType,
            uploadedAt: new Date().toISOString()
          }
        });

        await new Promise((resolve, reject) => {
          fs.createReadStream(tempFilePath)
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve);
        });

        // Clean up temp file
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        return res.status(200).json({
          success: true,
          url: fileUrl,
          directUrl: directUrl,
          fileName: req.file.originalname,
          fileId: req.file.generatedId,
          size: req.file.size,
          mimeType: mimeType,
          storage: 'mongodb-atlas'
        });
      } else {
        // Local storage fallback
        const targetPath = path.join(UPLOADS_DIR, req.file.savedFilename);
        fs.renameSync(tempFilePath, targetPath);

        const fileRecord = {
          fileId: req.file.generatedId,
          fileName: req.file.originalname,
          savedFilename: req.file.savedFilename,
          size: req.file.size,
          mimeType: mimeType,
          url: fileUrl,
          directUrl: directUrl,
          uploadedAt: new Date().toISOString()
        };

        const list = loadMetadata();
        list.unshift(fileRecord);
        saveMetadata(list);

        return res.status(200).json({
          success: true,
          url: fileUrl,
          directUrl: directUrl,
          fileName: fileRecord.fileName,
          fileId: fileRecord.fileId,
          size: fileRecord.size,
          mimeType: fileRecord.mimeType,
          storage: 'local'
        });
      }
    } catch (saveErr) {
      console.error('Save file error:', saveErr);
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.status(500).json({
        success: false,
        error: `Failed to persist file: ${saveErr.message}`
      });
    }
  });
});

// Stream File with HTTP Range support (GridFS + Local)
async function streamFile(req, res, filename) {
  const safeFilename = path.basename(filename);
  const range = req.headers.range;

  // 1. Try MongoDB Atlas GridFS first
  if (isMongoActive && mongoDb && gridFSBucket) {
    try {
      const fileDoc = await mongoDb.collection('uploads.files').findOne({ filename: safeFilename });
      if (fileDoc) {
        const fileSize = fileDoc.length;
        const mimeType = fileDoc.metadata?.mimeType || getMimeType(safeFilename);

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize) {
            res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
          }

          const chunksize = (end - start) + 1;
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Content-Length', chunksize);

          const downloadStream = gridFSBucket.openDownloadStreamByName(safeFilename, {
            start: start,
            end: end + 1
          });
          return downloadStream.pipe(res);
        } else {
          res.setHeader('Content-Length', fileSize);
          return gridFSBucket.openDownloadStreamByName(safeFilename).pipe(res);
        }
      }
    } catch (err) {
      console.error('GridFS stream error:', err);
    }
  }

  // 2. Fallback to Local Disk
  const filePath = path.join(UPLOADS_DIR, safeFilename);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const contentType = getMimeType(safeFilename);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = (end - start) + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);

      const stream = fs.createReadStream(filePath, { start, end });
      return stream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  return res.status(404).send('404: File not found');
}

// File delivery routes
app.get('/f/:filename', (req, res) => {
  streamFile(req, res, req.params.filename);
});

app.get('/:filename', (req, res, next) => {
  const filename = req.params.filename;
  if (filename === 'dokumentasi' || filename === 'about') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  if (path.extname(filename)) {
    return streamFile(req, res, filename);
  }
  next();
});

// Get recent files list (MongoDB + Local fallback)
app.get('/api/files', async (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  if (isMongoActive && mongoDb) {
    try {
      const docs = await mongoDb.collection('uploads.files')
        .find()
        .sort({ uploadDate: -1 })
        .limit(50)
        .toArray();

      const files = docs.map(doc => ({
        fileId: doc.metadata?.fileId || doc.filename.split('.')[0],
        fileName: doc.metadata?.fileName || doc.filename,
        savedFilename: doc.filename,
        size: doc.length,
        mimeType: doc.metadata?.mimeType || getMimeType(doc.filename),
        url: `${baseUrl}/f/${doc.filename}`,
        directUrl: `${baseUrl}/${doc.filename}`,
        uploadedAt: doc.uploadDate
      }));

      return res.json({
        success: true,
        count: files.length,
        files: files,
        storage: 'mongodb-atlas'
      });
    } catch (e) {
      console.error('Failed to query Mongo files:', e);
    }
  }

  const list = loadMetadata();
  return res.json({
    success: true,
    count: list.length,
    files: list.slice(0, 50),
    storage: 'local'
  });
});

// Service info & stats
app.get('/api/info', async (req, res) => {
  let totalFiles = 0;
  let totalBytes = 0;

  if (isMongoActive && mongoDb) {
    try {
      const count = await mongoDb.collection('uploads.files').countDocuments();
      const stats = await mongoDb.collection('uploads.files').aggregate([
        { $group: { _id: null, totalSize: { $sum: '$length' } } }
      ]).toArray();
      totalFiles = count;
      totalBytes = stats[0]?.totalSize || 0;
    } catch (e) {
      console.error('Mongo stats error:', e);
    }
  } else {
    const list = loadMetadata();
    totalFiles = list.length;
    totalBytes = list.reduce((acc, f) => acc + (f.size || 0), 0);
  }

  res.json({
    siteName: 'Vall CDN',
    slogan: 'High-Speed Edge Asset Distribution & File Vault',
    storageEngine: isMongoActive ? 'MongoDB Atlas (GridFS Permanent)' : 'Local Ephemeral',
    maxUploadSizeMB: 2048,
    totalFiles: totalFiles,
    totalBytesUsed: totalBytes,
    status: 'operational',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Delete file endpoint
app.delete('/api/files/:fileId', async (req, res) => {
  const targetId = req.params.fileId;

  if (isMongoActive && mongoDb && gridFSBucket) {
    try {
      const fileDoc = await mongoDb.collection('uploads.files').findOne({
        $or: [
          { filename: targetId },
          { 'metadata.fileId': targetId },
          { 'metadata.savedFilename': targetId }
        ]
      });

      if (fileDoc) {
        await gridFSBucket.delete(fileDoc._id);
        return res.json({ success: true, message: 'File deleted from MongoDB Atlas GridFS' });
      }
    } catch (e) {
      console.error('Mongo delete error:', e);
    }
  }

  const list = loadMetadata();
  const index = list.findIndex(f => f.fileId === targetId || f.savedFilename === targetId);
  if (index !== -1) {
    const [removed] = list.splice(index, 1);
    const filePath = path.join(UPLOADS_DIR, removed.savedFilename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    saveMetadata(list);
    return res.json({ success: true, message: 'File deleted from local disk' });
  }

  return res.status(404).json({ success: false, error: 'File not found' });
});

// Fallback to index.html for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Boot server & Mongo
initMongo().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Vall CDN] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Vall CDN] Upload endpoint: POST http://0.0.0.0:${PORT}/upload (field: "file")`);
    console.log(`[Vall CDN] Storage Engine: ${isMongoActive ? 'MongoDB Atlas GridFS (Permanent)' : 'Local FileSystem'}`);
  });
});
