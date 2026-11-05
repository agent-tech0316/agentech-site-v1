export function initialAuthMode(mode: string | null): 'signup' | 'signin' | 'forgot' {
  return mode === 'forgot' || mode === 'signin' ? mode : 'signup';
}

export function loginDisplayEmail(cachedEmail: string | undefined, eaicReauth: boolean, signedOut: string | null) {
  return eaicReauth || signedOut === "1" ? "" : cachedEmail ?? "";
}
