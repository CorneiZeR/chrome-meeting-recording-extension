# Upload navigation — design QA

**Source visual truth**

- Source: `/Users/kstroevsky/Downloads/Recording extension (2)/Upload navigation options.dc.html`
- Chosen option: `1b · Header progress chip`.
- Reference capture: `/private/tmp/upload-navigation-reference-light.png`.

**Implementation evidence**

- Setup with a 67% Drive upload: `/private/tmp/upload-navigation-implementation-light.png`.
- Upload detail after the chip is pressed: `/private/tmp/upload-navigation-upload-view-light.png`.
- Source and implementation side-by-side: `/private/tmp/upload-navigation-comparison.png`.
- Capture viewport: `300 × 700` CSS px, device scale factor `1`.

**Compared state and interaction path**

- The 26px header chip sits immediately left of the menu and carries the source ring, 67% label, 6px radius, and source light tokens.
- The previous visible session-tab strip is absent. The Setup panel remains active when a new upload starts.
- Chip press opens the existing determinate upload view; its live percentage matches the header ring.
- `New recording` returns to Setup while the upload continues, and the same chip remains available.
- The source’s 300px geometry was matched: 56px header, 15px Setup-label offset, 46px destination row, 52px capture row, 16px pre-footer gap, 14px footer inset, and 48px primary CTA.

**Comparison findings**

- The first comparison revealed the Setup footer began 16px too early. The source specifies a 16px gap below the capture summary; this was corrected and recaptured.
- The capture chevron now uses the exact vector path from the supplied source instead of a text-glyph approximation.
- No actionable P0/P1/P2 findings remain.

**Validation**

- `npm run typecheck` — passed.
- `npm run test:unit` — passed (63 suites, 732 tests).
- `npm run build` and `npm run build:e2e:mock` — passed.
- `git diff --check` — passed.
- Final side-by-side source/implementation comparison and Setup → Saving → Setup browser interaction check — passed.

final result: passed
