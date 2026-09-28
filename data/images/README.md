# Images

Committed image library for the Vision Search POC. Drop demo image binaries here (organized however the manifest references them, e.g. by category subfolder). These files are tracked in git.

- A manifest entry's `imagePath` is resolved relative to the `data/` directory, so an image at `data/images/women/shirt-001.jpg` uses `"imagePath": "images/women/shirt-001.jpg"`.
- Keep filenames Unicode-safe and stable; `assetId` and `imagePath` must stay in sync with the manifest.
- Do not place restricted or customer-confidential imagery here. Restricted or staging material belongs in the git-ignored `data/source/` or `data/raw/` folders.

The upload script (Phase 4) reads the manifest, pushes these binaries into private Blob Storage, and never writes image bytes into the Search index.
