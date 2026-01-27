/**
 * Normalize Unicode string to NFC form for consistent comparison
 * This fixes issues with Vietnamese characters like "Thuỷ" which can be 
 * represented differently (composed vs decomposed forms)
 */
const normalizeUnicode = (str: string): string => {
  return str.normalize("NFC");
};

/**
 * Normalize a name by trimming whitespace and collapsing multiple spaces
 * Also normalizes Unicode to NFC form for consistent Vietnamese character handling
 * Example: "  Nguyễn   Văn   An  " -> "Nguyễn Văn An"
 */
export const normalizeName = (name: string): string => {
  return normalizeUnicode(name.trim().replace(/\s+/g, " "));
};

/**
 * Compare two names for equality after normalization
 * Case-insensitive comparison with Unicode normalization
 * This handles Vietnamese characters correctly (e.g., "Thuỷ" vs "Thủy")
 */
export const compareNames = (name1: string, name2: string): boolean => {
  const normalized1 = normalizeName(name1).toLowerCase();
  const normalized2 = normalizeName(name2).toLowerCase();
  return normalized1 === normalized2;
};

/**
 * Compare two strings for equality (used for student codes, group numbers)
 * Trims whitespace and compares case-insensitively
 */
export const compareStrings = (str1: string, str2: string): boolean => {
  return normalizeUnicode(str1.trim()).toLowerCase() === normalizeUnicode(str2.trim()).toLowerCase();
};
