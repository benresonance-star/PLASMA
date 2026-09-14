# Imported reference runtime and historical evidence
These files are extracted text from the reviewed saved artifacts. They are preserved as reference material, not installed as production packages.
The import does not establish original-byte equivalence. Historical evidence is not a test run against this commit.

## Smallest independently runnable slice
From this directory, on a suitable Node.js installation:
```sh
node plasma-kernel-wall.test.mjs
```
The runtime, fixture and test are co-located. The original reference contract and five-test historical evidence are included.
This command was not run in the consolidation session.

## Browser bridge and persistence
The live bridge v0.1 and persistent runtime v0.2 are successive prototype artifacts. Do not load both as independent authorities.
The browser persistence tests require the integrated application HTML, Chromium and a compatible environment.
The integrated HTML is not imported in this baseline: its saved source is identified in ../source-inventory.json.
Tests retain original harness paths. The backup recovery test hard-codes /mnt/data paths; prepare a deliberate portable harness before running it. Reopen accepts positional input/output arguments.
The old tests use Page.setDocumentContent, a storage shim and fresh JavaScript realms; they do not prove normal-origin storage survival after a browser process restart.

## Production boundary
A successful localStorage write does not prove atomicity across the application checkpoint and the kernel head. Fault-inject failures before/after both writes and during reopen before claiming coherent persistence.
FNV-1a32 in the prototype store is an accidental-corruption checksum. It is not a cryptographic artifact identity, signature or independent evidence attestation.
No OCCT integration, database transaction, multi-user store, physical-device performance or live deployment is established by these files.
