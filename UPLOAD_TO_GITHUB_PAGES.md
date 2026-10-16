# Fast upload on a MacBook (no software installation)

1. Double-click the ZIP to extract it.
2. Open your GitHub test repository.
3. Under Settings > Pages, choose GitHub Actions as the deployment source.
4. Upload the extracted **contents**, not the ZIP itself. Include `.github` (show hidden files in Finder with `Command + Shift + .`).
5. Commit your changes.
6. Under Actions, wait for **Deploy Nurse Memo Document Test** to turn green.
7. Open your repository's published Pages URL. The editor may take time to initialise because its word-processing engine is large.
8. Test the normal document first, then stress. Save edited DOCX and export PDF. If the iframe cannot initialise, use the fallback link and import the fixture directly in the standalone editor.

If old Canvas Editor files remain in the repo, they are not deployed by this workflow. For cleanliness, delete `src`, `public`, old Canvas tests, `package.json` and `vite.config.js` (only in the **testing** repo). Do not delete your main Nurse Memo files.
