// Vienna postal codes are 4 digits, so trailing digit runs almost always come
// from Apple Pay branch/store IDs rather than from the brand name itself.
const CITY_SUFFIX = /\s+(wien|vienna|graz|salzburg|innsbruck|linz|klagenfurt|villach)\s*$/i;
const TRAILING_DIGITS = /(\s+\d+)+\s*$/;
// Austrian POS terminals append a politeness word ("dankt" / "danke" /
// "bedankt sich") between the brand name and the terminal id:
//   "Billa Dankt 0000388", "BIPA DANKT WIEN", "Spar Bedankt sich 0123"
// Everything from the politeness word to end-of-string is noise.
const POS_POLITENESS = /\s+(?:dankt|danket|danke|bedankt(?:\s+sich)?)\b.*$/i;

export function normalizeMerchant(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Remove "#1234" style store IDs and everything after them.
  s = s.replace(/#\d+.*$/, "");
  // Strip German POS politeness suffix and any trailing terminal id behind it.
  s = s.replace(POS_POLITENESS, "");
  // Strip trailing city — runs before digit strip so "BILLA 0123 WIEN" can
  // shed "WIEN" first, then the digit-strip step takes "0123".
  s = s.replace(CITY_SUFFIX, "");
  // Strip trailing digit-only tokens (one or more whitespace-separated runs).
  // Anchored to end so digits embedded between brand words survive.
  s = s.replace(TRAILING_DIGITS, "");
  // City may have hidden behind the digit run (rare: "BILLA WIEN 0123"); strip again.
  s = s.replace(CITY_SUFFIX, "");
  return s.replace(/\s+/g, " ").trim();
}
