import { z } from 'zod';

/**
 * Password policy, NIST SP 800-63B flavoured:
 *   · length is the primary control (12+), no composition rules;
 *   · a blocklist of the passwords attackers try first;
 *   · no arbitrary upper bound below 64 that would break passphrases.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  '123456789012',
  'contrasena123',
  'contraseña123',
  'password1234',
  'qwertyuiop12',
  'administrador',
  'freeairadar1',
  'iloveyou1234',
  '111111111111',
  'aaaaaaaaaaaa',
]);

export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(MAX_PASSWORD_LENGTH, 'La contraseña es demasiado larga.')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'Esa contraseña aparece en listas de contraseñas filtradas. Elige otra.',
  })
  .refine((value) => new Set(value).size > 4, {
    message: 'La contraseña es demasiado repetitiva.',
  });

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(254)
  .email('Introduce un correo electrónico válido.');

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(80, 'El nombre es demasiado largo.');

export const SignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema.optional(),
});

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Escribe tu contraseña.').max(MAX_PASSWORD_LENGTH),
});

export const ResetRequestSchema = z.object({ email: EmailSchema });

export const ResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  password: PasswordSchema,
});

/** Rough strength signal for the sign-up meter. Not a security control. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 16) score++;
  if (new Set(password).size >= 10) score++;
  if (/\s/.test(password.trim()) || /[^\p{L}\p{N}]/u.test(password)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

export const STRENGTH_LABEL: Record<number, string> = {
  0: 'Muy débil',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Buena',
  4: 'Excelente',
};
