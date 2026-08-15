# Chinese character pronunciation audio

This directory holds the generated `r1` MP3 set for the fixed 1,600-character
recognition bank. Runtime requests read these files and never call TTS for a
Chinese character.

- Filename: lowercase Unicode code point, for example `5b57.mp3` for `字`.
- Generator: `npm run flash-test:generate-character-pronunciation` from
  `backend/`.
- Provider and voice: Volcengine TTS 2.0,
  `zh_female_vv_uranus_bigtts`, generated with the local-only
  `VOLCENGINE_TTS_GENERATION_API_KEY`.
- Integrity inventory: `SHA256-r1.txt`, written only after all bank files are
  present.

Do not release the static pronunciation path until the manifest contains all
1,600 unique bank characters and the focused decode/playback checks pass.
