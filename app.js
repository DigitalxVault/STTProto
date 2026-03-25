'use strict';

// RADStrat RT Trainer — Live Speech-to-Text via Web Speech API

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function (err) {
    console.warn('SW registration failed:', err);
  });
}

// ── DOM References ────────────────────────────────────────────────────────────
var micBtn = document.querySelector('.mic-btn');
var statusIndicator = document.querySelector('.status-indicator');
var transcriptPanel = document.querySelector('.transcript-panel');

// ── State ─────────────────────────────────────────────────────────────────────
var recognition = null;
var liveEl = null;       // Current live transcript element (updates as you speak)
var isListening = false;

// ── setState ──────────────────────────────────────────────────────────────────
function setState(state) {
  micBtn.classList.remove('state-idle', 'state-recording', 'state-processing');
  micBtn.classList.add('state-' + state);

  var labels = { idle: 'STANDBY', recording: 'REC', processing: 'PROCESSING' };
  if (statusIndicator) {
    statusIndicator.textContent = '\u25a0 ' + (labels[state] || state.toUpperCase());
  }
}

// ── Status Temp ───────────────────────────────────────────────────────────────
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

// ── Transcript Helpers ────────────────────────────────────────────────────────
function removePlaceholder() {
  var placeholder = transcriptPanel.querySelector('.transcript-placeholder');
  if (placeholder) transcriptPanel.removeChild(placeholder);
}

function addTranscriptEntry(text) {
  removePlaceholder();
  var p = document.createElement('p');
  p.textContent = text;
  p.classList.add('transcript-entry');
  transcriptPanel.appendChild(p);
}

function addTranscriptError(label) {
  removePlaceholder();
  var p = document.createElement('p');
  p.textContent = '[ERR] ' + label;
  p.classList.add('transcript-error');
  transcriptPanel.appendChild(p);
  showStatusTemp(label, '#cc4444', 4000);
}

// ── Web Speech API — True Real-Time Transcription ─────────────────────────────

var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startListening() {
  if (!SpeechRecognition) {
    addTranscriptError('SPEECH API NOT SUPPORTED');
    setState('idle');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;  // This is what gives us live word-by-word updates
  recognition.lang = 'en-US';

  // Create a live element that will update word-by-word as you speak
  removePlaceholder();
  liveEl = document.createElement('p');
  liveEl.classList.add('transcript-entry', 'transcript-live');
  transcriptPanel.appendChild(liveEl);

  recognition.onresult = function (event) {
    var interimText = '';
    var finalText = '';

    for (var i = event.resultIndex; i < event.results.length; i++) {
      var transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    // Final result — lock it in as a completed entry
    if (finalText) {
      if (liveEl) {
        liveEl.classList.remove('transcript-live');
        liveEl.textContent = finalText;
        // Start a new live element for the next utterance
        liveEl = document.createElement('p');
        liveEl.classList.add('transcript-entry', 'transcript-live');
        transcriptPanel.appendChild(liveEl);
      }
    }

    // Interim result — update the live element in real-time (word by word)
    if (interimText && liveEl) {
      liveEl.textContent = interimText;
    }
  };

  recognition.onerror = function (event) {
    console.error('[STT] Recognition error:', event.error);
    if (event.error === 'not-allowed') {
      showStatusTemp('MIC BLOCKED', '#cc4444', 3000);
    } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
      showStatusTemp('STT ERROR', '#cc4444', 3000);
    }
  };

  recognition.onend = function () {
    // If still holding PTT, restart (browser may auto-stop)
    if (isListening) {
      try {
        recognition.start();
      } catch (e) {
        // Already started, ignore
      }
    }
  };

  try {
    recognition.start();
    isListening = true;
    setState('recording');
    console.log('[STT] Listening started');
  } catch (err) {
    console.error('[STT] Failed to start:', err);
    setState('idle');
  }
}

function stopListening() {
  isListening = false;

  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      // Already stopped
    }
    recognition = null;
  }

  // Finalize the live element
  if (liveEl) {
    if (liveEl.textContent.trim() === '') {
      // Empty — remove it
      liveEl.parentNode && liveEl.parentNode.removeChild(liveEl);
    } else {
      // Has content — finalize it
      liveEl.classList.remove('transcript-live');
    }
    liveEl = null;
  }

  setState('idle');
  console.log('[STT] Listening stopped');
}

// ── PTT Handlers ──────────────────────────────────────────────────────────────
function handlePressStart() {
  startListening();
}

function handlePressEnd() {
  stopListening();
}

// ── Pointer Events ────────────────────────────────────────────────────────────
micBtn.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  micBtn.setPointerCapture(e.pointerId);
  handlePressStart();
});

micBtn.addEventListener('pointerup', function () {
  handlePressEnd();
});

micBtn.addEventListener('pointercancel', function () {
  handlePressEnd();
});

// ── Diagnostics ───────────────────────────────────────────────────────────────
console.log('[STT] Web Speech API module loaded');
console.log('[STT] SpeechRecognition supported:', !!SpeechRecognition);
console.log('[STT] Display mode:', (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) ? 'standalone' : 'browser');
