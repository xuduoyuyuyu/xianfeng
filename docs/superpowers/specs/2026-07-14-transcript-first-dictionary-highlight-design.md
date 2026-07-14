# Transcript First Dictionary Highlight Design

## Goal

In one program's complete mini-program transcript, highlight each education
dictionary entry only on its first occurrence. All later occurrences of that
entry render as ordinary transcript text.

## Scope

- Change the native WeChat mini-program program-detail transcript only.
- Keep the existing dictionary dialog interaction for the first highlighted
  occurrence.
- Do not modify backend dictionary data, API payloads, or the web program page.

## Entry Identity and Ordering

An entry is considered seen by its normalized dictionary entry `id`, not by the
visible matched text. The canonical term and all aliases therefore share one
highlight opportunity.

Transcript segments are processed in their existing array order. Text inside a
segment is processed from left to right. The first canonical-term or alias match
for an unseen entry becomes the interactive dictionary node and marks that entry
as seen for the remainder of the transcript.

## Matching Behavior

- Preserve the existing longest-match-first candidate ordering.
- A match for an already-seen entry is emitted as ordinary text.
- Adjacent ordinary characters and suppressed matches are coalesced into text
  nodes where the current renderer permits it.
- Different dictionary entries retain independent first-occurrence highlights.
- Matching a longer entry such as `国际教育` does not consume a separate shorter
  entry such as `教育`; the shorter entry is consumed only when it is itself matched.
- Each call that normalizes a program transcript creates a fresh seen-entry set,
  so loading or switching programs resets the scope.

## Implementation Boundary

`normalizeTranscript` owns one `Set` for the complete transcript normalization
pass and passes it into `buildTranscriptDictionaryNodes` for each segment. The
node builder checks and updates the set by entry ID while retaining its existing
cursor and longest-match logic.

No persistent page state is introduced because the annotated transcript is
fully derived from the program API response.

## Verification

The existing native program runtime fixture will prove that:

1. The first canonical occurrence is a dictionary node.
2. A later alias of the same entry in the same segment is plain text.
3. Later canonical and alias occurrences in another segment are plain text.
4. A different entry still receives its own first highlight.
5. Dictionary dialog behavior remains available from the retained first node.

The focused mini-program test and the broader mini-program release suite must
pass before completion.
