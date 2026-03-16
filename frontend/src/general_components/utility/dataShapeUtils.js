// Returns the value if it is an array, otherwise returns an empty array.
export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

// Returns the value if it is a plain object, otherwise returns an empty object.
export function toObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
