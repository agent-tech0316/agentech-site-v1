# Branch consolidation - October 14, 2026

Baseline: `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1` (latest remote main when work started).

## Scope

Retain `main` and `codex/eais-stable-identity-20260911`. The September 11 branch remains unchanged and unmerged at the user's explicit request. All other audited branch tips must be ancestors of the resulting main before deletion. Newer production behavior takes precedence over superseded implementations.

## Branch decisions

| Branch | Audited tip | Resolution |
| --- | --- | --- |
| `codex/aegis-eaic-reliability` | `0bc6575b49fa1cce75cafd4ad936e9eacb671a0e` | Already an ancestor of the baseline main. |
| `codex/sdk-display-release-20261005` | `3b0569012a446e3829d55c206a78540987bff865` | Already an ancestor of the baseline main. |
| `feature/master-motion-studio` | `022d90fcb787a2ecddcea9fda6979a9b964a1b2d` | Preserve the design document as a historical proposal, without activating a controller. |
| `main` | `6464e5ee6f303574eca0d68a86d63c0cfd5cc8cf` | Fast-forward the local checkout to the verified consolidated release. |
| `agent/private-master-robot-reference` | `ca8d83e2e0c306420948dcb0b87faf65330cdd02` | Already an ancestor of the baseline main. |
| `agent/reduce-robot-camera-lag` | `744bc0f5333d84444492884b2b7dfc555ff3fe39` | Patch already present in main; preserve branch ancestry without replaying it. |
| `bill/eai-camp` | `e64be7d743864fe965d1b96017a7787f031dc148` | Already an ancestor of the baseline main. |
| `bill/eai-immersion-content-20260702` | `a13b24585b469d8332dbb53fa01b9c9aace26b13` | Already an ancestor of the baseline main. |
| `bill/education-kids-content-20260626` | `94ebb52cca3cbf3fc35093d6d74c31cbff3863a5` | Already an ancestor of the baseline main. |
| `codex/add-navi-207xx-website-actions` | `50989836ce369e41bc9a9d92b165f06298934874` | Already an ancestor of the baseline main. |
| `codex/eais-stable-identity-20260911` | `c425ad5680a28670f2ae7830c1b73e3848dd4773` | Keep unchanged, outside consolidation. |
| `codex/master-camera-live-performance` | `fe0420ba967bbe1cfa5ffefb31d0a86236719dea` | Keep current H.264 implementation; merge missing historical design documents with explicit historical labels. |
| `codex/master-four-camera-live-stream` | `342b14a489f79f8f48829286d6bfbaf3a3514862` | Complete tree equals production squash 603aa6d; preserve history without replacing newer code. |
| `codex/master-waist-display` | `47f71cdf8fba86905a5a0cbf4b77a575496737bc` | Already an ancestor of the baseline main. |
| `codex/site-polish` | `37ff6768e6a4589391fbde7b1dcc2d4b4c49c077` | Already an ancestor of the baseline main. |

## Recovery and local drafts

Before changing refs, all refs were saved to a verified complete Git bundle. Its SHA-256 is `9A547F5BC94297DBB14DEA7881CEF6E28F24AD5D88977B1E1688D8A4D8F4BD8A`. Dirty tracked and non-ignored untracked files from all existing checkouts were copied and hash-checked separately.

The initial branch-only release preserved local drafts separately. The subsequent authorized draft release integrates those changes on top of consolidated main: Master recording access/schema, Navi session ownership and cleanup, Aegis result validation and Gateway operations, report copy, and the website illustration asset. See [the draft release audit](2026-10-14-local-draft-release.md). Tags are retained. Robot runtime activation is separate from website publication.

## Verification gates

- Every branch selected for deletion is reachable from consolidated main.
- Current application source matches the newer baseline; only historical documentation and this audit are added.
- Full repository tests, typecheck, and production build pass before publication.
- Publication is a normal fast-forward push, followed by expected-tip branch deletion.
- Remote branch inventory must contain exactly main and the unchanged September 11 branch.
