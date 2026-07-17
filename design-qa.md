# Redesign QA — verified, stylesheet consolidation pass

## Visual source

- `/Users/kstroevsky/Downloads/Recording extension/design.html` — popup reference states 01–08.
- User supplied recording and paused comparison screenshots — 2026-07-13.
- User supplied regression screenshots — 2026-07-13: paused stop hover, live discard, and microphone dropdown.
- User supplied upload and Recordings regression screenshots — 2026-07-13: selected Local disk, empty Recent, upload progress, cancellation, and saved files.
- User supplied final regression screenshots — 2026-07-13: destination dropdown selected-state mismatch and completed upload-file action overlap.

## Verified capture matrix

Fresh Chromium captures are in `output/playwright/redesign/`.

| State | Capture | Result |
| --- | --- | --- |
| Idle setup | `popup-light-setup.png` | verified |
| Expanded capture setup | `popup-light-expanded.png` | verified |
| Destination dropdown | `popup-light-storage-dropdown.png` | verified |
| Active recording | `popup-dark-recording.png` | verified |
| Paused recording | `popup-dark-paused.png` | verified |
| Recording menu / discard | `popup-dark-recording-menu.png`, `popup-dark-discard.png` | verified; composite is 300×509 and uses backdrop blur |
| Permission blocked | `popup-dark-blocked.png` | verified |
| Saving upload | `popup-dark-saving.png` | verified |
| Saved upload | `popup-dark-saved.png` | verified |
| Paused stop hover | `popup-light-paused-stop-hover.png`, `popup-dark-paused-stop-hover.png` | verified |
| Microphone dropdown | `popup-light-mic-dropdown.png` | verified; renders above the footer |
| Local destination selected | `popup-light-storage-local-selected.png` | verified; the selected folder icon replaces the Drive cloud |
| Empty Recent | `popup-light-recordings-empty.png` | verified; compact source-aligned empty row with no oversized spacer |
| Recent while uploading | `popup-light-recordings-uploading.png` | verified against `reference-recordings.png`; live upload precedes saved rows and has its own 5px progress track |
| Saving upload, long filenames | `popup-dark-saving.png` | verified against `reference-saving.png`; titles truncate and status/progress no longer overlap |
| Saved upload, long filenames | `popup-dark-saved.png` | verified; titles, file sizes, and open controls remain separated |
| Local destination open | `popup-light-storage-local-dropdown.png` | verified; exactly one selected row carries the check, matching the trigger value |
| In-progress upload with a completed file | `popup-dark-saving.png` | verified; filename, DONE status, progress, and file action occupy one constrained row without collision |

## Resolved defects

- The async status refresh could overwrite the Recordings view while it was loading; the explicit view is now preserved.
- Selecting the menu SVG no longer closes the menu before a discard action can be activated.
- Destination and microphone selectors have source-aligned custom options, selected states, hover/focus treatments, and stable header geometry.
- Recording, pause, upload, saved, blocked, and discard states use the reference typography, spacing, controls, and visual hierarchy.
- The discard dialog now waits for an in-flight start command, is clickable, and uses the reference-sized blurred modal composite.
- The discard message refreshes once per second from the live recording timer while the confirmation remains open.
- Both custom selectors now reset each other's trigger state and are no longer clipped by the setup-list container.
- The capture spoiler now keeps the same 52px row height in collapsed and expanded states.
- The paused Stop & Save action now explicitly overrides inherited danger-button hover styles in both themes.
- The storage trigger now clones the selected option icon, so Local disk renders its folder instead of retaining the Drive cloud.
- Recordings renders active upload jobs before saved history, caps the combined popup list, and uses the source live-progress layout.
- The empty Recent state uses a bounded list row rather than a full-height blank content area.
- The upload view no longer renders the unrelated session tab strip; file headers are a constrained two-column layout so long file names cannot collide with file status or controls.
- Restored run settings now emit a change event for each native selector, keeping its visible custom trigger and selected option in lockstep.
- File actions are now a flex item inside their own header row rather than an absolute overlay, preventing the already-uploaded file state from colliding with file status.
- The destination check is the supplied compact SVG and is rendered only on the selected option.
- The popup no longer loads a late `redesign.css` override layer. Its source-aligned rules now live once, by responsibility: shared foundation/menu, setup and Recordings, recording, upload/finalizing, and dialog.

## Regression evidence

- `npm run typecheck` — passed.
- `npm run test:unit:jest -- --runInBand` — 63 suites, 712 tests passed.
- `npm run build` — passed.
- `npm run build:e2e:mock` plus the Chromium visual-state capture — passed; discard assertion reported one visible overlay.
- The latest Chromium visual-state capture asserted that the discard copy changes after 1.1 seconds while the dialog stays open.
- The latest source/app visual comparison used `reference-recordings.png`, `reference-saving.png`, and the corresponding fresh popup captures at the same 300px popup width.
- A clean-sheet visual capture after removing the override layer verified setup, selectors, recording, paused, discard, finalizing, uploading, saved, permission, and Recordings states.

final result: passed
