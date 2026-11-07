export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function hasRepeatedDigits(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, index) => acc + Number(digits[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;
  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(digits[9]) === first && Number(digits[10]) === second;
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(digits[12]) === first && Number(digits[13]) === second;
}

export function isValidTaxId(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
}

export function formatTaxId(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  const isCnpj = digits.length > 11;
  const parts = isCnpj
    ? [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 12), digits.slice(12, 14)]
    : [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
  const separators = isCnpj ? ['.', '.', '/', '-'] : ['.', '.', '-'];

  return parts.reduce((output, part, index) => {
    if (!part) return output;
    return index === 0 ? part : `${output}${separators[index - 1]}${part}`;
  }, '');
}
