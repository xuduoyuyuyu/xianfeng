# Module: Platform, Release, And App Shells

## FOR

- Docker compose, deploy scripts, release scripts, and local runtime helpers.
- GitHub Actions deployment entrypoints.
- Capacitor app shell and WeChat mini-program shell projects.
- Release safety rules for uploads, secrets, environment files, and clean export.
- Public Web response headers must remain compatible with third-party podcast audio; global `Cross-Origin-Embedder-Policy: require-corp` is not allowed while public media origins omit compatible CORP and CORS headers.

## NOT FOR

- Product feature implementation that belongs in `frontend/` or `backend/`.
- Production data mutation without explicit approval.
- Committing generated native build outputs or dependency directories.

## Components

- `scripts/release/`
- `scripts/deploy/`
- `scripts/local/`
- `deploy/`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `.github/workflows/`
- `apps/mobile/`
- `apps/wechat-miniprogram/`
- `RELEASE_GUIDE.md`
- `RELEASE_CLEAN_FLOW.md`

## WeChat Mini Program Shell

- The public sidebar entry `闪测` opens a native test catalog so later tests can
  be added without changing the sidebar contract. The first catalog item is the
  native `八大能力` assessment. Selecting its card opens the self/child subject
  choice as a bottom modal. The first subject-choice tap is also the native
  `getPhoneNumber` authorization gesture when the user is logged out, and the
  chosen action resumes only after the shared login/profile-completion flow
  succeeds. Self mode first restores the current user's newest saved result,
  while parent-proxy mode opens the
  existing shared child-archive side panel in place. Selecting an existing
  archive, or creating and saving one there, first restores that child's newest
  result when present and otherwise starts the test without separate picker or
  confirmation pages. Only `重新测一次` bypasses result restoration and starts a
  fresh questionnaire. The child mode uses a separate 40-question set grounded in observable
  learning, family-life, and peer behavior. Both modes use 1–5 sliders and
  treat tapping a numeric label or releasing the slider at its unchanged
  default center as an explicit answer, so score 3 is selectable without first
  moving away from 3. Catalog, introduction, subject choice, question, and
  result screens use the existing pale-purple shell, white cards, an existing
  no-hat Xiaowanzi asset where appropriate, and purple as the action color. Both modes receive an integer 1–5 radar
  profile plus rule-generated observational analysis. Completing question 40
  saves the answers and derived eight-dimension result to the authenticated
  account through `/api/flash-tests/results`; child mode also sends the selected
  archive ID. The result screen reports saving, saved, and retryable failure
  states and displays each radar-axis score on the shared 1-to-5 scale. The
  same catalog also includes a child-only `识字量`: it reuses the
  authenticated account's existing child archive and latest-result return
  path, and presents a fixed base bank of 800 unique characters in 40 pages of 20.
  The bank follows the 2024–2025 unified Chinese textbook recognition tables
  for grade-one upper, grade-one lower, and grade-two upper in appearance order
  with duplicates removed. Four 200-character display stages help pacing but
  are not official age or grade thresholds. Tapping a character opens a
  single-character large view without changing its answer; the parent then
  explicitly marks it recognized or not recognized. Advancing confirms every
  untouched character as recognized. The top back action offers save-and-exit;
  page hide or unload also preserves the active page. Per-child progress is
  saved locally and is removed only after
  the final authenticated server save succeeds. The backend validates the
  complete bank and its order, derives the binary summary server-side, and
  stores the exact known and unknown lists. Current-version history restores
  that result; old 30-character results begin the new checklist. The result
  leads with the exact `recognized / 800` count. Its character-list sheet uses
  two tabs and defaults to not-yet-recognized characters before recognized
  characters. It explicitly avoids
  extrapolation to all Chinese characters. Eight auditable references separate
  official curriculum, preschool, and character-form sources from non-official
  per-book character-table checking pages. The result page always exposes two
  independent cards for the base and advanced 800-character groups. Each card
  leads with its latest recognized count, percentage, a compact progress bar,
  and a light action; the whole card remains the entry. Either group
  can be entered at any time without a recognition threshold, and each group
  keeps its own 40-page local progress and saved result. The second bank continues the grade-two lower recognition table
  with duplicates removed, then fills the remaining unique characters from the
  2022 curriculum standard appendix common-character table. The UI disclaims
  official certification and an official fixed 800/1600-character list; it is not an exact vocabulary
  count, reading-comprehension score, or diagnosis;
  shares carry no child identity, answers, progress, or result data.
