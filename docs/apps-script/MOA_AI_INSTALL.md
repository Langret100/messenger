# MOA AI Apps Script

## Ownership rule

MOA personalization is local-only.

Local browser/device data:
- personal memories and interests
- recent conversation/context
- preferred tone, roughness, formality, slang and brevity
- punctuation-only / low-effort response habits
- proactive-message acceptance and ignore streak

Apps Script data:
- reusable aggregate dialogue-policy feedback only
- reusable aggregate expression/feature weights (hashed expression IDs + abstract feature IDs only)
- public policy/expression-weight snapshot shared by all users
- transient external search requests

Apps Script does not create, read, sync, or update a per-user MOA profile or personal-memory sheet.

## Files

Replace `MOA_AI.gs` with the supplied file. `Code.gs` routes stay the same:
- `moa_sync`
- `moa_commit`
- `moa_search`

Deploy a new Apps Script web-app version after replacing `MOA_AI.gs`.

## Existing legacy personal sheets

New code ignores old `모아_개인기억`, `모아_사용자성향`, and `모아_표현학습` sheets.
After the new deployment is confirmed, run the public cleanup function `moaCleanupLegacySheets()` once in the Apps Script editor.
It only deletes this allowlisted legacy set:
- `모아_개인기억`
- `모아_사용자성향`
- `모아_표현학습`
- `모아_학습후보`
- `모아_반응학습`
- `모아_주제학습`

It preserves the active public-learning sheets `모아_대화정책` and `모아_표현가중치`.
Cleanup is intentionally manual and idempotent.
