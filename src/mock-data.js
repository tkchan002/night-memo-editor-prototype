/** All figures and narratives are fabricated; never connect to a live ward database. */
export const INITIAL_SOURCE = Object.freeze({
  reportingNight: '2026-10-12',
  wards: [
    { id: 'F10', pmAdmissions: 3, nightAdmissions: 2, pmDischarges: 1, nightDischarges: 2, census: 41, capacity: 30, infection: 'Nil new alerts.' },
    { id: 'C10', pmAdmissions: 2, nightAdmissions: 1, pmDischarges: 1, nightDischarges: 0, census: 28, capacity: 32, infection: 'One precautionary isolation (sample).' },
    { id: 'E6', pmAdmissions: 1, nightAdmissions: 0, pmDischarges: 2, nightDischarges: 1, census: 24, capacity: 26, infection: 'No updates (sample).' }
  ]
});
export function freshSource() { return structuredClone(INITIAL_SOURCE); }
