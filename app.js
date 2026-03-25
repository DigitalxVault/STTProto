'use strict';

// RADStrat RT Trainer — Realtime Transcription via OpenAI Realtime API

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
let ws = null;           // WebSocket to OpenAI Realtime API
let audioCtx = null;     // AudioContext at 24kHz
let workletNode = null;  // AudioWorklet node
let sourceNode = null;   // MediaStreamSource node
let currentDelta = '';   // Accumulates partial transcript deltas
let liveEl = null;       // Live transcript element for current utterance

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
      audio: { channelCount: 1 },
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

// ── Transcript Helpers ─────────────────────────────────────────────────────────
function addTranscriptEntry(text) {
  var placeholder = transcriptPanel.querySelector('.transcript-placeholder');
  if (placeholder) {
    transcriptPanel.removeChild(placeholder);
  }
  var p = document.createElement('p');
  p.textContent = text;
  p.classList.add('transcript-entry');
  transcriptPanel.appendChild(p);
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
  showStatusTemp(label, '#cc4444', 4000);
}

// ── Realtime Session ──────────────────────────────────────────────────────────
async function startRealtimeSession(mediaStream) {
  setState('processing'); // Show spinner during connection setup

  // 1. Fetch ephemeral token
  let tokenData;
  try {
    const res = await fetch('/api/session', { method: 'POST' });
    if (!res.ok) throw new Error('Token request failed: ' + res.status);
    tokenData = await res.json();
  } catch (err) {
    console.error('[STT] Token fetch failed:', err);
    addTranscriptError('SESSION ERROR');
    setState('idle');
    return;
  }

  const token = tokenData.client_secret.value;
  console.log('[STT] Ephemeral token acquired');

  // 2. Open WebSocket with token as subprotocol
  const wsUrl = 'wss://api.openai.com/v1/realtime?intent=transcription';
  ws = new WebSocket(wsUrl, [
    'realtime',
    'openai-insecure-api-key.' + token,
    'openai-beta.realtime-v1',
  ]);

  ws.onopen = function () {
    console.log('[STT] WebSocket connected');

    // 3. Send session config
    ws.send(JSON.stringify({
      type: 'transcription_session.update',
      session: {
        input_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'en',
        },
        turn_detection: {
          type: 'server_vad',
          silence_duration_ms: 200,
        },
      },
    }));

    // 4. Start audio streaming
    startAudioStreaming(mediaStream);
    setState('recording'); // Switch from spinner to recording state
  };

  ws.onmessage = function (event) {
    handleRealtimeEvent(JSON.parse(event.data));
  };

  ws.onerror = function (err) {
    console.error('[STT] WebSocket error:', err);
    addTranscriptError('CONNECTION ERROR');
    stopRealtimeSession();
    setState('idle');
  };

  ws.onclose = function (event) {
    console.log('[STT] WebSocket closed:', event.code, event.reason);
    // Clean up audio nodes if still connected
    cleanupAudio();
  };
}

async function startAudioStreaming(mediaStream) {
  // Create AudioContext at 24kHz (required by Realtime API)
  audioCtx = new AudioContext({ sampleRate: 24000 });

  // Load AudioWorklet
  await audioCtx.audioWorklet.addModule('/audioProcessor.js');

  // Create source from mic stream
  sourceNode = audioCtx.createMediaStreamSource(mediaStream);

  // Create worklet node
  workletNode = new AudioWorkletNode(audioCtx, 'pcm16-processor');

  // Handle PCM16 data from worklet
  workletNode.port.onmessage = function (e) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Convert ArrayBuffer to base64
      const base64 = arrayBufferToBase64(e.data);
      ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64,
      }));
    }
  };

  // Connect mic -> worklet -> silent gain node (no playback feedback)
  sourceNode.connect(workletNode);
  var silentGain = audioCtx.createGain();
  silentGain.gain.value = 0;
  workletNode.connect(silentGain);
  silentGain.connect(audioCtx.destination);

  console.log('[STT] Audio streaming started at 24kHz');
}

function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function handleRealtimeEvent(event) {
  console.log('[STT] Event:', event.type);

  switch (event.type) {
    case 'conversation.item.input_audio_transcription.delta':
      // Partial transcript — accumulate and show live
      currentDelta += event.delta;
      if (!liveEl) {
        liveEl = document.createElement('p');
        liveEl.classList.add('transcript-entry', 'transcript-live');
        var placeholder = transcriptPanel.querySelector('.transcript-placeholder');
        if (placeholder) transcriptPanel.removeChild(placeholder);
        transcriptPanel.appendChild(liveEl);
      }
      liveEl.textContent = currentDelta;
      break;

    case 'conversation.item.input_audio_transcription.completed':
      // Final transcript for this segment
      if (liveEl) {
        liveEl.classList.remove('transcript-live');
        liveEl.textContent = event.transcript || currentDelta;
        liveEl = null;
      } else if (event.transcript) {
        addTranscriptEntry(event.transcript);
      }
      currentDelta = '';
      break;

    case 'error':
      console.error('[STT] Realtime API error:', event.error);
      if (event.error && event.error.message) {
        addTranscriptError('API: ' + event.error.message);
      }
      break;

    default:
      // Ignore other events (session.created, session.updated, etc.)
      break;
  }
}

function cleanupAudio() {
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
    audioCtx = null;
  }
}

function stopRealtimeSession() {
  // Send commit to force final transcription of any remaining audio
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    console.log('[STT] Audio buffer committed');

    // Give server a moment to send final transcript, then close
    setTimeout(function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      ws = null;
      setState('idle');
    }, 1500);
  } else {
    ws = null;
    setState('idle');
  }

  cleanupAudio();
}

// ── PTT Handlers ──────────────────────────────────────────────────────────────
async function handlePressStart(e) {
  const mediaStream = await acquireMic();
  if (!mediaStream) return;
  startRealtimeSession(mediaStream);
}

function handlePressEnd() {
  // If no active WebSocket session, just reset
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setState('idle');
    return;
  }
  stopRealtimeSession();
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

// ── Diagnostics ───────────────────────────────────────────────────────────────
console.log('[STT] Realtime transcription module loaded');
console.log('[STT] AudioWorklet supported:', typeof AudioWorkletNode !== 'undefined');
console.log('[STT] WebSocket supported:', typeof WebSocket !== 'undefined');
console.log('[STT] Display mode:', (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) ? 'standalone' : 'browser');
