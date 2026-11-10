const PASSWORD_SYMBOLS = new Set('!@#$%^&*()_+-=[]{};\'\\":|<>?,./`~');

export const PASSWORD_REQUIREMENTS = [
  { label: 'Pelo menos 8 caracteres', test: (value) => value.length >= 8 },
  {
    label: 'Letras maiúsculas e minúsculas',
    test: (value) => /[a-z]/u.test(value) && /[A-Z]/u.test(value)
  },
  { label: 'Pelo menos um número', test: (value) => /\d/u.test(value) },
  {
    label: 'Pelo menos um símbolo, como ! ou #',
    test: (value) => [...value].some((character) => PASSWORD_SYMBOLS.has(character))
  }
];

export function passwordRequirementState(password) {
  const value = String(password || '');
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    complete: requirement.test(value)
  }));
}

export function passwordMeetsRequirements(password) {
  return passwordRequirementState(password).every((requirement) => requirement.complete);
}
