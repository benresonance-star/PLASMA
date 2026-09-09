# Dependency / licence register (G0A.2)

Engineering governance record (not legal advice). Unresolved distribution questions are **release** blockers until reviewed.

| name | version | purpose | license | linkingModel | distributionImpact | serverOnly | optional | replaceableAdapter | securityUpdatePolicy | source |
|------|---------|---------|---------|--------------|--------------------|------------|----------|--------------------|----------------------|--------|
| typescript | 5.9.x | compile | Apache-2.0 | toolchain | none (dev) | no | no | n/a | npm audit / pin | npm |
| vitest | 3.2.x | tests | MIT | toolchain | none (dev) | no | no | n/a | npm audit / pin | npm |
| eslint | 9.x | lint | MIT | toolchain | none (dev) | no | no | n/a | npm audit / pin | npm |
| turbo | 2.x | task runner | MPL-2.0 | toolchain | none (dev) | no | no | n/a | npm audit / pin | npm |
| postgres | 16-alpine | persistence | PostgreSQL | container | server deploy | yes | no | yes (other SQL) | image digests | Docker Hub |
| minio | RELEASE.2025-04-22 | artifact store | AGPL-3.0 | container | **server-only; review if redistributing** | yes | no | yes (S3 API) | image pin | Docker Hub |
| OpenCascade / OCCT | via occt-import-js 0.0.23 + opencascade.js 2.0.0-beta | exact geometry / STEP / constructive B-rep | LGPL-2.1 | WASM in geometry service | **server-only adapter; distribution review required** | yes | no | yes (`geometry-occt`) | pin + advisories | npm / OCCT |
| occt-import-js | 0.0.23 | OCCT WASM STEP import | LGPL-2.1 | WASM runtime | **server-only (`geometry-occt`)** | yes | no | yes | npm audit / pin | npm |
| opencascade.js | 2.0.0-beta.b5ff984 | Constructive OCCT B-rep (`occt-native`) | LGPL-2.1-only | WASM runtime (Node) | **server-only (`geometry-occt`); never designer-web** | yes | no | yes | pin + advisories | npm |
| Gmsh | Debian bookworm package / host CLI | analysis mesh | GPL-2.0 | CLI or `spds-gmsh` Docker adapter | **must remain optional; not core-domain** | yes | yes | yes (`meshing-adapter`) | pin + advisories | Debian / host |
| three | 0.185.x | viewport renderer | MIT | client | client bundle | no | no | yes (other renderer) | npm audit / pin | npm |
| react / react-dom | 19.2.x | designer UI | MIT | client | client bundle | no | no | yes | npm audit / pin | npm |
| OpenAI-compatible Chat Completions | HTTP (no SDK) | optional AI agent tools | provider ToS | server HTTP | **optional; keys never in browser; scripted fallback without key** | yes | yes | yes (`@spds/ai-interface` scripted) | pin base URL + model; rotate keys | provider |

## Policy

- Fabrication-critical runtime deps must be pinned.
- Unknown or prohibited licences fail CI once the inventory scanner is fully wired.
- Gmsh must not become an unavoidable core-domain dependency.
- User/legal review required before shipping fabrication-release distributions that include AGPL/GPL/LGPL server components.
