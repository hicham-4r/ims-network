export function normalizeProfileText(
  value: string,
) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSearchText(
  value: string,
) {
  return normalizeProfileText(value)
    .toLocaleLowerCase("en-US");
}

export function normalizeOptionalProfileText(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const normalized =
    normalizeProfileText(value);

  return normalized.length > 0
    ? normalized
    : null;
}
