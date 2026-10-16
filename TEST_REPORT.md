# Print comparison test report — pre-deployment

## Observed failure in the first test PDF (user-supplied)

- Input document: `Nurse Memo _ Canvas Editor evaluation.pdf`.
- PDF physically contains **10 A4 landscape pages**, each about 842 × 595 points.
- Rendered page-number labels in the document run from **Page 1 of 7** to **Page 7 of 7**.
- Page 2 of the physical PDF contains the internal `Page 1 of 7` footer and the start of the next editor page. Hence the printed file was paginated again after Canvas Editor had already laid out seven pages.
- Inspecting the PDF found page images but **zero extracted text words** on each physical page; the uploaded PDF was image-based.
- In the stress sample, several long table headers and ward identifiers wrap awkwardly; that issue is separate from the page-count mismatch.

## Hypotheses tested by this version

1. `executePrint()` may double-paginate page images in browser print layout.
2. Taking the exact images returned by `getImage()` and placing **one image per physical PDF page** should eliminate extra page splitting, but stays image-based.
3. A structured-data vector renderer may provide selectable text and a closer one-to-one page model; accuracy, font metrics and table splitting still need actual PDF comparison.

## Three independent paths

- **Native**: existing `executePrint()` left unchanged so the failure can be reproduced.
- **Page-locked**: jsPDF creates `N` physical A4 landscape pages for `N` `getImage()` results. Geometry is aspect-ratio preserved. This is a control, not a text-quality improvement.
- **Vector**: the independent `canvas-editor-pdf` package consumes `editor.command.getValue()` and generates a PDF with drawing and text commands. The reported jsPDF page count is compared to the editor `getImage()` page count. The page may differ because the PDF renderer has separate font measurement and layout logic.

## Current checks

- Fixture shape: 3 tables; normal 10 admission/10 infection rows; stress 72 admission/38 infection rows.
- PDF page-fit code preserves image aspect ratio within 297 × 210 mm.
- The code detects 7 vs 10 as a mismatch.
- Invalid/empty page data fails with an explanatory error.
- JavaScript sources pass syntax checks.

## Not yet verified

- GitHub Actions npm install/build with `canvas-editor-pdf@0.7.0` and `jspdf@4.2.1`.
- Actual exported page counts for native, page-locked and vector routes.
- Table splitting, font selection and text searchability of the vector route.
- Browser performance with the multi-page stress fixture.

An editor replacement decision should remain **pending** until those checks pass.
