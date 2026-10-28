(function () {
  'use strict';

  // DOM Elements
  const navLinks = document.querySelectorAll('.nav-link');
  const viewPanels = document.querySelectorAll('.view-panel');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const dropzoneIdle = document.getElementById('dropzoneIdle');
  const dropzoneUploading = document.getElementById('dropzoneUploading');
  const gaugeBar = document.getElementById('gaugeBar');
  const gaugePercent = document.getElementById('gaugePercent');
  const uploadFileName = document.getElementById('uploadFileName');
  const uploadBytes = document.getElementById('uploadBytes');
  const recentList = document.getElementById('recentList');
  const emptyNotice = document.getElementById('emptyNotice');
  const vaultCounter = document.getElementById('vaultCounter');

  // Documentation Elements
  const docTabs = document.querySelectorAll('.tab-btn');
  const docSections = document.querySelectorAll('.doc-view-section');
  const codeTabs = document.querySelectorAll('.code-tab-btn');
  const codeSnippet = document.getElementById('codeSnippet');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const copyBaseUrlBtn = document.getElementById('copyBaseUrlBtn');
  const baseUrlDisplay = document.getElementById('baseUrlDisplay');

  // State
  let recentFiles = [];
  const origin = window.location.origin;

  // Initialize Base URL in Docs
  if (baseUrlDisplay) {
    baseUrlDisplay.textContent = origin + '/';
  }

  // Format Bytes Utility
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Code Snippets for API Docs
  const codeExamples = {
    curl: `curl -X POST ${origin}/upload \\\n  -F "file=@/path/to/archive.zip"`,
    js: `const formData = new FormData();\nformData.append('file', fileInput.files[0]);\n\nconst response = await fetch('${origin}/upload', {\n  method: 'POST',\n  body: formData\n});\nconst result = await response.json();\nconsole.log(result.url);`,
    python: `import requests\n\nurl = '${origin}/upload'\nfiles = {'file': open('archive.zip', 'rb')}\nres = requests.post(url, files=files)\nprint(res.json())`,
    go: `package main\n\nimport (\n\t"bytes"\n\t"fmt"\n\t"io"\n\t"mime/multipart"\n\t"net/http"\n\t"os"\n)\n\nfunc main() {\n\tfile, _ := os.Open("archive.zip")\n\tdefer file.Close()\n\tbody := &bytes.Buffer{}\n\twriter := multipart.NewWriter(body)\n\tpart, _ := writer.CreateFormFile("file", "archive.zip")\n\tio.Copy(part, file)\n\twriter.Close()\n\treq, _ := http.NewRequest("POST", "${origin}/upload", body)\n\treq.Header.Set("Content-Type", writer.FormDataContentType())\n\tresp, _ := http.DefaultClient.Do(req)\n\tdefer resp.Body.Close()\n\tres, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(res))\n}`
  };

  // View Navigation
  function switchView(targetView) {
    navLinks.forEach((link) => {
      const isTarget = link.getAttribute('data-view') === targetView;
      link.classList.toggle('active', isTarget);
    });

    viewPanels.forEach((panel) => {
      if (panel.id === `view-${targetView}`) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });

    if (history.pushState) {
      const newPath = targetView === 'home' ? '/' : `/${targetView}`;
      if (window.location.pathname !== newPath) {
        history.pushState(null, '', newPath);
      }
    }
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-view');
      switchView(target);
    });
  });

  // Handle Initial Route from URL
  if (window.location.pathname.includes('dokumentasi')) {
    switchView('docs');
  }

  // Documentation Sub-Tabs
  docTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-doc-tab');
      docTabs.forEach((b) => b.classList.toggle('active', b === btn));
      docSections.forEach((sec) => {
        sec.toggleAttribute('hidden', sec.getAttribute('data-doc-sec') !== tab);
      });
    });
  });

  // Code Language Switcher
  codeTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      codeTabs.forEach((b) => b.classList.toggle('active', b === btn));
      if (codeSnippet && codeExamples[lang]) {
        codeSnippet.textContent = codeExamples[lang];
      }
    });
  });

  // Copy Code Snippet
  if (copyCodeBtn && codeSnippet) {
    copyCodeBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeSnippet.textContent).then(() => {
        const originalText = copyCodeBtn.innerHTML;
        copyCodeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Disalin';
        setTimeout(() => {
          copyCodeBtn.innerHTML = originalText;
        }, 2000);
      });
    });
  }

  // Copy Base URL
  if (copyBaseUrlBtn && baseUrlDisplay) {
    copyBaseUrlBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(baseUrlDisplay.textContent).then(() => {
        copyBaseUrlBtn.classList.add('copied');
        setTimeout(() => {
          copyBaseUrlBtn.classList.remove('copied');
        }, 2000);
      });
    });
  }

  // Drag and Drop Logic
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-active');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-active');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileUpload(fileInput.files[0]);
    }
  });

  // Upload Handler with Real Progress Gauge
  function handleFileUpload(file) {
    if (!file) return;

    // Switch UI to Uploading
    dropzoneIdle.setAttribute('hidden', '');
    dropzoneUploading.removeAttribute('hidden');
    uploadFileName.textContent = file.name;
    uploadBytes.textContent = `0 B / ${formatBytes(file.size)}`;
    gaugePercent.textContent = '0%';
    gaugeBar.style.strokeDashoffset = '280';

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

    // Track real progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        gaugePercent.textContent = `${pct}%`;
        const offset = 280 - (pct / 100 * 280);
        gaugeBar.style.strokeDashoffset = offset.toString();
        uploadBytes.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
      }
    });

    xhr.addEventListener('load', () => {
      dropzoneUploading.setAttribute('hidden', '');
      dropzoneIdle.removeAttribute('hidden');
      fileInput.value = '';

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success) {
            addRecentFile(res);
          } else {
            alert('Gagal mengunggah: ' + (res.error || 'Terjadi kesalahan'));
          }
        } catch (err) {
          alert('Format respon server tidak valid.');
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          alert('Upload gagal: ' + (errRes.error || `HTTP ${xhr.status}`));
        } catch (e) {
          alert(`Upload gagal dengan status HTTP ${xhr.status}`);
        }
      }
    });

    xhr.addEventListener('error', () => {
      dropzoneUploading.setAttribute('hidden', '');
      dropzoneIdle.removeAttribute('hidden');
      fileInput.value = '';
      alert('Koneksi terputus saat mengunggah berkas.');
    });

    xhr.send(formData);
  }

  // Manage Recent Files
  function addRecentFile(file) {
    recentFiles.unshift(file);
    if (recentFiles.length > 50) recentFiles.pop();

    try {
      localStorage.setItem('vall_cdn_vault', JSON.stringify(recentFiles));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }

    renderRecentFiles();
  }

  function renderRecentFiles() {
    if (!recentList) return;

    if (vaultCounter) {
      vaultCounter.textContent = `${recentFiles.length} berkas tercatat`;
    }

    if (recentFiles.length === 0) {
      if (emptyNotice) emptyNotice.removeAttribute('hidden');
      recentList.innerHTML = '';
      return;
    }

    if (emptyNotice) emptyNotice.setAttribute('hidden', '');
    recentList.innerHTML = '';

    recentFiles.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'file-row';

      const isImage = file.mimeType && file.mimeType.startsWith('image/');
      const iconContent = isImage
        ? `<img class="file-thumb" src="${file.url}" alt="${file.fileName}" loading="lazy" />`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="width:20px;height:20px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

      item.innerHTML = `
        <div class="file-preview-box">
          ${iconContent}
        </div>
        <div class="file-meta-col">
          <div class="file-name-row">
            <span class="file-name-text" title="${file.fileName}">${file.fileName}</span>
            <span class="file-id-badge">ID:${file.fileId}</span>
          </div>
          <div class="file-stats-row">
            <span class="num">${formatBytes(file.size)}</span>
            <span class="file-url-code">${file.url}</span>
          </div>
        </div>
        <div class="action-cluster">
          <button type="button" class="action-btn btn-copy-url" title="Salin URL berkas" aria-label="Salin URL">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            URL
          </button>
          <a href="${file.url}" target="_blank" rel="noopener noreferrer" class="action-btn action-btn-primary" title="Buka tautan langsung" aria-label="Buka berkas">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Buka
          </a>
        </div>
      `;

      // Copy Button Event
      const copyBtn = item.querySelector('.btn-copy-url');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(file.url).then(() => {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Disalin`;
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> URL`;
          }, 2000);
        });
      });

      recentList.appendChild(item);
    });
  }

  // Load Initial Recent Files from Server & Local Storage
  function loadInitialFiles() {
    try {
      const stored = localStorage.getItem('vall_cdn_vault');
      if (stored) {
        recentFiles = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }

    // Fetch from server to sync
    fetch('/api/files')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && Array.isArray(data.files) && data.files.length > 0) {
          const map = new Map();
          data.files.forEach((f) => map.set(f.fileId, f));
          recentFiles.forEach((f) => map.set(f.fileId, f));
          recentFiles = Array.from(map.values());
        }
        renderRecentFiles();
      })
      .catch(() => {
        renderRecentFiles();
      });
  }

  loadInitialFiles();
})();