- The child-only English-word flash test is one parent-assisted written-word
  recognition task over five independent thirty-word packs. It stores and restores
  results by child and pack, and the result page lists all five packs with their
  latest recognized counts and start/recheck actions. Every word can switch the same item between its
  written form and a source-recorded real-photo candidate served by the backend.
  The mini program requests the reviewed primary JPEG or WebP and retries the
  same item with its JPEG fallback when WebP rendering fails, keeping the roughly
  12 MB photo bank outside the mini-program package. No generated or placeholder
  image is substituted, and card-view changes never create a second assessment
  mode or persistence key. All 150 English words also
  use MP3 files generated offline from one British-English voice and stored with
  the backend;
  the same listen control appears in both word and photo views without changing
  the item. The first playback downloads and persists the fixed file in the mini
  program user-data directory; later sessions reuse it locally. Playback does not
  depend on an online TTS or ASR request. The static
  set uses an RP-calibrated British voice, explicit phoneme overrides for dictionary
  conflicts, and a 150-file SHA-256 manifest beside the audio files.
  Person/body examples use source-identified Chinese subjects, while newly added
  clothing and accessory cards avoid unidentified people. The
  `2026-08-14-prea1-packs-r4` version bump keeps older 10- and 15-word results as
  historical records rather than current 30-word pack mastery.
  Entry waits at most three seconds for the latest saved result; a temporary
  network or server failure starts a new test with a non-blocking notice instead
  of trapping the user on the catalog.
  Chinese-character pronunciation uses the same backend-static and device-cache
  path as English pronunciation. The mini program persists each pre-generated
  MP3 in its user-data directory and reuses it across later page sessions; no
  playback-time TTS request is required. Opening a character's large view
  also shows its bundled tone-marked pinyin above the glyph, while the 20-item
  assessment grid remains character-only.
- WorthBuy uses dedicated native routes `pages/worthbuy/index` and
  `pages/worthbuy-detail/index`. They reuse `/api/worthbuy` for anonymous
  public reads, owner-scoped history, Pro-gated analysis, deletion, and detail
  access; browser `/worthbuy` routes remain owned by `frontend-web`.
- The mini program is a hybrid shell: native bottom tabBar, native top
  shortcuts, and WeChat-native actions,
  with product content loaded from `https://xianfeng.xinzhi.info` through
  `web-view`.
- The Programs, Reading, Materials, and Topics tabs are native first-level lists for
  faster initial paint. They fetch public APIs, cache the latest lists locally,
  and open details through the shared `pages/webview` wrapper. Topic search,
  creation, Pro/login states, and the full knowledge-tree experience remain
  owned by the web frontend and are reached from the native Topics list.
  The native Reading tab defaults to the local `/api/books` library so list
  results use the complete curated book set and can hydrate real metadata
  descriptions. The external Readly library is opt-in only through an explicit
  in-page source switch or an external-library tag coming from an external book
  detail; native search and stale source preferences must not silently reopen
  Reading on the external library. Reading lists refresh silently after showing
  cached content, without rendering a manual cache-sync hint. The Jiyue default
  logo is a fallback asset rather than a real book cover, so native list sorting
  treats those cards as no-cover cards.
  The native Topics list prioritizes fast first paint: it loads 10 topics per
  page and delays detail prefetch to one visible topic after the list is already
  rendered, while filter data can still use the larger background source.
  First entry always leaves the public list visible and does not automatically
  open login or profile onboarding. City, region, stage, and grade remain
  available from the user-invoked child archive flow. Child stages include
  pregnancy and infant profiles before preschool and school stages. Before login, saving writes an
  isolated pending personalization context rather than a formal child archive;
  list requests may use that pending context immediately. After phone login,
  the shell reads remote child profiles before any archive write. A complete
  field match reuses the existing child, an account without children creates
  its first `孩子`, and different pending data requires the user to create a
  uniquely named new child or discard the pending input. Closing that conflict
  choice preserves pending input for the next entry. No reconciliation path
  overwrites an existing child. Closing the initial form suppresses it only
  for the current foreground session. The four list requests include the
  complete profile and keep list caches isolated by profile; search, detail,
  and the external book library remain unpersonalized.
  Child profiles are the shared source of truth across native archive entry
  points. Every saved native child list is written to both compatibility cache
  keys and, when logged in, patched to `/api/users/me/xiaowanzi-sync`. The native
  Mama Resource personal-information form displays the archive-derived child
  stage and gender instead of editing an independent copy; its archive link is
  the only child-editing entry. Multiple archives map to `多孩家庭`, and
  pregnancy-stage archives do not infer a child gender.
  Native search focuses its input after the native input is mounted and sends
  debounced keywords to the lightweight backend `/api/search` boundary. It
  renders only matched card summaries instead of downloading complete Programs,
  Reading, Materials, Topics, and Guest lists for on-device filtering. Its thin
  progress indicator shares the active-tab baseline; skeletons are reserved for
  the interval before the first matching result arrives.
  Search analytics use a separate idle timer after the latest successful result
  response so intermediate input prefixes are not recorded. Explicit searches
  reuse the same idempotent event contract, and opening a result attaches only
  the first clicked content type and id. Analytics failures remain silent and
  never block search or navigation. Search is anonymous by default. After
  phone login the shell presents a versioned, optional account-link notice;
  accepting creates a server-side consent record and links this installation's
  unowned search history plus future events, while declining does not affect
  search. Native settings show the current choice and can revoke it; revocation
  unlinks that installation's events, and logout rotates the local anonymous
  installation id to reduce cross-account attribution on shared devices.
  Haozhuan (`好赚`) profile overview places task preferences before personal data
  and exposes a bottom action that opens the existing media-account editor with
  one new unselected platform account draft. Its personal editor also persists
  optional `能拍`, `能剪`, and `能写` multi-select capability chips.
  The Baibaoxiang welfare shortcut opens native `pages/welfare/index` so the
  page uses mini-program chrome and hides backend 404s as an empty welfare
  state. Claim success is handled in the native page with the configured claim
  instructions, optional copied external link, and any bound activation code;
  `/welfare` webview support remains only for compatibility links.
  Mine subpages such as archive, memory, and settings are thin `web-view`
  shells that open the web mobile half-panel via `xf_panel`, so the original
  web panel styling remains the source of truth.
  The shell keeps a native bottom `tabBar` as the reliable primary navigation.
  The web `GlobalPublicNav` hides its top nav and mobile bottom tab when
  `xf_mp=1` is present. The shell passes `xf_tab` so the web frontend can
  reserve space for native chrome; this requires the matching web build to be
  deployed to `xianfeng.xinzhi.info`.
