# Test report

Fresh verification on 2026-10-26:

| Command | Result |
|---|---|
| `npm test` | exit 0; 552 total, 547 passed, 0 failed, 5 Windows/platform skips |
| `npm run smoke:v01` | 5/5 legacy steps passed |
| `npm run smoke:doctor:packaged` | passed; 25 KB files shipped |
| `npm run smoke:trigger:init` | passed |
| `npm run smoke:runtimes` | passed |
| `npm run smoke:isolation` | passed |
| `npm run smoke:matrix` | passed |
| `npm run smoke:baseline` | 8/8 controls passed; 0 model/auth calls |
| `npm run smoke:ci` | 11/11 controls passed; 0 model calls |
| `npm run test:integration` | exit 2 by design; refused before model calls because opt-in/auth variables were absent |

The five skips are Windows privilege-dependent symlink controls plus the local PowerShell availability control. No paid model call was made by `npm test` or the registered smokes.
