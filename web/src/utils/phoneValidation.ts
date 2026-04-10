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
 * Uses validation first so 10/11-digit NANP stored without "+" still formats.
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return "";

  const v = validatePhoneNumber(phone);
  if (v.isValid) {
    const n = v.normalized;
    if (n.startsWith("+1")) {
      const digits = n.slice(2);
      if (digits.length === 10) {
        return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
    }
    return n;
  }

  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+1")) {
    const digits = cleaned.slice(2);
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }
  return cleaned;
}

/**
 * Value for tel inputs when loading from DB (E.164, 10-digit US, formatted strings).
 * Matches {@link formatPhoneInput} output so outbound/inbound mirror each other after fetch.
 */
export function formatStoredPhoneForInput(stored: string): string {
  const v = validatePhoneNumber(stored);
  if (v.isValid) {
    return formatPhoneInput(v.normalized);
  }
  return formatPhoneForDisplay(stored) || stored;
}

/**
 * US-centric formatting while typing: +1 (555) 123-4567
 * Strips non-digits, caps at 11 digits (leading 1 + 10-digit NANP).
 */
export function formatPhoneInput(value: string): string {
  const t = value.trim();
  // Non-US E.164: keep + and digits only (no NANP mask)
  if (t.startsWith("+") && !t.startsWith("+1")) {
    return value.replace(/[^\d+]/g, "");
  }

  let digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";

  if (digits.length > 11) {
    digits = digits.slice(0, 11);
  }

  if (digits === "1") {
    return "+1";
  }

  let n: string;
  if (digits[0] === "1" && digits.length > 1) {
    n = digits.slice(1, 11);
  } else {
    n = digits.slice(0, 10);
  }

  const a = n.slice(0, 3);
  const b = n.slice(3, 6);
  const c = n.slice(6, 10);

  let result = "+1";
  if (a.length > 0) {
    result += ` (${a}`;
    if (a.length === 3) result += ")";
  }
  if (b.length > 0) {
    if (a.length === 3) result += " ";
    result += b;
  }
  if (c.length > 0) {
    if (b.length === 3) result += "-";
    else if (b.length > 0) result += "-";
    result += c;
  }

  return result;
}
