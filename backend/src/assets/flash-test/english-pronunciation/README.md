# English pronunciation audio

These 150 MP3 files are generated offline for the English word-reading flash test. The authenticated backend returns the matching static file without calling online TTS or ASR. The mini program stores the file in its user-data directory on first playback and reuses it across later sessions.

The current calibrated set is `r5`. Every file is pinned by `SHA256-r5.txt`.

## Voice and attribution

- Voice model: `en_GB-cori-high` from `rhasspy/piper-voices`
- Model card: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/cori/high/MODEL_CARD
- Voice model repository license: MIT, https://huggingface.co/rhasspy/piper-voices/blob/main/LICENSE
- Model SHA-256: `470b4dd634c98f8a4850d7626ffc3dfc90774628eeef6605a6dd8f88f30a5903`
- Upstream config SHA-256: `9e7fb5b5671612c22f3c81cbe46c1ae87b031a4632bcb509e499dad6f1e2adec`
- Calibrated RP config SHA-256: `8d56fadc66c865bd08364888fedf4f6d1284a8f61a7c7bedd09bab3bea820777`
- Source dataset: 24 hours of UK English LibriVox recordings
- Dataset license: public domain, https://librivox.org/pages/public-domain/
- Generator: Piper TTS `1.6.1`
- Phonemizer: eSpeak `en-gb-x-rp`; the upstream generic `en` setting is not used
- Synthesis settings: `noise_scale=0.3`, `noise_w_scale=0.2`, `length_scale=1.0`
- Encoding: mono MP3, 22,050 Hz, 48 kbps
- Encoder: `lamejs` `1.2.1`

Each synthesis input ends with a non-spoken comma to stabilize single-word duration. The accepted WAV candidates are between 0.25 and 1.8 seconds; the shipped set is approximately 0.4 to 1.0 seconds per word.

Six entries override the default phonemizer output so the audio follows the displayed British pronunciation instead of a conflicting dictionary variant:

- `deer`: `dˈɪə`
- `ear`: `ˈɪə`
- `giraffe`: `dʒəɹˈɑːf`
- `kangaroo`: `kˌæŋɡəɹˈuː`
- `onion`: `ˈʌnjən`
- `scissors`: `sˈɪzəz`

## Covered words

The covered-word contract is the 150-item bank in `apps/wechat-miniprogram/utils/englishPictureNaming.js`. The backend test verifies that every active word has a static MP3, a valid MP3 header, and the exact calibrated SHA-256 hash, so this set cannot drift silently from the assessment bank.
