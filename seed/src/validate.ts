import type { ValidationResult } from "./types.js";

export function validateUsername(input: string): ValidationResult {
  if (input.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" };
  }
  if (input.length > 39) {
    return { valid: false, error: "Username must be 39 characters or fewer" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
    return { valid: false, error: "Username contains invalid characters" };
  }
  return { valid: true };
}

export function validateEmail(input: string): ValidationResult {
  if (!input.includes("@")) {
    return { valid: false, error: "Email must contain @" };
  }
  return { valid: true };
}
