const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d\s/-]{7,24}$/;

export function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export function hasMinLength(value: string, minLength: number) {
  return value.trim().length >= minLength;
}

export function isValidEmail(value: string) {
  return emailPattern.test(value);
}

export function isValidPhone(value: string) {
  return phonePattern.test(value);
}

export function isAllowedValue<T extends string>(value: string, allowed: readonly T[]) {
  return allowed.includes(value as T);
}
