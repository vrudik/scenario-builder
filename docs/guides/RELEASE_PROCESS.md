# Release Process (SemVer + Changelog)

## Versioning policy

Project uses **Semantic Versioning**:
- `MAJOR` — incompatible API changes.
- `MINOR` — backward-compatible functionality.
- `PATCH` — backward-compatible fixes.

Current starting point: `0.1.1`.

## Pre-release checklist

1. Ensure CI and local checks are green:
   - `npm run typecheck --silent`
   - `npm run build`
   - `npm test -- --run`
2. Update `CHANGELOG.md`:
   - Move relevant items from `Unreleased` into a new version section.
   - Add date in `YYYY-MM-DD` format.
3. Bump version in `package.json` according to SemVer.
4. Tag release in git (recommended):
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`

## Release notes template

Use this minimal structure:

- **Summary**: what changed and why.
- **Highlights**: 3–5 key user-visible changes.
- **Compatibility**: any migration/breaking notes.
- **Validation**: commands/tests executed.

## Post-release

- Open a follow-up planning issue for next iteration.
- Keep `Unreleased` section in `CHANGELOG.md` updated continuously.
