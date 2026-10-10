/**
 * CapCut & JianYing Subtitle JSON to SRT Converter
 * Client-side parser, timeline editor, and multi-format exporter
 */

(function () {
  'use strict';

  // --- STATE ---
  let loadedFiles = []; // Array of { name: string, entries: Array }
  let activeFileIdx = 0;
  let activeEntries = []; // Current working entries: [{ id, startMs, endMs, text }]

  // --- DOM ELEMENTS ---
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowse = document.getElementById('btnBrowse');
  const btnLoadDemo = document.getElementById('btnLoadDemo');
  const btnPathGuide = document.getElementById('btnPathGuide');
  const pathModal = document.getElementById('pathModal');
  const btnCloseModal = document.getElementById('btnCloseModal');

  const fileTabsContainer = document.getElementById('fileTabsContainer');
  const fileTabsList = document.getElementById('fileTabsList');
  const btnBatchDownload = document.getElementById('btnBatchDownload');

  const workspace = document.getElementById('workspace');
  const statCount = document.getElementById('statCount');
  const statDuration = document.getElementById('statDuration');
  const statWords = document.getElementById('statWords');
  const statFileName = document.getElementById('statFileName');

  const searchInput = document.getElementById('searchInput');
  const searchBadge = document.getElementById('searchBadge');
  const offsetInput = document.getElementById('offsetInput');
  const btnApplyOffset = document.getElementById('btnApplyOffset');

  const btnDownloadSrt = document.getElementById('btnDownloadSrt');
  const btnDownloadVtt = document.getElementById('btnDownloadVtt');
  const btnDownloadTxt = document.getElementById('btnDownloadTxt');
  const btnCopySrt = document.getElementById('btnCopySrt');

  const subtitleTableBody = document.getElementById('subtitleTableBody');
  const btnAddSubtitle = document.getElementById('btnAddSubtitle');
  const btnClearAll = document.getElementById('btnClearAll');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // --- HELPER: TIME FORMATTERS ---
  function pad(num, size) {
    let s = num + '';
    while (s.length < size) s = '0' + s;
    return s;
  }

  function msToSrtTime(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const milli = ms % 1000;
    const s = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const m = totalMin % 60;
    const h = Math.floor(totalMin / 60);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
  }

  function msToVttTime(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const milli = ms % 1000;
    const s = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const m = totalMin % 60;
    const h = Math.floor(totalMin / 60);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(milli, 3)}`;
  }

  function msToDurationStr(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const s = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const m = totalMin % 60;
    const h = Math.floor(totalMin / 60);
    if (h > 0) {
      return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}`;
    }
    return `${pad(m, 2)}:${pad(s, 2)}s`;
  }

  function srtTimeToMs(srtStr) {
    if (!srtStr) return 0;
    const clean = srtStr.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return Math.round((h * 3600 + m * 60 + s) * 1000);
    }
    return 0;
  }

  // --- HELPER: TEXT CLEANING ---
  function cleanSubtitleText(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') {
      let str = raw.trim();
      // Case 1: CapCut stringified JSON object
      if (str.startsWith('{') && str.endsWith('}')) {
        try {
          const parsed = JSON.parse(str);
          if (parsed && typeof parsed.text !== 'undefined') {
            return cleanSubtitleText(parsed.text);
          }
        } catch (e) {
          // fallback
        }
      }
      // Case 2: XML / HTML tags (e.g. <font color="...">, <color=#...>)
      str = str.replace(/<[^>]+>/g, '');
      return str.trim();
    }
    if (typeof raw === 'object') {
      if (typeof raw.text !== 'undefined') return cleanSubtitleText(raw.text);
      if (typeof raw.content !== 'undefined') return cleanSubtitleText(raw.content);
    }
    return String(raw).trim();
  }

  // --- PARSER ENGINE ---
  function parseJsonSubtitle(jsonData) {
    let entries = [];

    // Format 1: CapCut & JianYing draft_content.json / draft_info.json
    if (jsonData && (jsonData.materials || jsonData.tracks)) {
      const materials = jsonData.materials || {};
      const textsList = (materials.texts || []).concat(materials.subtitles || []);
      const textMap = {};

      textsList.forEach(item => {
        if (!item) return;
        const id = item.id;
        const rawContent = item.content || item.text || '';
        const text = cleanSubtitleText(rawContent);
        if (id) {
          textMap[id] = text;
        }
      });

      const tracks = jsonData.tracks || [];
      tracks.forEach(track => {
        const segments = track.segments || [];
        segments.forEach(seg => {
          const matId = seg.material_id;
          if (!matId || !textMap[matId]) return;
          const text = textMap[matId];

          const timerange = seg.target_timerange || seg.source_timerange || {};
          const startUs = timerange.start || 0;
          const durUs = timerange.duration || 0;

          // CapCut time is in microseconds (1s = 1,000,000 us)
          const startMs = Math.round(startUs / 1000);
          const durMs = Math.round(durUs / 1000);
          const endMs = startMs + durMs;

          entries.push({
            id: seg.id || 'seg-' + Math.random().toString(36).substr(2, 9),
            startMs: startMs,
            endMs: endMs,
            durationMs: durMs,
            text: text
          });
        });
      });
    }

    // Format 2: OpenAI Whisper JSON {"segments": [{"start": 0.5, "end": 2.1, "text": "..."}]}
    if (entries.length === 0 && jsonData && Array.isArray(jsonData.segments)) {
      jsonData.segments.forEach((seg, idx) => {
        const text = cleanSubtitleText(seg.text);
        if (!text) return;
        const startMs = Math.round((seg.start || 0) * 1000);
        const endMs = Math.round((seg.end || 0) * 1000);
        entries.push({
          id: 'whisper-' + idx,
          startMs: startMs,
          endMs: endMs,
          durationMs: endMs - startMs,
          text: text
        });
      });
    }

    // Format 3: YouTube TimedText JSON {"events": [{"tStartMs": 100, "dDurationMs": 2000, "segs": [{"utf8": "..."}]}]}
    if (entries.length === 0 && jsonData && Array.isArray(jsonData.events)) {
      jsonData.events.forEach((evt, idx) => {
        if (!evt.segs) return;
        const text = evt.segs.map(s => s.utf8 || '').join('').trim();
        if (!text) return;
        const startMs = evt.tStartMs || 0;
        const durMs = evt.dDurationMs || 0;
        entries.push({
          id: 'yt-' + idx,
          startMs: startMs,
          endMs: startMs + durMs,
          durationMs: durMs,
          text: cleanSubtitleText(text)
        });
      });
    }

    // Format 4: Generic flat array [ {"start": 0, "end": 2.5, "text": "..."} ]
    if (entries.length === 0 && Array.isArray(jsonData)) {
      jsonData.forEach((item, idx) => {
        const text = cleanSubtitleText(item.text || item.content || item.sentence);
        if (!text) return;
        let start = item.start || item.from || 0;
        let end = item.end || item.to || 0;

        let startMs, endMs;
        if (end < 1000) {
          // Giây
          startMs = Math.round(start * 1000);
          endMs = Math.round(end * 1000);
        } else if (end > 10000000) {
          // Microseconds
          startMs = Math.round(start / 1000);
          endMs = Math.round(end / 1000);
        } else {
          // Milliseconds
          startMs = Math.round(start);
          endMs = Math.round(end);
        }

        entries.push({
          id: 'gen-' + idx,
          startMs: startMs,
          endMs: endMs,
          durationMs: endMs - startMs,
          text: text
        });
      });
    }

    // Sắp xếp thứ tự thời gian tăng dần
    entries.sort((a, b) => a.startMs - b.startMs);
    return entries;
  }

  // --- UI RENDERERS ---
  function renderSubtitleTable(filterQuery = '') {
    subtitleTableBody.innerHTML = '';
    const query = (filterQuery || '').trim().toLowerCase();
    let matchCount = 0;

    activeEntries.forEach((entry, idx) => {
      const isMatch = query === '' || entry.text.toLowerCase().includes(query);
      if (isMatch) matchCount++;

      const tr = document.createElement('tr');
      if (query !== '' && isMatch) {
        tr.classList.add('highlight-search');
      }

      const durMs = Math.max(0, entry.endMs - entry.startMs);

      tr.innerHTML = `
        <td class="cell-index">${idx + 1}</td>
        <td>
          <span class="timecode-badge start-time" contenteditable="true" data-idx="${idx}" title="Click để sửa mốc giờ">${msToSrtTime(entry.startMs)}</span>
        </td>
        <td>
          <span class="timecode-badge end-time" contenteditable="true" data-idx="${idx}" title="Click để sửa mốc giờ">${msToSrtTime(entry.endMs)}</span>
        </td>
        <td>
          <span class="duration-tag">${(durMs / 1000).toFixed(2)}s</span>
        </td>
        <td>
          <input type="text" class="text-editor-input" value="${escapeHtml(entry.text)}" data-idx="${idx}" placeholder="Nội dung phụ đề...">
        </td>
        <td class="text-center">
          <button class="btn-row-del" data-idx="${idx}" title="Xóa câu này">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      `;

      subtitleTableBody.appendChild(tr);
    });

    // Update search badge
    if (query !== '') {
      searchBadge.classList.remove('hidden');
      searchBadge.textContent = `${matchCount} kết quả`;
    } else {
      searchBadge.classList.add('hidden');
    }

    updateStats();
  }

  function updateStats() {
    const totalLines = activeEntries.length;
    statCount.textContent = totalLines.toLocaleString('vi-VN');

    if (totalLines > 0) {
      const lastEntry = activeEntries[totalLines - 1];
      const maxEndMs = lastEntry ? lastEntry.endMs : 0;
      statDuration.textContent = msToDurationStr(maxEndMs);

      let words = 0;
      activeEntries.forEach(e => {
        words += (e.text || '').trim().split(/\s+/).filter(Boolean).length;
      });
      statWords.textContent = words.toLocaleString('vi-VN');
    } else {
      statDuration.textContent = '00:00:00';
      statWords.textContent = '0';
    }

    if (loadedFiles[activeFileIdx]) {
      statFileName.textContent = loadedFiles[activeFileIdx].name;
    }
  }

  function renderFileTabs() {
    if (loadedFiles.length <= 1) {
      fileTabsContainer.classList.add('hidden');
      return;
    }
    fileTabsContainer.classList.remove('hidden');
    fileTabsList.innerHTML = '';

    loadedFiles.forEach((file, idx) => {
      const chip = document.createElement('div');
      chip.className = `tab-chip ${idx === activeFileIdx ? 'active' : ''}`;
      chip.textContent = `${file.name} (${file.entries.length})`;
      chip.addEventListener('click', () => {
        activeFileIdx = idx;
        activeEntries = loadedFiles[idx].entries;
        renderFileTabs();
        renderSubtitleTable(searchInput.value);
      });
      fileTabsList.appendChild(chip);
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --- CONVERTERS FOR EXPORT ---
  function generateSrt(entries) {
    let out = [];
    entries.forEach((e, i) => {
      out.push(i + 1);
      out.push(`${msToSrtTime(e.startMs)} --> ${msToSrtTime(e.endMs)}`);
      out.push(e.text);
      out.push('');
    });
    return out.join('\n');
  }

  function generateVtt(entries) {
    let out = ['WEBVTT', ''];
    entries.forEach((e, i) => {
      out.push(i + 1);
      out.push(`${msToVttTime(e.startMs)} --> ${msToVttTime(e.endMs)}`);
      out.push(e.text);
      out.push('');
    });
    return out.join('\n');
  }

  function generateTxt(entries) {
    return entries.map(e => e.text).join('\n');
  }

  function downloadFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function showToast(message) {
    toastMsg.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  // --- FILE HANDLING ---
  function handleFiles(files) {
    if (!files || files.length === 0) return;

    let readCount = 0;
    const newFiles = [];

    Array.from(files).forEach(file => {
      if (!file.name.endsWith('.json') && !file.type.includes('json') && !file.name.includes('draft_content')) {
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const parsedJson = JSON.parse(e.target.result);
          const entries = parseJsonSubtitle(parsedJson);
          if (entries.length > 0) {
            newFiles.push({
              name: file.name,
              entries: entries,
              rawJson: parsedJson
            });
          } else {
            showToast(`⚠️ Không tìm thấy phụ đề trong file: ${file.name}`);
          }
        } catch (err) {
          showToast(`❌ File ${file.name} không đúng định dạng JSON hợp lệ`);
        }

        readCount++;
        if (readCount === files.length) {
          if (newFiles.length > 0) {
            loadedFiles = newFiles;
            activeFileIdx = 0;
            activeEntries = loadedFiles[0].entries;
            workspace.classList.remove('hidden');
            renderFileTabs();
            renderSubtitleTable();
            showToast(`✅ Đã nạp thành công ${activeEntries.length} câu phụ đề!`);
          }
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // --- EVENT LISTENERS ---
  // Drag and drop zone
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    }, false);
  });

  dropzone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (dt && dt.files) {
      handleFiles(dt.files);
    }
  });

  btnBrowse.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', e => {
    handleFiles(e.target.files);
  });

  // Load Demo Button
  btnLoadDemo.addEventListener('click', async () => {
    try {
      const response = await fetch('sample_draft_content.json');
      if (!response.ok) throw new Error('Không tải được file mẫu');
      const sampleJson = await response.json();
      const entries = parseJsonSubtitle(sampleJson);
      loadedFiles = [{
        name: 'sample_draft_content.json (Demo)',
        entries: entries,
        rawJson: sampleJson
      }];
      activeFileIdx = 0;
      activeEntries = loadedFiles[0].entries;
      workspace.classList.remove('hidden');
      renderFileTabs();
      renderSubtitleTable();
      showToast('🎉 Đã tải file mẫu thành công!');
    } catch (err) {
      showToast('❌ Lỗi tải file mẫu: ' + err.message);
    }
  });

  // Path Guide Modal
  btnPathGuide.addEventListener('click', () => {
    pathModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    pathModal.classList.add('hidden');
  });

  pathModal.addEventListener('click', e => {
    if (e.target === pathModal) {
      pathModal.classList.add('hidden');
    }
  });

  // Table Inline Edits & Row Action
  subtitleTableBody.addEventListener('input', e => {
    if (e.target.classList.contains('text-editor-input')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (activeEntries[idx]) {
        activeEntries[idx].text = e.target.value;
        updateStats();
      }
    }
  });

  subtitleTableBody.addEventListener('blur', e => {
    if (e.target.classList.contains('start-time')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      const newMs = srtTimeToMs(e.target.textContent);
      if (!isNaN(newMs) && activeEntries[idx]) {
        activeEntries[idx].startMs = newMs;
        e.target.textContent = msToSrtTime(newMs);
        updateStats();
      }
    } else if (e.target.classList.contains('end-time')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      const newMs = srtTimeToMs(e.target.textContent);
      if (!isNaN(newMs) && activeEntries[idx]) {
        activeEntries[idx].endMs = newMs;
        e.target.textContent = msToSrtTime(newMs);
        updateStats();
      }
    }
  }, true);

  subtitleTableBody.addEventListener('click', e => {
    const delBtn = e.target.closest('.btn-row-del');
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.idx, 10);
      if (!isNaN(idx) && activeEntries[idx]) {
        activeEntries.splice(idx, 1);
        renderSubtitleTable(searchInput.value);
        showToast('Đã xóa 1 dòng phụ đề');
      }
    }
  });

  // Add subtitle row
  btnAddSubtitle.addEventListener('click', () => {
    let lastEnd = 0;
    if (activeEntries.length > 0) {
      lastEnd = activeEntries[activeEntries.length - 1].endMs + 500;
    }
    activeEntries.push({
      id: 'custom-' + Date.now(),
      startMs: lastEnd,
      endMs: lastEnd + 2500,
      durationMs: 2500,
      text: 'Nội dung phụ đề mới'
    });
    renderSubtitleTable(searchInput.value);
    showToast('Đã thêm 1 dòng phụ đề mới');
  });

  // Clear all
  btnClearAll.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ phụ đề hiện tại?')) {
      activeEntries = [];
      renderSubtitleTable();
      showToast('Đã xóa tất cả phụ đề');
    }
  });

  // Search input
  searchInput.addEventListener('input', e => {
    renderSubtitleTable(e.target.value);
  });

  // Time Offset Tool
  btnApplyOffset.addEventListener('click', () => {
    const offset = parseInt(offsetInput.value, 10) || 0;
    if (offset === 0) return;

    activeEntries.forEach(entry => {
      entry.startMs = Math.max(0, entry.startMs + offset);
      entry.endMs = Math.max(entry.startMs, entry.endMs + offset);
    });

    renderSubtitleTable(searchInput.value);
    showToast(`Đã dịch mốc thời gian ${offset > 0 ? '+' : ''}${offset}ms`);
  });

  // Export SRT
  btnDownloadSrt.addEventListener('click', () => {
    if (activeEntries.length === 0) {
      showToast('⚠️ Không có phụ đề để xuất!');
      return;
    }
    const currentName = loadedFiles[activeFileIdx] ? loadedFiles[activeFileIdx].name : 'subtitle';
    const baseName = currentName.replace(/\.json$/i, '');
    const srtContent = generateSrt(activeEntries);
    downloadFile(srtContent, `${baseName}.srt`, 'text/plain;charset=utf-8');
    showToast(`✅ Đã tải file ${baseName}.srt`);
  });

  // Export VTT
  btnDownloadVtt.addEventListener('click', () => {
    if (activeEntries.length === 0) {
      showToast('⚠️ Không có phụ đề để xuất!');
      return;
    }
    const currentName = loadedFiles[activeFileIdx] ? loadedFiles[activeFileIdx].name : 'subtitle';
    const baseName = currentName.replace(/\.json$/i, '');
    const vttContent = generateVtt(activeEntries);
    downloadFile(vttContent, `${baseName}.vtt`, 'text/vtt;charset=utf-8');
    showToast(`✅ Đã tải file ${baseName}.vtt`);
  });

  // Export TXT
  btnDownloadTxt.addEventListener('click', () => {
    if (activeEntries.length === 0) {
      showToast('⚠️ Không có phụ đề để xuất!');
      return;
    }
    const currentName = loadedFiles[activeFileIdx] ? loadedFiles[activeFileIdx].name : 'subtitle';
    const baseName = currentName.replace(/\.json$/i, '');
    const txtContent = generateTxt(activeEntries);
    downloadFile(txtContent, `${baseName}.txt`, 'text/plain;charset=utf-8');
    showToast(`✅ Đã tải file ${baseName}.txt`);
  });

  // Copy SRT
  btnCopySrt.addEventListener('click', () => {
    if (activeEntries.length === 0) {
      showToast('⚠️ Không có phụ đề để sao chép!');
      return;
    }
    const srtContent = generateSrt(activeEntries);
    navigator.clipboard.writeText(srtContent).then(() => {
      showToast('📋 Đã sao chép toàn bộ nội dung SRT vào bộ nhớ tạm!');
    }).catch(() => {
      showToast('❌ Không thể sao chép tự động, vui lòng tải file.');
    });
  });

  // Batch download
  btnBatchDownload.addEventListener('click', () => {
    if (loadedFiles.length === 0) return;
    loadedFiles.forEach(file => {
      const baseName = file.name.replace(/\.json$/i, '');
      const srt = generateSrt(file.entries);
      downloadFile(srt, `${baseName}.srt`);
    });
    showToast(`✅ Đã tải ${loadedFiles.length} file phụ đề SRT!`);
  });

  // Global helper for path copy
  window.copyPath = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const origText = btn.textContent;
      btn.textContent = 'Đã chép!';
      btn.style.background = '#10b981';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.textContent = origText;
        btn.style.background = '';
        btn.style.color = '';
      }, 1800);
      showToast('Đã sao chép đường dẫn thư mục!');
    });
  };

})();
