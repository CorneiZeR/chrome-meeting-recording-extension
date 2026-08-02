# Graph Report - /Users/kstroevsky/Desktop/dev/chrome-recording-transcription-extension  (2026-08-02)

## Corpus Check
- Large corpus: 301 files · ~1,537,049 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2694 nodes · 6341 edges · 167 communities (147 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b7d2723e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Scraping Scripts
- Drive Authentication
- Popup Controls
- Popup Gallery
- Recording Pipeline
- Recording Tasks
- Extension Manifest
- Message Protocol
- Real Meet Tests
- Debug Dashboard
- Performance Flags
- Recorder Engine
- Test Harness
- Build Dependencies
- Offscreen Runtime
- Project Scripts
- Recorder Profiles
- Performance Debug Store
- Offscreen Controller
- Recording Configuration
- Shared Module Index
- Time Utilities
- Self-Video Resize
- Offscreen Manager
- Drive Targets
- Recorder Engine Details
- Recording Lifecycle
- Shared Defaults
- Pending Upload Recovery
- Session Tab View
- Upload Jobs
- RPC Handlers
- Popup Controller
- Recording Sessions
- Shared Kernel
- History Service
- Performance Runner
- Compiler Options
- Offscreen Manager
- Perf Debug Store
- Recording Finalization
- Recording Formats
- Upload Retry Tests
- Recorder Engine.test
- Settings Controls
- Package Metadata
- Background Worker
- Drive Folder Resolution
- History Entries
- Recording Controller
- Recording Session
- Pending Upload Store
- Confirmation Dialog
- Settings Matrix.spec
- History Repository
- History Types
- Webpack Build
- Meeting Recording Extension
- Recording Auto Stop
- Capture Setup
- OPFS Worker Storage
- Recording Types
- Provider Detection
- Cloud Transcription
- Recording History Service
- Check Version Monotonic
- Recording Controller
- Upload Manager
- Popup Controller.test
- Background Worker
- Setup Real Meet Profile
- HTML Entry Points
- ADR 0002 Cross Browser Support
- Mock Meet Testing
- Message Handlers
- Session Lifecycle
- Offscreen Storage
- History Page View
- Meet Popup
- Compiler Options
- Background README
- Platform Chrome README
- Drive Upload README
- Timeouts Module
- Create Runtime Tab
- Caption Poller.test
- Perf Debug Store
- Storage Split By Concern
- ADR 0003 Recording Phase Ownership
- Tsconfig.check Module
- Upload Job State Outbox
- Offscreen Engine README
- Settings README
- Auth Provider
- Recordings Controller
- Rpc Module
- Transform Manifest
- Window.mock Meet API
- Keywords Module
- Manifest Targets.test
- Manifest Target Model
- Theme Module
- Build Module
- Recorder Engine Types
- Recording Timer
- Popup README
- Real Meet Scenarios
- End To End Tests
- Meet DOM Caption Fast Path
- ADR 0001 Platform Chrome Normalization
- Runtime Sampler
- Real Meet Cli
- Cpu Sampler
- Drive Target
- Layered Test Taxonomy
- Upload Navigation Design QA
- ADR 0004 Decoupled Drive Uploads
- Perf Flags
- Check Production Build
- Load Extension Settings From Storage
- Content README
- Recorder Settings Page
- Phase Watchdog
- Debug README
- Request Module
- Runtime Sampler
- Validate Module
- History Service Build
- History Design
- Fake Worker
- History Page
- Triage Label Mapping
- History Identifier
- Serve Popup Gallery
- Recording Diagnostics Dashboard
- Popup State Gallery
- A3 Solo Recording UX
- Tier 1 Wins Default On
- Module README Conventions
- Print Redirect Uri
- Chrome.storage.session Module
- Domain Documentation Guide
- Linear Issue Tracker Guide
- Record Anywhere
- Tab Capture
- OPFS Storage
- Pnpm Workspace Configuration
- Extension Icon
- Desktop Capture
- Audio Playback
- Local Batch Transcription
- Settings Icon
- Recording Indicator
- Build Handshake
- Recording History Entry
- Build Flags.d
- Setup Module
- Meet Captions
- Extension Icon
- Recording Indicator Icon
- Firefox Compatibility
- Chromium Support
- Draw Module

## God Nodes (most connected - your core abstractions)
1. `PopupController` - 92 edges
2. `RecorderEngine` - 48 edges
3. `roundMs()` - 40 edges
4. `RecordingPhase` - 39 edges
5. `nowMs()` - 37 edges
6. `sendToBackground()` - 35 edges
7. `RecordingHistoryEntry` - 35 edges
8. `UploadJob` - 35 edges
9. `OffscreenManager` - 34 edges
10. `scripts` - 33 edges
11. `RecordingStream` - 31 edges
12. `RecordingStatusView` - 31 edges
13. `debugPerf()` - 30 edges
14. `RecorderEngineDeps` - 28 edges
15. `RecordingRunConfig` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Live Caption Transcript Stream` --semantically_similar_to--> `Transcript Saver`  [INFERRED] [semantically similar]
  docs/google-meet-transcript-uxs-jrra-eta-1782493610863.txt → README.md
- `Settings Matrix Spec` --conceptually_related_to--> `Recorder Settings Page`  [INFERRED]
  tests/README.md → static/settings.html
- `transformManifest()` --calls--> `toChromeManifestVersion()`  [EXTRACTED]
  webpack.config.js → scripts/lib/manifestVersion.cjs
- `installRecoveryTestBridge()` --calls--> `createChromePendingUploadStore()`  [EXTRACTED]
  tests/e2e/helpers/e2eRecoveryBridge.ts → src/offscreen/drive/PendingUploadStore.ts
- `clampTabBitrate()` --calls--> `resolveTabVideoBitrate()`  [EXTRACTED]
  tests/e2e/real-meet.spec.ts → src/shared/settings/store.ts
- `Setup Panel` --conceptually_related_to--> `Detached Drive Upload`  [INFERRED]
  design-qa.md → README.md
- `Meeting Recording Extension` --references--> `ADR-0001 Platform Chrome Normalization Layer`  [EXTRACTED]
  README.md → docs/adr/0001-platform-chrome-is-a-utility-layer-not-a-port.md
- `Meeting Recording Extension` --references--> `ADR-0002 Cross-Browser Support Strategy`  [EXTRACTED]
  README.md → docs/adr/0002-cross-browser-support-strategy.md
- `Meeting Recording Extension` --references--> `ADR-0003 Recording Phase Ownership and Stale Offscreen Status`  [EXTRACTED]
  README.md → docs/adr/0003-recording-phase-ownership-and-stale-offscreen-status.md
- `Recording History Migration Spec` --conceptually_related_to--> `Paginated Durable Recording History`  [INFERRED]
  tests/README.md → static/recordings.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Capture-to-Delivery Pipeline** — readme_recorderengine, readme_origin_private_file_system, readme_recordingfinalizer, readme_uploadmanager, readme_google_drive_api [EXTRACTED 1.00]
- **Cross-Browser Capability Seams** — docs_adr_0002_cross_browser_support_strategy_hand_rolled_webpack_seams, docs_adr_0002_cross_browser_support_strategy_per_browser_build_targets, docs_adr_0002_cross_browser_support_strategy_capability_based_fallbacks, docs_adr_0002_cross_browser_support_strategy_authprovider, docs_adr_0002_cross_browser_support_strategy_capture_source_seam, docs_adr_0002_cross_browser_support_strategy_media_host_seam, docs_adr_0002_cross_browser_support_strategy_output_format_seam [EXTRACTED 1.00]
- **Mock Meet Workload and Control API** — tests_fixtures_mock_meet_mock_google_meet_page, tests_fixtures_mock_meet_mockmeet_api, tests_fixtures_mock_meet_setcaption, tests_fixtures_mock_meet_setparticipants, tests_fixtures_mock_meet_startworkload, tests_fixtures_mock_meet_emithardwaremarker, tests_fixtures_mock_meet_endmeeting [EXTRACTED 1.00]
- **Offscreen capture to delivery composition** — src_offscreen_readme_offscreen_controller, src_offscreen_engine_readme_recorder_engine, src_offscreen_readme_recording_finalizer, src_offscreen_readme_upload_manager [EXTRACTED 1.00]
- **Real Meet production calibration matrix** — docs_testing_scenario_b_real_google_meet_live_calibration, docs_testing_scenario_b_real_chrome_tab_capture, docs_testing_scenario_b_real_os_camera_and_microphone [INFERRED 0.85]
- **One run groups all recording artifacts** — recording_history_id, recording_history_entry, recording_history_file, recording_history_service [EXTRACTED 1.00]
- **Recording history implementation sequence** — shared_contract_milestone, indexeddb_repository_milestone, background_service_milestone, completion_wiring_milestone, history_page_milestone, popup_build_milestone, verification_milestone [EXTRACTED 1.00]
- **History ID crosses recording and upload boundaries** — recording_session, recording_history_id, recording_history_message_contract, drive_upload_job [EXTRACTED 1.00]
- **One recording session groups all artifact streams** — docs_superpowers_specs_2026_07_09_recording_history_design_recording_history_service, docs_superpowers_specs_2026_07_09_recording_history_design_history_id [EXTRACTED 1.00]
- **Resilient Recording Lifecycle** — docs_adr_0003_recording_phase_ownership_and_stale_offscreen_status_epoch_fence, docs_adr_0003_recording_phase_ownership_and_stale_offscreen_status_desired_observed_split, docs_adr_0003_recording_phase_ownership_and_stale_offscreen_status_phase_watchdog, docs_adr_0004_decouple_uploads_from_the_recording_session_detached_upload_jobs [INFERRED 0.85]
- **Desired, observed, failed inputs form the derived phase model** — src_shared_readme_desired_plane, src_shared_readme_observed_plane, src_shared_readme_failed_flag, src_shared_readme_project_phase, src_shared_readme_recording_phase [EXTRACTED 1.00]
- **Static Extension Entry-page Surface** — static_camsetup_camera_permission_page, static_debug_recording_diagnostics_dashboard, static_micsetup_microphone_permission_page, static_offscreen_offscreen_recording_page, static_popup_gallery_popup_state_gallery, static_popup_meet_recorder_popup, static_recordings_recording_history_page, static_settings_recorder_settings_page [EXTRACTED 1.00]
- **Storage target fallback ladder** — src_offscreen_storage_readme_worker_storage_target, src_offscreen_storage_readme_local_file_target, src_offscreen_storage_readme_in_memory_storage_target, src_offscreen_storage_readme_storage_target [EXTRACTED 1.00]
- **Layered Test Execution Taxonomy** — tests_readme_unit_tests, tests_readme_integration_tests, tests_readme_e2e_tests, tests_readme_node_build_level_tests, tests_readme_e2e_adjacent_tests [EXTRACTED 1.00]

## Communities (167 total, 20 thin omitted)

### Community 0 - "Scraping Scripts"
Cohesion: 0.06
Nodes (18): CaptionBuffer, Chunk, normalizeCaptionText(), OpenChunk, ENDED_TEXT_PATTERNS, GoogleMeetAdapter, MEET_SELECTORS, MeetingEndDetector (+10 more)

### Community 1 - "Drive Authentication"
Cohesion: 0.06
Nodes (48): buildBadClientIdError(), DriveTokenErr, DriveTokenOk, DriveTokenOptions, DriveTokenResponse, fetchDriveTokenWithFallback(), invalidateLastIssuedToken(), isBadClientIdError() (+40 more)

### Community 2 - "Popup Controls"
Cohesion: 0.09
Nodes (5): PermissionQueryState, PopupController, readCachedPhase(), PopupPreviewDeviceOption, sendToBackground()

### Community 3 - "Popup Gallery"
Cohesion: 0.06
Nodes (45): applyPreviewPreferences(), boundsToggle, buildGroupNavigation(), count, filterStories(), gallery, groupNav, makeCard() (+37 more)

### Community 4 - "Recording Pipeline"
Cohesion: 0.10
Nodes (43): BUSY_RECORDING_PHASES, CONFIGURABLE_RUN_DEFAULTS, DEFAULT_RECORDING_RUN_CONFIG, EXTENSION_DEFAULTS, NON_IDLE_RECORDING_PHASES, RECORDING_SESSION_STORAGE_KEY, RecordingModeDefault, VALID_MIC_MODES (+35 more)

### Community 5 - "Recording Tasks"
Cohesion: 0.09
Nodes (27): BitrateObservation, BitrateObserver, BitrateObserverOptions, MicRecorderCallbacks, startMicRecorder(), awaitRecorderStart(), buildRecordingFilename(), makeChunkHandler() (+19 more)

### Community 6 - "Extension Manifest"
Cohesion: 0.05
Nodes (43): activeTab, desktopCapture, downloads, https://meet.google.com/*, https://www.googleapis.com/*, https://www.googleapis.com/auth/drive.file, identity, offscreen (+35 more)

### Community 7 - "Message Protocol"
Cohesion: 0.06
Nodes (39): BackgroundNoResponseError, BgToOffscreenRuntime, BgToPopup, DriveTokenResponse, E2EDriveFetchMessage, PerfEventMessage, PopupCancelUploadJob, PopupDiscardRecording (+31 more)

### Community 8 - "Real Meet Tests"
Cohesion: 0.11
Nodes (41): setPerfSettings(), stopRecording(), assertMeetMediaState(), bestEffortStop(), captureMeetDiagnostics(), closeRealMeetHarness(), configurePrejoinMedia(), ensureRecordingShortcut() (+33 more)

### Community 9 - "Debug Dashboard"
Cohesion: 0.11
Nodes (19): dashboard, DebugDashboard, Elements, buildCaptionsText(), buildRecorderText(), buildRuntimeText(), buildSummaryText(), buildUploadText() (+11 more)

### Community 10 - "Performance Flags"
Cohesion: 0.09
Nodes (25): addStorageChangedListener(), DEFAULT_PERF_SETTINGS, HIGH_FREQUENCY_PERF_EVENTS, PERF_DEBUG_SNAPSHOT_STORAGE_KEY, PERF_EVENT_BUFFER_LIMIT, PERF_FLAGS, PERF_SETTINGS_STORAGE_KEY, applyPerfSettings() (+17 more)

### Community 11 - "Recorder Engine"
Cohesion: 0.15
Nodes (7): CompletedRecordingArtifact, RecorderEngineDeps, RecorderTrack, RecorderEngine, CapturedTabResolution, RecordingInputDevice, RecorderRuntimeSettingsSnapshot

### Community 12 - "Test Harness"
Cohesion: 0.11
Nodes (33): assertPopupReflectsSavedDefaults(), closeHarness(), CommandResult, findMockMeetTabId(), HardwareProbeResult, HarnessLaunchOptions, launchExtensionHarness(), mockMeetFixturePath (+25 more)

### Community 13 - "Build Dependencies"
Cohesion: 0.06
Nodes (35): clean-webpack-plugin, copy-webpack-plugin, jest, jest-environment-jsdom, devDependencies, clean-webpack-plugin, copy-webpack-plugin, jest (+27 more)

### Community 14 - "Offscreen Runtime"
Cohesion: 0.11
Nodes (26): connectPort(), controller, createChromePendingUploadStore(), createChromeUploadJobStateOutbox(), engine, finalizer, getDriveToken(), getPort() (+18 more)

### Community 15 - "Project Scripts"
Cohesion: 0.06
Nodes (33): scripts, build, build:brave, build:e2e:mock, build:edge, build:opera, check:version, dev (+25 more)

### Community 16 - "Recorder Profiles"
Cohesion: 0.13
Nodes (26): acquireSelfVideoStream(), formatVideoMetrics(), maybeReportSelfVideoWarning(), SelfVideoRecorderCallbacks, startSelfVideoRecorder(), startWiredSelfVideoRecorder(), maybeGetSelfVideoStream(), buildConstraints() (+18 more)

### Community 17 - "Performance Debug Store"
Cohesion: 0.25
Nodes (27): applyArtifactSealed(), applyAudioBridge(), applyCaptionLongTask(), applyCaptionMutation(), applyCapture(), applyCpuSample(), applyDistribution(), applyDriveChunk() (+19 more)

### Community 18 - "Offscreen Controller"
Cohesion: 0.11
Nodes (13): ArtifactFinalizer, FinalizableEngine, OffscreenController, OffscreenControllerDeps, OffscreenStateMessage, ADR-0003, ADR-0004, artifact() (+5 more)

### Community 19 - "Recording Configuration"
Cohesion: 0.14
Nodes (12): createIdleStatusView(), PopupStateCallbacks, PopupStateController, makeController(), makeElements(), applyRunConfigToForm(), buildRunConfigFromForm(), formatUploadFallbackMessage() (+4 more)

### Community 20 - "Shared Module Index"
Cohesion: 0.13
Nodes (24): settingsHtml, MicrophoneRecordingFormat, VideoRecordingFormat, DEFAULT_EXTENSION_SETTINGS, MAX_TAB_VIDEO_BITRATE, SELF_VIDEO_DEFAULT_BITS_PER_SECOND, SELF_VIDEO_MIN_ADAPTIVE_BITS_PER_SECOND, TAB_MAX_FRAME_RATE (+16 more)

### Community 21 - "Time Utilities"
Cohesion: 0.18
Nodes (12): SealedStorageFile, StorageTarget, LocalFileTarget, sampleRuntimeMetrics(), openHandshake(), SealResult, WorkerOutbound, WorkerStorageTarget (+4 more)

### Community 22 - "Self-Video Resize"
Cohesion: 0.08
Nodes (12): buildGeneratedTrack(), detectCodedSize(), EnforcedSelfVideoStream, enforceSelfVideoResolution(), hasInsertableStreams(), Size, ManualReader, MockGenerator (+4 more)

### Community 23 - "Offscreen Manager"
Cohesion: 0.16
Nodes (3): OffscreenManager, closeOffscreenDocument(), BgToOffscreenRpc

### Community 24 - "Drive Targets"
Cohesion: 0.15
Nodes (20): DRIVE_FAST_CHUNK_MS, DRIVE_MAX_RETRIES, DRIVE_MAX_UPLOAD_CHUNK_BYTES, DRIVE_MIN_UPLOAD_CHUNK_BYTES, DRIVE_RETRY_BACKOFF_MAX_MULTIPLIER, DRIVE_RETRY_BASE_DELAY_MS, DRIVE_SLOW_CHUNK_MS, DRIVE_UPLOAD_CHUNK_BYTES (+12 more)

### Community 25 - "Recorder Engine Details"
Cohesion: 0.14
Nodes (10): acquireMicStream(), attachTabEndedHandler(), createMixedTabStream(), ensureAudiblePlayback(), logStreamAcquired(), AudioPlaybackBridge, MixedAudioMixer, RecorderAudioDeps (+2 more)

### Community 26 - "Recording Lifecycle"
Cohesion: 0.14
Nodes (8): detailPercent(), humanJoin(), writeCachedPhase(), setActiveView(), viewForPhase(), liveTabLabel(), RecordingPhase, RecordingStatusView

### Community 27 - "Shared Defaults"
Cohesion: 0.15
Nodes (24): DEFAULT_RESOLUTION_PRESET, defaultMicMode, defaultRecordingMode, LEGACY_CAMERA_FORMAT_TO_PRESET, LEGACY_VIDEO_FORMAT_OPTIONS, MICROPHONE_MODE_OPTIONS, MICROPHONE_RECORDING_FORMAT_OPTIONS, RECORDING_MODE_OPTIONS (+16 more)

### Community 28 - "Pending Upload Recovery"
Cohesion: 0.17
Nodes (20): isRecordingFilename(), groupRecoverableJobs(), RecoveredDriveFile, RecoveryOutcome, reportSafely(), resumePendingDriveUploads(), resumePendingDriveUploadsWithChrome(), ResumePendingUploadsDeps (+12 more)

### Community 29 - "Session Tab View"
Cohesion: 0.14
Nodes (6): replayUploadStates(), cssEscape(), SessionTabsCallbacks, SessionTabsView, job(), mockSend

### Community 30 - "Upload Jobs"
Cohesion: 0.14
Nodes (13): createExternalTab(), recordingDetailDate(), recordingDetailDuration(), buildStreamIcon(), driveFileUrl(), fileCountText(), svgPathForStream(), ADR-0004 (+5 more)

### Community 31 - "RPC Handlers"
Cohesion: 0.17
Nodes (21): handleAcknowledgeUploadState(), handleOffscreenCancelUpload(), handleOffscreenDiscard(), handleOffscreenRetryUpload(), handleOffscreenSetCameraMuted(), handleOffscreenSetInputDevice(), handleOffscreenSetMicMuted(), handleOffscreenSetPaused() (+13 more)

### Community 32 - "Popup Controller"
Cohesion: 0.17
Nodes (18): inputDeviceLabel(), normalizedInputLabel(), PendingPermissionStart, PopupDetailTarget, ADR-0004, uniqueInputDevices(), buildDiscardConfirmMessage(), buildDiscardErrorAlert() (+10 more)

### Community 33 - "Recording Sessions"
Cohesion: 0.25
Nodes (4): persistUploadState(), RecordingSession, projectPhase(), RecordingSessionSnapshot

### Community 34 - "Shared Kernel"
Cohesion: 0.13
Nodes (23): Phase watchdog, UploadJobStateOutbox, Offscreen README, MV3 offscreen document, OFFSCREEN_STATE, rpcHandlers, RuntimeSampler, UploadJobStateOutbox (+15 more)

### Community 35 - "History Service"
Cohesion: 0.15
Nodes (9): RecordingHistoryRepositoryPort, createEntry(), createEntryFromUploadJob(), PendingFile, RecordingHistoryService, summarize(), MemoryRepository, DownloadSettledResult (+1 more)

### Community 36 - "Performance Runner"
Cohesion: 0.16
Nodes (19): ResolutionPreset, PerfSettings, BrowserMetricSnapshot, collectBrowserMetrics(), expectedStreams(), assertArtifact(), assertPerformanceSnapshot(), collectNegativeMetrics() (+11 more)

### Community 37 - "Compiler Options"
Cohesion: 0.09
Nodes (21): DOM, ES2020, **/*.test.ts, tests/e2e/helpers/e2eRecoveryBridge.ts, compilerOptions, esModuleInterop, lib, module (+13 more)

### Community 38 - "Offscreen Manager"
Cohesion: 0.12
Nodes (17): L, OffscreenSaveListener, OffscreenStateListener, OffscreenUploadListener, ADR-0004, setActionBadgeText(), createOffscreenDocument(), hasOffscreenDocument() (+9 more)

### Community 39 - "Perf Debug Store"
Cohesion: 0.15
Nodes (10): createEmptySnapshot(), createEmptySummary(), normalizeSummary(), PerfDebugStore, getSessionStorageValues(), hasSessionStorageArea(), removeSessionStorageValues(), PerfDebugSummary (+2 more)

### Community 40 - "Recording Finalization"
Cohesion: 0.16
Nodes (14): DRIVE_ROOT_FOLDER_NAME, inferDriveRecordingFolderName(), driveFolderWebViewLink(), FinalizeArtifactsOptions, LocalSaveRequest, RecordingFinalizer, RecordingFinalizerDeps, runWithConcurrency() (+6 more)

### Community 41 - "Recording Formats"
Cohesion: 0.14
Nodes (19): getAudioMime(), getVideoMime(), getVideoOnlyMime(), contentTypeForRecordingFilename(), getRecordingFormatCapabilities(), M4A_AUDIO_MIMES, MimeSupport, MP4_TAB_MIMES (+11 more)

### Community 42 - "Upload Retry Tests"
Cohesion: 0.14
Nodes (19): createHandler(), DriveRequestRecord, DriveSimulatorProfile, DriveSimulatorStats, header(), installDriveSimulator(), InterceptedRequest, MockResponse (+11 more)

### Community 43 - "Recorder Engine.test"
Cohesion: 0.11
Nodes (8): BufferedTarget, FakeMediaRecorder, getAudioTracks(), getVideoTracks(), cloneSettings(), normalizeExtensionSettings(), normalizePositiveInt(), saveExtensionSettingsToStorage()

### Community 44 - "Settings Controls"
Cohesion: 0.19
Nodes (6): el, SettingsController, SettingsDocument, SettingsElements, RecordingFormatCapabilities, resetExtensionSettingsToDefaults()

### Community 45 - "Package Metadata"
Cohesion: 0.10
Nodes (18): author, bugs, url, dependencies, webm-duration-fix, description, engines, node (+10 more)

### Community 46 - "Background Worker"
Cohesion: 0.12
Nodes (18): controller, history, L, hydrateLegacySession(), LEGACY_SESSION_PHASE_KEY, LEGACY_SESSION_RUN_CONFIG_KEY, normalizeLegacyPhase(), VALID_PHASES (+10 more)

### Community 47 - "Drive Folder Resolution"
Cohesion: 0.19
Nodes (10): DRIVE_FILES_URL, DRIVE_FOLDER_MIME, abortError(), DriveFolderResolver, escapeDriveQueryLiteral(), SharedAbortableFlight, buildDriveHint(), formatDriveError() (+2 more)

### Community 48 - "History Entries"
Cohesion: 0.28
Nodes (6): formatSize(), RecordingsView, RecordingsViewCallbacks, sizeOf(), statusLabel(), RecordingHistoryEntry

### Community 49 - "Recording Controller"
Cohesion: 0.32
Nodes (3): RecordingController, CommandResult, isStoppablePhase()

### Community 50 - "Recording Session"
Cohesion: 0.12
Nodes (15): RecordingTarget, SessionChangeListener, SessionPersistor, ADR-0003, ADR-0004, RUN_CONFIG, createRecordingHistoryId(), createIdleSession() (+7 more)

### Community 51 - "Pending Upload Store"
Cohesion: 0.13
Nodes (7): isPendingUpload(), PendingUpload, PendingUploadStorageArea, PendingUploadStore, blob(), fakeStore(), makeDeps()

### Community 52 - "Confirmation Dialog"
Cohesion: 0.15
Nodes (6): ConfirmDialog, ConfirmDialogOptions, DialogParts, OPTIONS, overlay(), pressKey()

### Community 53 - "Settings Matrix.spec"
Cohesion: 0.19
Nodes (15): SELF_VIDEO_QUALITY_FACTOR, DeviceMode, ExtensionHarness, probeHardwareMedia(), analyzeMediaArtifact(), assertMediaToolsAvailable(), execFileAsync, firstMatch() (+7 more)

### Community 54 - "History Repository"
Cohesion: 0.21
Nodes (8): migrateVisibilityKeys(), RecordingHistoryMutation, RecordingHistoryRepository, StoredRecordingHistoryEntry, toStoredEntry(), normalizeRecordingHistoryEntry(), RecordingHistoryCursor, RecordingHistoryPage

### Community 55 - "History Types"
Cohesion: 0.12
Nodes (10): empty, error, list, loadMore, send, isRecordingHistoryMessage(), normalizeRecordingHistoryFile(), RecordingHistoryFile (+2 more)

### Community 56 - "Webpack Build"
Cohesion: 0.14
Nodes (16): { CleanWebpackPlugin }, CopyWebpackPlugin, fs, ADR-0002, KNOWN_BROWSER_TARGETS, loadProjectDotEnv(), parseDotEnv(), path (+8 more)

### Community 57 - "Meeting Recording Extension"
Cohesion: 0.14
Nodes (17): Chrome Downloads API, Diagnostics Dashboard, Direct-to-Disk Streaming, Meeting Recording Extension, IndexedDB Recording History, Local-First Capture, MediaRecorder, Microphone Capture Modes (+9 more)

### Community 58 - "Recording Auto Stop"
Cohesion: 0.22
Nodes (15): AutoStopDeps, getMeetSlug(), handleMeetingEndedMessage(), isMeetRecording(), isSameMeeting(), isSameRecordingTab(), registerRecordingAutoStop(), stopIfTargetMatches() (+7 more)

### Community 59 - "Capture Setup"
Cohesion: 0.25
Nodes (13): buildSelfVideoDiagnostics(), captureTabStreamFromId(), makeTabCaptureConstraints(), maybeGetMicStream(), readTrackCapabilities(), RecorderCaptureDeps, SelfVideoDiagnostics, createE2EMockTabStream() (+5 more)

### Community 60 - "OPFS Worker Storage"
Cohesion: 0.14
Nodes (6): DEFAULT_FLUSH_INTERVAL_MS, FlushPolicy, ctx, FileSystemSyncAccessHandle, InboundMessage, SyncCapableFileHandle

### Community 61 - "Recording Types"
Cohesion: 0.15
Nodes (10): JobFinalizer, ADR-0004, UploadTask, TabContentType, ADR-0003, ADR-0004, UploadJobFile, UploadJobStatus (+2 more)

### Community 62 - "Provider Detection"
Cohesion: 0.15
Nodes (16): A1 Artifact Naming, Durable Any-Tab Recording, A2 Provider Registry, detectProvider, Record Anywhere Test Suite, Drive Folder Parser, Legacy Filename Compatibility, Meet Behavior Frozen (+8 more)

### Community 63 - "Cloud Transcription"
Cohesion: 0.14
Nodes (16): Audio Worklet PCM Tap, B1 Audio Sidecar, B3 Cloud STT, B4 Live Streaming STT, Cloud Audio Consent Gate, Cloud STT Backend, Local Diarization Gap, Live Capture Contention Risk (+8 more)

### Community 64 - "Recording History Service"
Cohesion: 0.12
Nodes (16): History Mutation Overwrite, IndexedDB Recording History Database, Inefficient History Sorting, Local Download Open Wrapper, Metadata-Only Storage, Missing Local File, Non-Destructive History Removal, Recording History Implementation Plan (+8 more)

### Community 65 - "Check Version Monotonic"
Cohesion: 0.17
Nodes (12): { compareChromeVersions }, latestTag, latestVersion, pkg, require, compareChromeVersions(), toChromeManifestVersion(), pkg (+4 more)

### Community 66 - "Recording Controller"
Cohesion: 0.21
Nodes (12): isBlockingCapture(), RecordingControllerDeps, StartRecordingMessage, ADR-0003, ADR-0004, RUN_CONFIG, activateTab(), getCapturedTabs() (+4 more)

### Community 68 - "Popup Controller.test"
Cohesion: 0.18
Nodes (4): MicPermissionService, PermState, confirmDiscard(), flush()

### Community 69 - "Background Worker"
Cohesion: 0.13
Nodes (15): Google Meet Transcript UX Capture, Live Caption Transcript Stream, Transcript UX Observation, Background Service Worker, CaptionBuffer, Chrome Platform Wrappers, chrome.storage.session, GoogleMeetAdapter (+7 more)

### Community 70 - "Setup Real Meet Profile"
Cohesion: 0.27
Nodes (12): DEFAULT_REAL_MEET_CHROME_PROFILE, GOOGLE_AUTH_COOKIE_NAMES, hasGoogleAccountSession(), parseRealMeetProfileCli(), readValue(), REAL_MEET_PROFILE_USAGE, ensureExtensionInstalled(), ensureRecordingShortcut() (+4 more)

### Community 71 - "HTML Entry Points"
Cohesion: 0.13
Nodes (15): Camera Permission Setup Page, camsetup.js Entry Script, Camera Permission Priming, Camera Setup Theme Stylesheet, Microphone Permission Setup Page, micsetup.js Entry Script, Microphone Permission Priming, Microphone Setup Theme Stylesheet (+7 more)

### Community 72 - "ADR 0002 Cross Browser Support"
Cohesion: 0.22
Nodes (14): AuthProvider, Capability-Based Fallbacks, Capture-Source Seam, Composition Root, ADR-0002 Cross-Browser Support Strategy, Firefox Phase, getAuthToken, Hand-Rolled Webpack Seams (+6 more)

### Community 73 - "Mock Meet Testing"
Cohesion: 0.26
Nodes (14): Deterministic Playwright Suite, Mock Drive Simulator, Performance Matrix, Production Capability Guards, Scenario A CI Gate, Scenario A: Mock Google Meet E2E Testing, Synthetic Tab Capture, Real Chrome Tab Capture (+6 more)

### Community 74 - "Message Handlers"
Cohesion: 0.25
Nodes (12): MessageHandlersDeps, registerMessageHandlers(), isE2EMockDriveBuild(), isE2EDriveFetchMessage(), isMeetingEndedMessage(), isOffscreenToBgMessage(), isPerfEventMessage(), isPopupToBgMessage() (+4 more)

### Community 75 - "Session Lifecycle"
Cohesion: 0.34
Nodes (9): isFreshRecordingStart(), registerSaveHandler(), startKeepAlive(), stopKeepAlive(), awaitDownloadSettled(), downloadFile(), pokeRuntime(), sendRuntimeMessage() (+1 more)

### Community 76 - "Offscreen Storage"
Cohesion: 0.22
Nodes (14): Bounded producer-consumer pipeline, Worker to LocalFile to RAM fallback ladder, FlushPolicy, InMemoryStorageTarget, LocalFileTarget, Offscreen Storage README, Origin Private File System, All File Systems Are Not Created Equal (+6 more)

### Community 77 - "History Page View"
Cohesion: 0.21
Nodes (13): checkIcon(), cloudIcon(), dayLabel(), diskIcon(), durationOf(), editIcon(), formatDuration(), formatTime() (+5 more)

### Community 78 - "Meet Popup"
Cohesion: 0.14
Nodes (14): Capture Setup Controls, Audio and Camera Device Picker, Finalizing and Drive Upload Views, Meet Recorder Popup, Mic and Camera Permission View, Popup After-recording Stylesheet, Popup Base Stylesheet, Popup Configuration Stylesheet (+6 more)

### Community 79 - "Compiler Options"
Cohesion: 0.15
Nodes (12): playwright.config.ts, playwright.real-meet.config.ts, src/buildFlags.d.ts, tests/e2e/**/*.ts, compilerOptions, module, noEmit, noUnusedLocals (+4 more)

### Community 80 - "Background README"
Cohesion: 0.18
Nodes (13): Background README, Desired and observed state split, driveAuth, Epoch fence, Busy-only keep-alive, MV3 service worker, OffscreenManager, Recording auto-stop (+5 more)

### Community 81 - "Platform Chrome README"
Cohesion: 0.18
Nodes (13): RecordingHistoryRepository, RecordingHistoryService, awaitDownloadSettled, Platform Chrome README, openDownloadedFile, Chrome storage API seam, activeCreatedAtId index, IndexedDB recording history (+5 more)

### Community 82 - "Drive Upload README"
Cohesion: 0.22
Nodes (13): Cached token provider, DriveChunkUploader, DriveFolderResolver, DriveTarget, Drive Upload README, Google Drive API resumable upload, Local-download fallback, OAuth 2.0 (+5 more)

### Community 83 - "Timeouts Module"
Cohesion: 0.18
Nodes (3): Behavior, TIMEOUTS, ADR-0003

### Community 84 - "Create Runtime Tab"
Cohesion: 0.23
Nodes (3): createRuntimeTab(), CameraPermissionService, PermState

### Community 85 - "Caption Poller.test"
Cohesion: 0.24
Nodes (5): queryActiveTab(), CaptionPoller, mockQueryActiveTab, mockSendToContent, sendToContent()

### Community 86 - "Perf Debug Store"
Cohesion: 0.20
Nodes (12): Background Runtime Context, CpuSampler, Debug UI, Dedicated Encoder Worker, Persisted Perf Debug Dashboard Snapshot, PerfDebugReducers.ts, PerfDebugStore, PerfDebugSummary Reducer (+4 more)

### Community 87 - "Storage Split By Concern"
Cohesion: 0.17
Nodes (12): chrome.storage.local, Chrome Storage Wrappers, Cross-Area Storage Transactions, MV3 Background/Offscreen Boundary, No-Op Missing-Storage Degradation, PERF_DEBUG_SNAPSHOT_STORAGE_KEY, RECORDING_SESSION_STORAGE_KEY, Stop/Finalize Pipeline (+4 more)

### Community 88 - "ADR 0003 Recording Phase Ownership"
Cohesion: 0.21
Nodes (12): Command-Status Split, Designing Data-Intensive Applications, Desired-Observed State Split, ADR-0003 Recording Phase Ownership and Stale Offscreen Status, Per-Run Epoch Fencing, Fencing-Token Pattern, OFFSCREEN_START and OFFSCREEN_STOP, OFFSCREEN_STATE (+4 more)

### Community 89 - "Tsconfig.check Module"
Cohesion: 0.17
Nodes (11): tests, compilerOptions, noEmit, types, extends, include, chrome, jest (+3 more)

### Community 90 - "Upload Job State Outbox"
Cohesion: 0.20
Nodes (3): terminalJob, UploadJobStateOutbox, UploadJobStateStorageArea

### Community 91 - "Offscreen Engine README"
Cohesion: 0.23
Nodes (12): AudioPlaybackBridge, MediaRecorder, MixedAudioMixer, Offscreen Engine README, Optional microphone and self-video streams, RecorderEngine, Monotonic runId, Self-video resize (+4 more)

### Community 92 - "Settings README"
Cohesion: 0.23
Nodes (12): RecorderProfiles, Recording format policy, buildRecorderRuntimeSettingsSnapshot, ExtensionSettings, Frozen run configuration, normalizeExtensionSettings, RecorderRuntimeSettingsSnapshot, Recording format capability validation (+4 more)

### Community 93 - "Auth Provider"
Cohesion: 0.29
Nodes (12): AuthProvider, Platform Capabilities README, ChromeIdentityAuthProvider, createAuthProvider, drive.file scope, OAuth 2.0 RFC 6749, WebAuthFlowAuthProvider, Browser abstraction layer (+4 more)

### Community 95 - "Rpc Module"
Cohesion: 0.24
Nodes (10): makeId(), RpcRequest, RpcResponse, AnyReq, createPortRpcClient(), createPortRpcServer(), HandlerMap, Listener (+2 more)

### Community 96 - "Transform Manifest"
Cohesion: 0.23
Nodes (12): ADR-0002 Cross-browser Support Strategy, Build as Manifest Source of Truth, launchWebAuthFlow, Chrome OAuth2 Client ID Injection, package.json Version, Platform Capabilities Authentication Seam, check-production-build Guard, Source manifest.json (+4 more)

### Community 97 - "Window.mock Meet API"
Cohesion: 0.26
Nodes (12): burstCaptions, Caption Update Event Handler, emitHardwareMarker, End Meeting Event Handler, endMeeting, window.mockMeet API, replaceCaptionDom, scheduleHardwareMarker (+4 more)

### Community 98 - "Keywords Module"
Cohesion: 0.18
Nodes (11): keywords, captions, chrome-extension, google-drive, google-meet, manifest-v3, mediarecorder, offscreen-document (+3 more)

### Community 99 - "Manifest Targets.test"
Cohesion: 0.29
Nodes (8): applyTargetToManifest(), ADR-0002, getTargetProfile(), TARGET_PROFILES, usesWebAuthFlow(), require, { TARGET_PROFILES, getTargetProfile, usesWebAuthFlow, applyTargetToManifest }, transformManifest()

### Community 100 - "Manifest Target Model"
Cohesion: 0.18
Nodes (11): ADR-0002 Cross-Browser Support Strategy, Chrome OAuth2 manifest configuration, Firefox support boundary, launchWebAuthFlow, Manifest target model, Production safety gate, Real Meet E2E harness, Release build flow (+3 more)

### Community 101 - "Theme Module"
Cohesion: 0.31
Nodes (7): StorageChangedListener, EXTENSION_SETTINGS_STORAGE_KEY, ThemePreference, applyThemePreference(), initializeExtensionTheme(), ResolvedTheme, resolveThemePreference()

### Community 102 - "Build Module"
Cohesion: 0.38
Nodes (6): buildSystemInfoText(), readWebGlInfo(), readWebGpuInfo(), isTestRuntime(), LogFn, makeLogger()

### Community 103 - "Recorder Engine Types"
Cohesion: 0.20
Nodes (4): DEFAULT_MAX_RAM_BUFFER_BYTES, EngineState, InMemoryStorageTarget, InMemoryStorageTargetOptions

### Community 105 - "Popup README"
Cohesion: 0.27
Nodes (11): Popup authority model, CameraPermissionService, CaptionPoller, Detached upload view, MicPermissionService, Popup README, PopupController, RecordingStatusView (+3 more)

### Community 106 - "Real Meet Scenarios"
Cohesion: 0.27
Nodes (9): MediaArtifactAnalysis, buildRealMeetScenarios(), MediaSignalFinding, RealMeetScenario, scenario(), selectRealMeetScenarios(), baseRecordingSettings(), FullRecordingSettings (+1 more)

### Community 107 - "End To End Tests"
Cohesion: 0.20
Nodes (11): Mock Google Meet Page, End-to-end Tests, Mock Meet Extension Functional Spec, Mock Meet Fixture, Mock Meet Performance Spec, Playwright Runner, Real Meet Harness Spec, Crash and Orphan Recovery Spec (+3 more)

### Community 108 - "Meet DOM Caption Fast Path"
Cohesion: 0.22
Nodes (10): Audio STT Backend, B0 Transcript Source Seam, B5 DOM Caption Fast-paths, Provider-portable Transcription Plan, Meet DOM Caption Fast-path, Caption Selector Rot, Transcript Source Selection Policy, Timed Transcript Segment (+2 more)

### Community 109 - "ADR 0001 Platform Chrome Normalization"
Cohesion: 0.29
Nodes (10): ADR-0001 Platform Chrome Normalization Layer, Global Chrome Mock, Inline Entrypoint Listener Registration, Platform Chrome Normalization Layer, One Adapter Hypothetical Seam, Chrome Operation Locality, Append-Only ADRs, Diagnostic JSON Exports (+2 more)

### Community 110 - "Runtime Sampler"
Cohesion: 0.22
Nodes (10): Event-Loop Lag Metrics, Intentional Do-Not-Churn Verdict, JavaScript Heap Metrics, Long-Task Metrics, Offscreen Runtime Context, Performance Event Channel, Perf Instrumentation Split by Runtime Context, RuntimeSampler (+2 more)

### Community 111 - "Real Meet Cli"
Cohesion: 0.42
Nodes (7): buildRealMeetEnvironment(), parseRealMeetCli(), readValue(), REAL_MEET_USAGE, validateMeetUrl(), main(), run()

### Community 112 - "Cpu Sampler"
Cohesion: 0.22
Nodes (4): CpuInfoReader, CpuSampler, CpuUsageSnapshot, createChromeCpuSampler()

### Community 113 - "Drive Target"
Cohesion: 0.31
Nodes (4): UploadChunkResult, DriveFolderHierarchy, TokenProvider, DriveTarget

### Community 114 - "Layered Test Taxonomy"
Cohesion: 0.24
Nodes (10): Background Integration Test, E2E-adjacent Scenario Tests, Integration Tests, Jest Runner, Layered Test Taxonomy, Node Build-level Tests, node --test Runner, RecordingsController Unit Test (+2 more)

### Community 115 - "Upload Navigation Design QA"
Cohesion: 0.28
Nodes (9): Determinate Upload View, Upload Navigation Design QA, Header Progress Chip, Setup Panel, Design QA Validation, Detached Drive Upload, Google Drive API, Google OAuth Client (+1 more)

### Community 116 - "ADR 0004 Decoupled Drive Uploads"
Cohesion: 0.33
Nodes (9): Bounded Capture-Upload Concurrency, Detached Upload Jobs, ADR-0004 Decoupled Drive Uploads, OFFSCREEN_UPLOAD_STATE, Pending Upload Recovery, Persisted Upload Jobs, Popup Session Tab Bar, Upload Job (+1 more)

### Community 117 - "Perf Flags"
Cohesion: 0.22
Nodes (9): Performance Optimization Roadmap, Extended Timeslice, Extended Timeslice Crash-Loss Risk, OPFS Worker Storage, OPFS Write Batching, PerfFlags, Frozen Performance Settings Snapshot, Shorter Video Chunk Cadence (+1 more)

### Community 118 - "Check Production Build"
Cohesion: 0.22
Nodes (7): distDir, expectedVersion, forbiddenMarkers, pkg, require, { toChromeManifestVersion }, violations

### Community 119 - "Load Extension Settings From Storage"
Cohesion: 0.47
Nodes (7): handleRecordingCommand(), RecordingCommandDeps, registerRecordingCommands(), START_RECORDING_COMMAND, sendTabMessage(), buildDefaultRunConfigFromSettings(), loadExtensionSettingsFromStorage()

### Community 120 - "Content README"
Cohesion: 0.42
Nodes (9): CaptionBuffer, Content README, GoogleMeetAdapter, Live captions DOM, MeetingEndDetector, MEETING_ENDED message, MeetingProviderAdapter, MutationObserver pipeline (+1 more)

### Community 121 - "Recorder Settings Page"
Cohesion: 0.22
Nodes (9): Basic Recording Defaults, Camera Microphone and Tab Formats, Capture Resolution and Frame Rates, Recorder Chunk Timeslices, Microphone Echo Noise and Gain Processing, Professional Recording Parameters, Recorder Settings Page, settings.js Entry Script (+1 more)

### Community 122 - "Phase Watchdog"
Cohesion: 0.32
Nodes (5): createPhaseWatchdog(), PhaseWatchdog, PhaseWatchdogDeps, TimerHandle, ADR-0003

### Community 123 - "Debug README"
Cohesion: 0.39
Nodes (8): PerfDebugStore, Debug README, DebugDashboard, Event-loop lag proxy, EventTableRenderer, PerfDebugSnapshot, Dev-only system.cpu permission, SystemInfoReader

### Community 124 - "Request Module"
Cohesion: 0.36
Nodes (5): DRIVE_REQUEST_TIMEOUT_MS, createCachedTokenProvider(), driveFetch(), E2EDriveFetchResponse, normalizeHeaders()

### Community 126 - "Validate Module"
Cohesion: 0.46
Nodes (7): normalizeRecorderRuntimeSettingsSnapshot(), BoundedPositiveIntResult, readBoundedPositiveInt(), validateChunkingSettings(), validateMicrophoneSettings(), validateSelfVideoProfile(), validateTabOutput()

### Community 127 - "History Service Build"
Cohesion: 0.29
Nodes (7): Background Service Milestone, Completion Wiring Milestone, History Page Milestone, IndexedDB Repository Milestone, Popup and Build Milestone, Shared Contract Milestone, Verification Milestone

### Community 128 - "History Design"
Cohesion: 0.43
Nodes (7): History ID, IndexedDB Recording-history Database, Local File Semantics, Metadata-only Deletion, Recording History Design, Recording History Repository, Recording History Service

### Community 130 - "History Page"
Cohesion: 0.29
Nodes (7): Load More Pagination, Local Downloads and Drive Links, Paginated Durable Recording History, Recording History Page, recordings.js Entry Script, Recordings Stylesheet, Recording History Migration Spec

### Community 131 - "Triage Label Mapping"
Cohesion: 0.33
Nodes (6): Triage Label Mapping, needs-info, needs-triage, ready-for-agent, ready-for-human, wontfix

### Community 132 - "History Identifier"
Cohesion: 0.33
Nodes (6): Drive Upload Job, Recording History ID, Recording History Message Contract, RecordingSession, RecordingsController, RecordingsView

### Community 133 - "Serve Popup Gallery"
Cohesion: 0.33
Nodes (5): mimeTypes, outputRoot, port, projectRoot, server

### Community 134 - "Recording Diagnostics Dashboard"
Cohesion: 0.33
Nodes (6): debug.js Entry Script, Diagnostics Stylesheet, Diagnostics JSON Export, Recent Diagnostics Events, Recording Diagnostics Dashboard, Recording, Upload, Caption, Runtime, and System Metrics

### Community 135 - "Popup State Gallery"
Cohesion: 0.33
Nodes (6): Deterministic Chrome State Fixtures, Gallery Search Theme Viewport and Motion Controls, Popup Gallery Stylesheet, Popup State Gallery, popupGallery.js Entry Script, Popup State Previews

### Community 136 - "A3 Solo Recording UX"
Cohesion: 0.40
Nodes (5): A3 Solo Recording UX, Disallowed Capture Pages, Friendly Capture Error, Neutral Recording Copy, Provider Chip

### Community 137 - "Tier 1 Wins Default On"
Cohesion: 0.40
Nodes (5): Adaptive Self-Video Profile, Adaptive Upload Concurrency, Dynamic Drive Chunk Sizing, Parallel Upload Concurrency, Tier-1 Wins Default-On

### Community 138 - "Module README Conventions"
Cohesion: 0.50
Nodes (5): Module README Conventions, Mermaid Diagram Validation, Module Archetypes, Scoped Module Context, README Section Library

### Community 139 - "Print Redirect Uri"
Cohesion: 0.40
Nodes (4): der, hash, manifest, manifestPath

### Community 140 - "Chrome.storage.session Module"
Cohesion: 0.50
Nodes (4): chrome.storage.session, PerfDebugSnapshot, RecordingSessionSnapshot, Typed SessionStore Helper

### Community 141 - "Domain Documentation Guide"
Cohesion: 0.67
Nodes (4): ADR Pre-Exploration Review, CONTEXT Glossary, Domain Documentation Guide, Single-Context Layout

### Community 142 - "Linear Issue Tracker Guide"
Cohesion: 0.67
Nodes (4): Linear Issue Tracker Guide, Kstroevsky Team, Linear Issue Tracker, Linear MCP Operations

### Community 143 - "Record Anywhere"
Cohesion: 0.67
Nodes (3): Record Anywhere Plan, General Browser-Tab Recording, Plan B Transcription Portability

### Community 144 - "Tab Capture"
Cohesion: 0.67
Nodes (3): No Host Permissions Change, Provider-Agnostic Recording Engine, Chrome Tab Capture

### Community 145 - "OPFS Storage"
Cohesion: 1.00
Nodes (3): OPFS, Recording Bytes, Sync-Access Worker

### Community 146 - "Pnpm Workspace Configuration"
Cohesion: 0.67
Nodes (3): Puppeteer build approval, unrs-resolver build approval, pnpm workspace configuration

### Community 147 - "Extension Icon"
Cohesion: 0.67
Nodes (3): Recording Transcription Extension Icon, Microphone, Recording Indicator

## Knowledge Gaps
- **608 isolated node(s):** `name`, `version`, `description`, `chrome-extension`, `manifest-v3` (+603 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GoogleMeetAdapter` connect `Scraping Scripts` to `Package Metadata`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _608 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scraping Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.056338028169014086 - nodes in this community are weakly interconnected._
- **Should `Drive Authentication` be split into smaller, more focused modules?**
  _Cohesion score 0.05780885780885781 - nodes in this community are weakly interconnected._
- **Should `Popup Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.09435028248587571 - nodes in this community are weakly interconnected._
- **Should `Popup Gallery` be split into smaller, more focused modules?**
  _Cohesion score 0.05974025974025974 - nodes in this community are weakly interconnected._
- **Should `Recording Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.10459183673469388 - nodes in this community are weakly interconnected._
- **Should `Recording Tasks` be split into smaller, more focused modules?**
  _Cohesion score 0.08787878787878788 - nodes in this community are weakly interconnected._
- **Should `Extension Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `Message Protocol` be split into smaller, more focused modules?**
  _Cohesion score 0.058693244739756366 - nodes in this community are weakly interconnected._
