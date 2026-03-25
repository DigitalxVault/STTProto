# Requirements: RADStrat RT Trainer

**Defined:** 2026-03-25
**Core Value:** Push-to-talk produces accurate, immediate transcription so users can self-correct their RT discipline

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Audio Capture

- [ ] **AUD-01**: User can press-and-hold mic button to record audio
- [ ] **AUD-02**: User sees mic button change state: idle (grey), recording (pulsing red), processing (spinner)
- [ ] **AUD-03**: Audio captured via MediaRecorder API as webm/opus blob

### Transcription

- [ ] **STT-01**: Audio blob sent to Vercel serverless proxy on release
- [ ] **STT-02**: Serverless function forwards audio to OpenAI Whisper API (whisper-1)
- [ ] **STT-03**: Transcript text displayed on screen after processing
- [ ] **STT-04**: API key secured server-side in Vercel environment variables

### UI & PWA

- [ ] **UI-01**: Dark/black military aesthetic single-screen layout
- [ ] **UI-02**: Mic button centered at bottom of screen
- [ ] **UI-03**: Transcript panel displayed above mic button
- [ ] **UI-04**: Mobile-first responsive layout (portrait, iPhone-sized)
- [ ] **PWA-01**: manifest.json with app name "RADStrat RT Trainer"
- [ ] **PWA-02**: Service worker registered for PWA installability

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Audio Enhancements

- **AUD-04**: iOS Safari MIME type fallback (audio/mp4)
- **AUD-05**: Empty blob detection (iOS standalone mode guard)

### Transcription Enhancements

- **STT-05**: NATO vocabulary prompt seeding for improved accuracy
- **STT-06**: Timestamped transcript lines (HH:MM:SS)
- **STT-07**: Proword highlighting in transcript

### UI & PWA Enhancements

- **UI-05**: Haptic feedback on PTT press/release
- **PWA-03**: Offline shell via service worker cache

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Automated RT scoring/grading | High complexity, v1 is self-evaluation only |
| Session persistence or export | Transcripts live only during active session |
| Multi-user or networked training | Single user, single device prototype |
| User accounts or authentication | No auth needed for prototype |
| Real-time streaming transcription | Batch on release is sufficient for PTT pattern |
| Custom RT protocol support | NATO/Allied (ACP 125) only |
| Voice activity detection (VAD) | Manual PTT is the interaction model |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUD-01 | Phase 2 | Complete |
| AUD-02 | Phase 2 | Complete |
| AUD-03 | Phase 2 | Complete |
| STT-01 | Phase 4 | Complete |
| STT-02 | Phase 3 | Complete |
| STT-03 | Phase 4 | Complete |
| STT-04 | Phase 3 | Complete |
| UI-01 | Phase 1 | Complete |
| UI-02 | Phase 1 | Complete |
| UI-03 | Phase 1 | Complete |
| UI-04 | Phase 1 | Complete |
| PWA-01 | Phase 1 | Complete |
| PWA-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after roadmap creation (all 13 requirements mapped)*
