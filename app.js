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
async function acquireMic() {
  if (stream && stream.getTracks().every(function (t) { return t.readyState === 'live'; })) {
    return stream;
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

  recorder = new MediaRecorder(mediaStream, options);

  recorder.ondataavailable = function (e) {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = function () {
    const blobType = mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: blobType });

    if (blob.size === 0) {
      console.warn('Audio blob is empty — recording may have been too short.');
      setState('idle');
      return;
    }

    console.log('Audio captured:', blob.size, 'bytes,', blob.type);
    micBtn.dispatchEvent(new CustomEvent('audio-captured', {
      bubbles: true,
      detail: { blob: blob },
    }));

    setState('idle');
  };

  recorder.start();
  setState('recording');
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
