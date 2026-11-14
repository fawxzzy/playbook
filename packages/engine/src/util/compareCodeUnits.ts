/**
 * Locale-independent string order: plain UTF-16 code-unit comparison.
 *
 * Use this (not `localeCompare`) for any sort whose result feeds a hash, digest, fingerprint or other value that
 * must be identical on every machine. `localeCompare` depends on the process locale and the ICU/CLDR version, so the
 * same input can sort differently on two machines (case, accents, `_` versus letters) and hash differently.
 * `localeCompare` stays correct for text shown to people.
 */
export const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
