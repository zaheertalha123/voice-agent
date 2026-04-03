/**
 * Phone number validation and normalization utility
 * Used across: tool settings, phone management, outbound calls
 */

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates and normalizes phone numbers
 * - Adds +1 prefix if missing (for US numbers)
 * - Ensures proper format
 * - Returns normalized number or error
 */
export function validatePhoneNumber(input: string): PhoneValidationResult {
  if (!input || typeof input !== "string") {
    return {
      isValid: false,
      normalized: "",
      error: "Phone number is required",
    };
  }

  let phone = input.trim();

  // Remove common formatting characters
  phone = phone.replace(/[\s\-\(\)\.]/g, "");

  // Check if it's a valid E.164 format or needs +1 prefix
  if (phone.startsWith("+")) {
    // Already has country code
    if (!/^\+\d{10,15}$/.test(phone)) {
      return {
        isValid: false,
        normalized: "",
        error: "Invalid phone format. Use +1 prefix with 10 digits (e.g., +15551234567)",
      };
    }
    return { isValid: true, normalized: phone };
  } else if (/^\d{10,15}$/.test(phone)) {
    // Numeric only - add +1 if it's 10 digits (US)
    if (phone.length === 10) {
      return { isValid: true, normalized: `+1${phone}` };
    }
    // Already has country code, just add +
    if (phone.length > 10 && phone.length <= 15) {
      return { isValid: true, normalized: `+${phone}` };
    }
    return {
      isValid: false,
      normalized: "",
      error: `Phone number must be 10 digits (will add +1) or 11-15 digits with country code`,
    };
  }

  return {
    isValid: false,
    normalized: "",
    error:
      "Phone number must contain only digits, spaces, hyphens, parentheses or +prefix",
  };
}

/**
 * Format phone for display (adds hyphens/parentheses for readability)
 * E.g., +15551234567 → +1 (555) 123-4567
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return "";

  // Remove all non-digits except leading +
  const cleaned = phone.replace(/[^\d+]/g, "");

  // If it has +1 prefix
  if (cleaned.startsWith("+1")) {
    const digits = cleaned.slice(2);
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return cleaned;
  }

  // Just return as-is if not a standard US format
  return cleaned;
}
