export function initialAuthMode(mode: string | null): 'signup' | 'signin' | 'forgot' {
  return mode === 'forgot' || mode === 'signin' ? mode : 'signup';
}
