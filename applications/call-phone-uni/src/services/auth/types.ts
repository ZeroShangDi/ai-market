/** Each sign-in method owns its credentials and authentication flow. */
export interface LoginProvider<T> { readonly id: string; authenticate(credentials: T): Promise<void>; }
export interface AccountCredentials { username: string; password: string; captchaVerification?: string; }