- Run `bash scripts/release/verify-mini-webview-ready.sh` before deployment
  when a change touches mini-program `web-view`, mobile navigation, native share
  landing, or mini-program code behavior. This readiness script includes the
  `pages/share/index` registration/helpers and backend `/api/wechat-mini`
  QR-code contract tests.
  After deployment, run `bash scripts/release/verify-mini-webview-live.sh` to
  confirm the live site has the same compatibility layer.
- The Xiaowanzi bottom tab keeps only the avatar icon. The top-nav Xiaowanzi
  entry matches the website mobile menu: tap opens chat mode through
  `xf_xw=chat`, long press opens super mode through `xf_xw=home`.
- The native Xiaowanzi attachment menu starts image recognition directly:
  camera, album images, and image files are read as base64 and sent to the
  backend `attachments/recognize` endpoint before the parsed result is included
  in the next chat prompt. Links in Xiaowanzi replies keep native navigation for
  recognized site content, while ordinary external URLs copy to the clipboard.
  External mini-program short links still open directly when supported and copy
  to the clipboard if WeChat cannot complete the jump.
- The native Pro page displays `xiaowanzi_file` in the point usage policy as
  "小玩子图片文件处理", 1 point per processing request, using backend
  `/api/billing/plans` when available and the same fallback copy offline.
- The native Pro page uses WeChat Mini Program Virtual Payment for Plus and
  Pro virtual products. The shell owns product selection, requesting a fresh
  `wx.login` code, calling backend `/api/billing/virtual-orders`, invoking
  `wx.requestVirtualPayment` with the returned official parameters, and
  actively reconciling the order through
  `/api/billing/virtual-orders/:id/sync` before falling back to
  `/api/billing/me` polling. The backend sync path is responsible for confirming
  WeChat-side goods delivery after points are granted. Refund actions are
  rendered per payment record from `/api/billing/me.paymentOrders`; each refund
  request sends the selected order id rather than relying on the latest paid
  order. Virtual-payment refunds may stay pending until WeChat sends the
  `xpay_refund_notify` completion event. iOS/OS orders that cannot be refunded
  by the developer API direct users to WeChat or Apple payment records; after a
  user-side refund completes, `/api/billing/me` polling or the WeChat refund
  notification can still sync the refund back into membership points. It does
  not set membership from the
  client payment callback and does not fall back to `wx.requestPayment` for
  virtual products.
  WeChat后台 product setup, sandbox Offer ID/app key, callback routing,
  production secrets, upload, review, and publication remain release/operations
  work and are not stored in this repo.
- WeChat friend sharing uses `pages/share/index` as the branded landing page
  with the local logo asset, then opens the encoded target page. Timeline
  sharing keeps WeChat's page-query model and does not rely on a target path
  override. Native program, book, external-library, and material details retain
  their original web route while rendering without a `web-view`, so friend and
  timeline shares reopen that exact detail instead of the website root. Native
  topic and guest details keep their dedicated detail-share routes. Xiaowanzi
  generated share posters request a topic-specific
  mini-program code when the selected reply contains a topic link; the code
  lands on `pages/share/index` with a short topic scene and then opens the
  matching topic detail. Xiaowanzi conversation posters save the selected
  conversation round through `/api/wechat-mini/xiaowanzi-shares`, then request
  `/api/wechat-mini/xiaowanzi-share-qrcode` so the generated mini-program code
  lands on `pages/share/index` and loads that conversation directly.
