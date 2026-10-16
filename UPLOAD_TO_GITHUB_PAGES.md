# Nurse Memo Canvas Editor Test — GitHub Pages

No software installation on your Mac is needed. GitHub Actions installs the dependencies and builds this test. This site contains only synthetic data, not Supabase accounts or patient records.

## Upload using GitHub website

1. Open the **separate testing repository** on github.com. Check that its default branch is `main` or `master`.
2. Open **Settings > Pages > Build and deployment > Source**. Select **GitHub Actions**.
3. Extract this ZIP in Finder. Press **Command + Shift + .** to show the hidden `.github` folder.
4. In the repository, choose **Add file > Upload files**. Upload the contents of the extracted folder **to repository root** (not an additional nested folder). Preserve `.github/workflows/deploy-pages.yml`, `src`, `tests`, and all other files.
5. Commit the changes. Check the repository's **Actions** tab for "Deploy Canvas Editor Test to GitHub Pages".
6. Wait for both jobs **build** and **deploy** to succeed. The published URL is also shown at **Settings > Pages**.
7. Open `https://YOUR-USERNAME.github.io/YOUR-TEST-REPO/` (replace both placeholders).

If GitHub's website upload does not preserve `.github/workflows`, create it separately through **Add file > Create new file** and name it `.github/workflows/deploy-pages.yml`, copying the supplied file contents. You can perform this entirely in GitHub's browser interface.

The test repository must not have a competing Pages workflow from another project. If it does, disable the older workflow or test in a clean repository.

## What happens in Actions

GitHub installs Node.js, downloads Canvas Editor 1.0.5 and Vite, runs sample-data checks, compiles the static site into `dist/`, and publishes that directory. Do not select "Deploy from a branch" for the source code: the application needs this build step.

## What to check

1. Select **3+ page stress test** and **Count rendered pages**. Confirm distinct A4 landscape pages.
2. Add a table row within the clinical tables. Confirm later content reflows without lost cells.
3. Use **Save JSON** / **Reload saved JSON** and confirm your edits return.
4. Use **Print / PDF** (in Chrome, select Save as PDF) and check that page breaks and table headers match the editor.
5. Capture one screenshot of the pages and share the generated PDF to review print fidelity.

If the published site is blank, inspect browser console and the Actions build log; do not assume pagination is verified. This package has not been built against npm dependencies in the current environment.
