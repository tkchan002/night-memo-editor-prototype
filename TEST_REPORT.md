# Canvas Editor evaluation — Test report (initial)

Baseline: standalone proof of concept derived from the clinical table structure of Nurse Memo's latest landscape Jodit repository. No real report records used.

| Check | Result | Evidence / next step |
|---|---|---|
| Current package/docs researched | Confirmed | Official README and command/option/schema docs |
| 13-column admission table fixture | Static check | 72 stress rows / 10 normal rows; nested header rows with rowspan and colspan |
| 9-column infection table fixture | Static check | 38 stress rows / 10 normal rows |
| Fixture JSON round-trip | Static check | `npm run check` |
| Actual Canvas Editor 1.0.5 starts in Chromium | **Unverified** | Requires fetching npm library |
| Live 3+ page reflow | **Unverified** | Run locally with real engine |
| Cross-page table edits | **Unverified** | Test table row insertion across breaks |
| Repeated table header rows | **Unverified** | Visually inspect multi-page output |
| Save / reload via editor command | **Unverified** | Browser check script included |
| Print / PDF page fidelity | **Unverified** | Compare native printed PDF to editor page images |
| GitHub Pages integration | **Unverified** | Package is Vite compatible in principle; deployment not tested |

**Decision so far:** Do not replace Jodit in the production/demo Nurse Memo until the real-engine checks pass. The library's documentation shows a plausible technical path, but its table pagination and print equivalence are high-risk, version-specific behaviours.
