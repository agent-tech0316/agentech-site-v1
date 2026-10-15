# VORLD release retention

Keep one current published VORLD release and its tag in this repository. As of October 14, 2026, that is `vorld-v0.46.0-build52` (version 0.46.0, Build 52). The website download remains the matching Windows x64 installer.

For each future release:

1. Upload and verify the Windows installer and its checksum, then publish the release with a unique `vorld-v<version>-build<number>` tag. Increase the build number.
2. Update `lib/vorld-release.ts` with the exact version, build, download URL, byte count and SHA-256. Update the development README as appropriate. Publish these changes through the normal verified main release.
3. The **Keep latest VORLD release** workflow runs when a release is published or its website metadata/policy changes. It removes older published VORLD releases and tags only after the newest published build matches the website metadata and uploaded asset. It can also be run manually.

If metadata and assets disagree, cleanup fails before deletion. Correct the metadata or upload and rerun. Drafts, prereleases, unrelated tags, branches and higher unreleased build tags are preserved. Numeric build order prevents publishing an older build from replacing the current one.

Review without modifying GitHub:

```powershell
node --experimental-strip-types scripts/vorld-release-retention.mjs
```

Apply the reviewed current policy:

```powershell
node --experimental-strip-types scripts/vorld-release-retention.mjs --apply
```

Older published VORLD releases and their download assets are removed by this policy. The initial Build 50/51 cleanup retained local copies of the release metadata and every asset, verified against GitHub's SHA-256 digests, plus the pre-cleanup Git bundle. Git commit history and the separately retained September 11 branch are unaffected.
