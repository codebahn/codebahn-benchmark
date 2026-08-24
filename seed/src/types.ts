export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface FormatOptions {
  currency?: string;
  locale?: string;
}
