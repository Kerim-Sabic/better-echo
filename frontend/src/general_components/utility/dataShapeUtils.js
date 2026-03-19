// Returns the value if it is an array, otherwise returns an empty array.
export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

// Returns the value if it is a plain object, otherwise returns an empty object.
export function toObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

// Returns a trimmed string if the value is not empty, otherwise returns null.
export function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
