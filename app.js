'use strict';

// RADStrat RT Trainer — App Shell + PTT Audio Capture

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function (err) {
    console.warn('SW registration failed:', err);
  });
}

// ── DOM References ────────────────────────────────────────────────────────────
const micBtn = document.querySelector('.mic-btn');
const statusIndicator = document.querySelector('.status-indicator');
const transcriptPanel = document.querySelector('.transcript-panel');

// ── State ─────────────────────────────────────────────────────────────────────
let stream = null;
let recorder = null;
let chunks = [];

// ── setState ──────────────────────────────────────────────────────────────────
function setState(state) {
  micBtn.classList.remove('state-idle', 'state-recording', 'state-processing');
  micBtn.classList.add('state-' + state);

  const labels = { idle: 'STANDBY', recording: 'REC', processing: 'PROCESSING' };
  if (statusIndicator) {
    statusIndicator.textContent = '\u25a0 ' + (labels[state] || state.toUpperCase());
  }
}

// ── Mic Acquisition ───────────────────────────────────────────────────────────
function showStatusTemp(text, color, durationMs) {
  if (!statusIndicator) return;
  var prevText = statusIndicator.textContent;
  var prevColor = statusIndicator.style.color;
  statusIndicator.textContent = '\u25a0 ' + text;
  statusIndicator.style.color = color;
  setTimeout(function () {
    statusIndicator.textContent = prevText;
    statusIndicator.style.color = prevColor;
  }, durationMs);
}

async function acquireMic() {
  // Check if cached stream has live audio tracks
  if (stream && stream.getAudioTracks().every(function (t) { return t.readyState === 'live'; })) {
    return stream;
  }
  // If stream exists but tracks are dead, clear it and re-acquire
  if (stream) {
    stream = null;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return stream;
  } catch (err) {
    console.error('Mic acquisition failed:', err);
    stream = null;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showStatusTemp('MIC BLOCKED', 'red', 3000);
    } else {
      showStatusTemp('MIC ERROR', 'red', 3000);
    }
    setState('idle');
    return null;
  }
}

// ── MediaRecorder Lifecycle ───────────────────────────────────────────────────
function detectMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    '',
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] === '' || MediaRecorder.isTypeSupported(candidates[i])) {
      return candidates[i];
    }
  }
  return '';
}

function startRecording(mediaStream) {
  chunks = [];
  const mimeType = detectMimeType();
  const options = mimeType ? { mimeType: mimeType } : {};

  console.log('[PTT] Using MIME:', mimeType || 'browser default');

  recorder = new MediaRecorder(mediaStream, options);

  recorder.ondataavailable = function (e) {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onerror = function (e) {
    console.error('[PTT] MediaRecorder error:', e.error || e);
    setState('idle');
  };

  recorder.onstop = function () {
    const blobType = mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: blobType });

    console.log('[PTT] Blob ready:', { size: blob.size, type: blob.type, chunks: chunks.length });

    if (blob.size === 0) {
      console.warn('[PTT] Audio blob is empty — recording may have been too short.');
      setState('idle');
      return;
    }

    console.log('[PTT] Dispatching audio-captured event:', blob.size, 'bytes,', blob.type);
    micBtn.dispatchEvent(new CustomEvent('audio-captured', {
      bubbles: true,
      detail: { blob: blob },
    }));

    // Phase 4: idle transition owned by audio-captured listener
  };

  try {
    recorder.start();
    setState('recording');
  } catch (err) {
    console.error('[PTT] recorder.start() failed:', err);
    recorder = null;
    setState('idle');
  }
}

function stopRecording() {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    setState('processing');
  }
}

// ── PTT Handlers ──────────────────────────────────────────────────────────────
async function handlePressStart(e) {
  const mediaStream = await acquireMic();
  if (!mediaStream) return;
  startRecording(mediaStream);
}

function handlePressEnd() {
  // Rapid tap guard: if no active recording, just reset to idle
  if (!recorder || recorder.state !== 'recording') {
    setState('idle');
    return;
  }
  stopRecording();
}

// ── Pointer Events ────────────────────────────────────────────────────────────
micBtn.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  micBtn.setPointerCapture(e.pointerId);
  handlePressStart(e);
});

micBtn.addEventListener('pointerup', function () {
  handlePressEnd();
});

micBtn.addEventListener('pointercancel', function () {
  handlePressEnd();
});

// -- Pipeline Integration ──────────────────────────────────────────────────────
function addTranscriptEntry(text) {
  var placeholder = transcriptPanel.querySelector('.transcript-placeholder');
  if (placeholder) {
    transcriptPanel.removeChild(placeholder);
  }
  var p = document.createElement('p');
  p.textContent = text;
  p.classList.add('transcript-entry');
  transcriptPanel.appendChild(p);
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;
}

function addTranscriptError(label) {
  var placeholder = transcriptPanel.querySelector('.transcript-placeholder');
  if (placeholder) {
    transcriptPanel.removeChild(placeholder);
  }
  var p = document.createElement('p');
  p.textContent = '[ERR] ' + label;
  p.classList.add('transcript-error');
  transcriptPanel.appendChild(p);
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;
  showStatusTemp(label, '#cc4444', 4000);
}

async function transcribeAndDisplay(blob) {
  var ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  var formData = new FormData();
  formData.append('file', blob, 'audio.' + ext);

  var response;
  try {
    response = await fetch('/api/transcribe', { method: 'POST', body: formData });
  } catch (err) {
    console.error('[STT] Network error:', err);
    addTranscriptError('NETWORK ERROR');
    setState('idle');
    return;
  }

  if (!response.ok) {
    var errBody = await response.json().catch(function () { return {}; });
    console.error('[STT] API error:', errBody);
    addTranscriptError('TRANSCRIPTION FAILED');
    setState('idle');
    return;
  }

  var data = await response.json();
  if (data.text) {
    addTranscriptEntry(data.text);
  }
  setState('idle');
}

document.addEventListener('audio-captured', function (e) {
  transcribeAndDisplay(e.detail.blob);
});

// ── Diagnostics ───────────────────────────────────────────────────────────────
console.log('[PTT] Audio capture module loaded');
console.log('[STT] Pipeline integration loaded');
console.log('[PTT] MediaRecorder supported:', typeof MediaRecorder !== 'undefined');
console.log('[PTT] Pointer Events supported:', typeof PointerEvent !== 'undefined');
console.log('[PTT] Display mode:', (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) ? 'standalone' : 'browser');
console.log('[PTT] MIME support:', {
  'webm/opus': typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'),
  'webm': typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'),
  'mp4': typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4'),
});
