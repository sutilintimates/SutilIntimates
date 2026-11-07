const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'User already registered': 'Este email já possui uma conta. Entre na sua conta.',
  'Invalid login credentials': 'Email ou senha incorretos.',
  'Email not confirmed': 'Confirme seu email antes de entrar.',
  'Password should be at least 6 characters.': 'A senha deve ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'Informe um email válido.',
  'Signups not allowed for this instance': 'Novos cadastros estão temporariamente indisponíveis.',
};

export function translateAuthError(message: string | undefined): string {
  if (!message) return 'Erro ao criar conta. Tente novamente.';
  if (AUTH_ERROR_MESSAGES[message]) return AUTH_ERROR_MESSAGES[message];
  if (/weak|easy to guess|pwned|compromised/i.test(message)) {
    return 'Senha não aceita. Escolha outra senha com pelo menos 6 caracteres.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return 'Erro ao criar conta. Tente novamente.';
}
