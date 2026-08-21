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
- public policy snapshot shared by all users
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
If you want to delete those old MOA sheets after confirming the new deployment, run `moaRemoveLegacyPersonalDataSheets_()` manually once in the Apps Script editor.

This cleanup is intentionally not automatic.