- Native mini-program login uses WeChat phone-number authorization in place.
  Native settings, first-level menu account cards, every sidebar menu item,
  and the Mine login entry expose `open-type="getPhoneNumber"` directly when
  signed out instead of routing through the intermediate `pages/login` screen.
  `pages/mine/index` is compatibility-only: bare legacy or cached entries return
  to Programs without opening login; an explicit `panel` query reopens the same
  native half-screen settings/profile panel instead of rendering a standalone
  account overview.
  The shell sends the `getPhoneNumber` code with `wx.login` to the backend,
  stores the returned JWT/user profile, and then continues once to the menu
  destination originally tapped.
  If the returned account still has a generated station nickname or no
  permanent avatar, the shared login gate and native settings profile panel use
  WeChat `chooseAvatar` plus `nickname` input before resuming the pending
  action. The avatar is uploaded through the existing authenticated user-avatar
  endpoint and the nickname/avatar URL are persisted through `/api/users/me`;
  existing custom profiles remain unchanged. Haozhuan may copy the station
  nickname only into an empty personal display-name field and never into a
  social-platform account nickname.
- Native settings own local app preferences and maintenance actions. Font size
  is stored as a mini-program preference, applied to native pages and settings
  surfaces, and passed to `web-view` routes as `xf_font` so the web frontend can
  apply the same small/standard/large scale in mini-program mode. Cache clearing
  removes native list/search/form-draft caches while preserving login state,
  child profiles, memory settings, and font preference.
- Native guest detail pages mirror the Xiaowanzi knowledge-hub profile layout:
  the profile and related programs render immediately, while the guest-agent
  profile and signed-in conversation history load alongside them. Agent-enabled
  guests support native questions, citation expansion, and cited program links;
  guests without an enabled agent remain readable profile pages. Recommended
  booklists use the guest-detail API collection, show five entries initially,
  expand or collapse locally, and open `/books` with the exact guest and source
  name filters. Real authored books render as a horizontally scrollable card
  section and enter the existing native book detail. Active social profiles
  render only when present; tapping copies the external URL, or the account
  name when no URL exists, instead of opening third-party pages. Public content
  and reference rows use the same tap-to-copy behavior for their bound links.
- Native guest profile statistics and guest-list cards show non-zero program,
  social-media, authored-work, and recommended-booklist counts from the public
  guest API.
- Native program detail pages mirror the public same-guest relationship at the
  bottom as a horizontal program shelf and omit it when there are no matches.
- `pages/mama-resource-apply/index` is a native mini-program form for the
  Haozhuan supply intake. It mirrors the public web form and uses
  `wx.chooseMedia`/`wx.uploadFile` for Xiaohongshu profile screenshots.
  Returning from the native camera or album preserves the current profile
  editor; `onShow` refreshes tasks only while the task center is visible.
  Unsubmitted form values are kept only for an authenticated account, under an
  account-scoped local draft key, and cleared after a successful submission or
  explicit logout/account deletion. Logged-out and unauthorized states render
  an empty form and reset private task data; the legacy unscoped cache is never
  restored because its owner cannot be verified.
- After the bound mobile matches an approved Mama resource profile, the same
  native page switches from intake form to a task center. The task center reads
  task assignments and still-claimable listed tasks from the backend, shows one
  horizontal row per project, opens a project detail page with
  price/settlement/requirements, lets the user claim available tasks first,
  then submit proof link plus completion screenshot for admin collection review.
  Assigned tasks with a private content link show a `内容已下发` marker and an
  `打开专属内容` action. The action opens an in-page link modal. Tapping the
  displayed link copies it without adding copy guidance or success/failure copy
  messages to the page; link text remains selectable for long-press copying as
  a fallback. The same tap-to-copy contract applies to visible
  external links on native material, search, welfare, guest-profile, and
  WorthBuy surfaces; internal navigation and editable URL inputs are unchanged.
  No SMS notification is part of this version.
  The detail page can generate a compact task share image with a mini-program
  code from `/api/wechat-mini/mama-resource-task-qrcode`; scanning the code
  reopens `pages/mama-resource-apply/index` with the task id in `scene`.
- If the bound mobile matches a submitted Mama resource profile that is still
  pending, needs-info, or rejected, `pages/mama-resource-apply/index` shows a
  dedicated review-status page instead of showing the intake form again. Only
  approved profiles enter the task center.
- Business routes, permissions, and content rendering remain owned by the web
  frontend and backend API modules.

## Evolution

### Active

- XF-002 - Keep deployment instructions centralized and preserve runtime data
  and secrets during sync/deploy workflows.

### Deferred / Obsolete

- Add app-store/TestFlight or WeChat release roadmap items only when those
  workflows become active.
