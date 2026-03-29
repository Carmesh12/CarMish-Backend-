export interface PasswordResetPayload {
  sub: string; // account id
  email: string;
  type: string; // 'password_reset'
}
