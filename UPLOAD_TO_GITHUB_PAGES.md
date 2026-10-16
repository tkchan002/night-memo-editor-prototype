# Upload the complete test project to GitHub Pages

No Mac software installation is needed.

1. Extract `Nurse_Memo_Canvas_Editor_Print_Comparison_Test.zip`.
2. Open your separate GitHub testing repository in the browser.
3. Replace the old test app files with the **contents** of the extracted folder, including `.github`.
4. In the repository, use **Settings → Pages → GitHub Actions** as your deployment source.
5. Commit changes on `main` (or `master`) and wait for the deployment in **Actions**.
6. Open the published URL and follow `README.md` to compare three PDFs.

The build is triggered when you push and runs `npm install`, fixture tests, and `vite build` on GitHub's Ubuntu environment.

If the build fails, share the failing `Install dependencies` or `Build static site` step from Actions. Do not upload `node_modules` or any previous `dist` folder to GitHub.

This is intentionally not the Nurse Memo production repository and contains no Supabase settings.
