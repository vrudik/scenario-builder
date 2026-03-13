# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI pipeline (`.github/workflows/ci.yml`) for install/typecheck/build/test and non-blocking lint.
- Smoke e2e test for investor demo API (`tests/demo-api-smoke.test.ts`).
- Investor demo presentation endpoints and KPI/guardrail reset flow.

### Changed
- Runtime/tooling type cleanup for agent/runtime/tools/event-bus paths to restore green typecheck/build.
- Stabilized `tests/scenarios-api.test.ts` setup hook timeout for DB initialization.

## [0.1.1] - 2026-03-13

### Added
- Release discipline baseline: semver policy + changelog + release process guide.

### Notes
- This release formalizes delivery process artifacts and keeps behavior backward compatible.
