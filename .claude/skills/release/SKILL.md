---
name: release
description: Cut a release of a package - fold the commits into one version commit, then hand the owner the publish and deprecate commands. Use when the owner asks to release, publish or deprecate a version.
---
# Release a package

1. `package.json` `version` and the top `## <version>` section of `CHANGELOG.md` (the package's own, in a monorepo) name the new version, every other place the project's notes say a version is written agrees, and the full check passes.
2. The commits since the last version commit fold into one (`git reset --soft <last version commit>`, then commit with `git commit -F .tmp/<file>`): a message of three lines with no blank line between them, `v<version>` (`<package> v<version>` in a monorepo), ` - <one-line summary>` and `<repository URL from git remote get-url origin>/blob/main/<packages/<package>/ in a monorepo>CHANGELOG.md#<version without dots>` (`git log --format=%s` shows them joined on one line).
3. A package published to npm is published by the owner unless they ask the session to run it: `pnpm publish` (in `packages/<package>` in a monorepo; an `E404` on `PUT` means npm is not logged in: `npm login`), then the version before is deprecated with `npm deprecate <package>@<old version> "Not supported: upgrade to <version>."`. A package with `"private": true` has no publish step.
