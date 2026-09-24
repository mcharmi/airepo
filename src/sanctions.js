export function loadSanctionsSet() {
  const configured = (process.env.SANCTIONED_ADDRESSES || "")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured);
}
