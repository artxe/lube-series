---
name: release
description: Cut a release of one lube-series package - fold its commits into one version commit, then hand the owner the publish and deprecate commands. Use when the owner asks to release, publish or deprecate a package version.
---
# Release a package

1. The package's `package.json` `version` and the top `## <version>` section of its `CHANGELOG.md` name the new version, and the `verify` skill passes.
2. The commits since the last version commit fold into one (`git reset --soft <last version commit>`, then commit): `<package> v<version>  - <one-line summary> https://github.com/artxe/lube-series/blob/main/packages/<package>/CHANGELOG.md#<version without dots>`.
3. Publishing is the owner's unless they ask the session to run it: `pnpm publish` in `packages/<package>` (an `E404` on `PUT` means npm is not logged in: `npm login`), then the version before is deprecated with `npm deprecate <package>@<old version> "Not supported: upgrade to <version>."`.
