**Comparison Target**

- Source visual truth: `/var/folders/5k/dqrzg6x56698nhqs0zdslsvh0000gn/T/codex-clipboard-969c4f70-9a86-4db4-a80e-def8fa2a0be0.png`
- Implementation screenshot: `/private/tmp/xianfeng-program-detail-back-player-proof.png`
- Combined comparison: `/private/tmp/xianfeng-program-detail-design-comparison.png`
- Viewport: normalized to 390 x 844 from the WeChat iPhone simulator captures.
- State: program detail opened from the program list, at the top of the page with the mind-map tab selected.

**Full-View Comparison Evidence**

- The implementation preserves the source hero height, purple cover treatment, title wrapping, action row, summary card overlap, tabs, mind-map density, and right-edge player controls.
- The new back arrow occupies the exact blank top-left navigation area marked in the source image without moving the hero or WeChat capsule.

**Focused Region Comparison Evidence**

- Top navigation: the source-marked empty area and the implementation back arrow are shown side by side in the combined comparison. The arrow has the same inset and visual weight as the existing native detail-page navigation.
- Player rail: the source and implementation both show the main purple player control partially docked at the right edge over the mind-map region. This is intentional source fidelity, not clipping drift.
- Guest state: `/private/tmp/xianfeng-return-wish-settled.png` confirms the centered guest card, mobile-sized red return-wish heart, persisted count, scholar-profile entry, and player controls at the lower-page state. `/private/tmp/xianfeng-return-wish-after.png` captures the five-heart bubble feedback during the click interaction.

**Required Fidelity Surfaces**

- Fonts and typography: Chinese title, summary, metadata, tab labels, weights, line heights, wrapping, and zero negative letter spacing match the source hierarchy. No actionable mismatch.
- Spacing and layout rhythm: topbar height, 26rpx back inset, hero-to-summary overlap, card spacing, tab spacing, and right rail offsets match the source. No actionable mismatch.
- Colors and visual tokens: white topbar, deep purple hero, lavender summary accent, neutral body text, and active-tab purple remain consistent. No actionable mismatch.
- Image quality and asset fidelity: the real program cover remains the hero image; controls use local raster icon assets rather than text glyph fallbacks. The 48px red filled-heart source asset renders at the mobile component's 30px display size without transparency halos.
- Copy and content: program title, description, summary, tags, tab labels, guest return wish, and player labels remain intact.

**Findings**

- No actionable P0, P1, or P2 visual differences remain for the requested list-to-detail back navigation and the compared program-detail state.

**Comparison History**

- Iteration 1, P1: program details opened from the list without an in-page return control. Fix: added the native white topbar and left back control, wired to `goBack`, with a program-list fallback. Post-fix evidence: `/private/tmp/xianfeng-program-detail-back-player-proof.png` and the right side of `/private/tmp/xianfeng-program-detail-design-comparison.png`.
- Iteration 2, reviewed but not a finding: the main player looked partially hidden over the mind-map canvas. Source comparison showed the same right-edge docking treatment, so the experimental overlay change was removed and the source-aligned layout was retained.
- Iteration 3, P1: the mini program used a small purple outline heart that toggled off, while the mobile component uses a 30px red filled heart, first-click counting, and repeatable five-heart feedback without cancellation. Fix: aligned both program-guest and expert-detail wish controls with the mobile component and shared guest-level storage/API behavior. Post-fix evidence: `/private/tmp/xianfeng-return-wish-before.png`, `/private/tmp/xianfeng-return-wish-after.png`, and `/private/tmp/xianfeng-return-wish-settled.png`.

**Primary Interactions Tested**

- Program list card opens `pages/webview/index`.
- Top-left back control returns to `pages/programs/index`.
- Playback speed changes from 1.0x to 1.25x.
- Transcript tab exposes timed transcript rows.
- Guest return-wish content and scholar-profile entry render in the lower-page state.
- Return-wish click animates five hearts, increments once, and keeps the recorded count after the animation finishes.

**Follow-up Polish**

- P3: capture-time status-bar time and simulator raster scaling differ between screenshots; these are tooling artifacts and do not affect the mini-program layout.

**Implementation Checklist**

- [x] Add program-detail native topbar and back control.
- [x] Preserve program hero, summary, tabs, mind map, guest return wish, and playback controls.
- [x] Verify list-to-detail-to-list navigation in WeChat Developer Tools.
- [x] Compare the source and implementation at a normalized mobile viewport.

final result: passed
