# Changelog

## [0.5.2](https://github.com/msegoviadev/spec-mind/compare/v0.5.1...v0.5.2) (2026-04-14)


### Bug Fixes

* sign macOS binaries with JIT entitlements via ldid ([d4a191f](https://github.com/msegoviadev/spec-mind/commit/d4a191f7e45b72eaca8283b011d3ba114d82f049))

## [0.5.1](https://github.com/msegoviadev/spec-mind/compare/v0.5.0...v0.5.1) (2026-04-13)


### Bug Fixes

* resolve intra-specs $refs for requestBody, responses and parameters ([66a4edf](https://github.com/msegoviadev/spec-mind/commit/66a4edf5c8027129e2a51e925ecae3aa3d6c0df8))

## [0.5.0](https://github.com/msegoviadev/spec-mind/compare/v0.4.6...v0.5.0) (2026-03-28)


### Features

* add servers list to .mind header when multiple servers defined ([9f653c7](https://github.com/msegoviadev/spec-mind/commit/9f653c717e5d0dc42fa5253961119d0247ea0171))
* improve .mind header and add servers support ([8110145](https://github.com/msegoviadev/spec-mind/commit/8110145f1d3f65ea01360e0c5f388346bec68246))
* show server variable enums inline in Servers header ([1633f8a](https://github.com/msegoviadev/spec-mind/commit/1633f8a7f2bc437c21dd39c746a98d02b0545449))


### Bug Fixes

* trim trailing blank lines from .mind output ([51b5054](https://github.com/msegoviadev/spec-mind/commit/51b5054f8b63c102bde93308ee16041a9b0bd92f))

## [0.4.6](https://github.com/msegoviadev/spec-mind/compare/v0.4.5...v0.4.6) (2026-03-28)


### Bug Fixes

* trigger release to test homebrew workflow ([f4f9297](https://github.com/msegoviadev/spec-mind/commit/f4f9297de4ab4a0aa751fb01011741d480126406))

## [0.4.5](https://github.com/msegoviadev/spec-mind/compare/v0.4.4...v0.4.5) (2026-03-28)


### Bug Fixes

* use workflow_run to wait for Release workflow completion ([426d870](https://github.com/msegoviadev/spec-mind/commit/426d87079679b8840367f16af21d4d17f2c6b251))

## [0.4.4](https://github.com/msegoviadev/spec-mind/compare/v0.4.3...v0.4.4) (2026-03-28)


### Bug Fixes

* trigger release for debugging ([a477398](https://github.com/msegoviadev/spec-mind/commit/a477398359f24056fb1ac0b788b4081277245b9c))

## [0.4.3](https://github.com/msegoviadev/spec-mind/compare/v0.4.2...v0.4.3) (2026-03-28)


### Bug Fixes

* avoid GitHub Actions masking by processing checksums inline ([21f3b5c](https://github.com/msegoviadev/spec-mind/commit/21f3b5cc1ae75c0aa42bd1f5f55faf49d6accd0a))

## [0.4.2](https://github.com/msegoviadev/spec-mind/compare/v0.4.1...v0.4.2) (2026-03-28)


### Bug Fixes

* use robust sed pattern to update checksums by URL context ([dc3aaba](https://github.com/msegoviadev/spec-mind/commit/dc3aaba2aff9e292d65726a9017c89f74b34b313))

## [0.4.1](https://github.com/msegoviadev/spec-mind/compare/v0.4.0...v0.4.1) (2026-03-28)


### Bug Fixes

* use PAT for release-please to trigger downstream workflows ([26cf20b](https://github.com/msegoviadev/spec-mind/commit/26cf20b7e8a1275ae879ac9beb7e1dc3301a4dd2))

## [0.4.0](https://github.com/msegoviadev/spec-mind/compare/v0.3.1...v0.4.0) (2026-03-28)


### Features

* add homebrew tap support with auto-update workflow ([eb1e6c8](https://github.com/msegoviadev/spec-mind/commit/eb1e6c8ff9d1fac9311d0bd4126a6f62c98c30a8))

## [0.3.1](https://github.com/msegoviadev/spec-mind/compare/v0.3.0...v0.3.1) (2026-03-22)


### Bug Fixes

* update README output format example ([a6cbb2d](https://github.com/msegoviadev/spec-mind/commit/a6cbb2d65a4dfc0db0ab7a37086bbfccddafc0f4))
* update README output format example to match actual CLI output ([096feff](https://github.com/msegoviadev/spec-mind/commit/096feff515d7ae6a0623d0e09513ae0bfdff5cbd))

## [0.3.0](https://github.com/msegoviadev/spec-mind/compare/v0.2.0...v0.3.0) (2026-03-22)


### Features

* implement converter for OpenAPI to .mind.yaml ([b20ace3](https://github.com/msegoviadev/spec-mind/commit/b20ace312cab76f73f1cbf5f3d3f2635b321e297))


### Bug Fixes

* add release-please-config.json to enable GitHub Release creation ([0e0ba5e](https://github.com/msegoviadev/spec-mind/commit/0e0ba5eeec92f9549fa45cd8ff82ebc927831984))
* remove invalid package-name from release-please workflow ([cbf8eb6](https://github.com/msegoviadev/spec-mind/commit/cbf8eb64452e56f6d2e25a10a76b4aee42959dfa))
* remove package name prefix from release tags ([0b73669](https://github.com/msegoviadev/spec-mind/commit/0b7366976e0dfc69f454379b4af86bc525f68246))
* resolve TypeScript strict type checking errors ([368cd3d](https://github.com/msegoviadev/spec-mind/commit/368cd3dc779edf627336310b8c34166919a77623))
* update README with binary installation instructions ([6ea0ca5](https://github.com/msegoviadev/spec-mind/commit/6ea0ca572a2db6ec23c09f6286f257139afee70c))

## [0.2.0](https://github.com/msegoviadev/spec-mind/compare/spec-mind-v0.1.2...spec-mind-v0.2.0) (2026-03-22)


### Features

* implement converter for OpenAPI to .mind.yaml ([b20ace3](https://github.com/msegoviadev/spec-mind/commit/b20ace312cab76f73f1cbf5f3d3f2635b321e297))


### Bug Fixes

* add release-please-config.json to enable GitHub Release creation ([0e0ba5e](https://github.com/msegoviadev/spec-mind/commit/0e0ba5eeec92f9549fa45cd8ff82ebc927831984))
* remove invalid package-name from release-please workflow ([cbf8eb6](https://github.com/msegoviadev/spec-mind/commit/cbf8eb64452e56f6d2e25a10a76b4aee42959dfa))
* resolve TypeScript strict type checking errors ([368cd3d](https://github.com/msegoviadev/spec-mind/commit/368cd3dc779edf627336310b8c34166919a77623))
* update README with binary installation instructions ([6ea0ca5](https://github.com/msegoviadev/spec-mind/commit/6ea0ca572a2db6ec23c09f6286f257139afee70c))

## [0.1.2](https://github.com/msegoviadev/spec-mind/compare/v0.1.1...v0.1.2) (2026-03-22)


### Bug Fixes

* remove invalid package-name from release-please workflow ([cbf8eb6](https://github.com/msegoviadev/spec-mind/commit/cbf8eb64452e56f6d2e25a10a76b4aee42959dfa))

## [0.1.1](https://github.com/msegoviadev/spec-mind/compare/v0.1.0...v0.1.1) (2026-03-22)


### Bug Fixes

* update README with binary installation instructions ([6ea0ca5](https://github.com/msegoviadev/spec-mind/commit/6ea0ca572a2db6ec23c09f6286f257139afee70c))
