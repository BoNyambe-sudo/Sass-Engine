import { z } from 'zod';

export const accessTokenExpiries = ['5m', '15m', '30m', '1h'] as const;
export type AccessTokenExpiry = (typeof accessTokenExpiries)[number];

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z
      .string()
      .regex(
        /^mongodb(?:\+srv)?:\/\//,
        'MONGODB_URI must use the MongoDB URI scheme',
      ),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must contain at least 32 characters'),
    JWT_EXPIRY: z.enum(accessTokenExpiries).default('15m'),
    JWT_REFRESH_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    FRONTEND_URL: z
      .string()
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
      .default('http://localhost:4200'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_GROWTH: z.string().optional(),
    STRIPE_PRICE_SCALE: z.string().optional(),
    STRIPE_CHECKOUT_SUCCESS_URL: z.string().url().optional(),
    STRIPE_CHECKOUT_CANCEL_URL: z.string().url().optional(),
    STRIPE_PORTAL_RETURN_URL: z.string().url().optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      /(replace|change-me|example)/i.test(environment.JWT_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must not use a sample placeholder in production',
      });
    }
    
    if (
      environment.NODE_ENV === 'production' &&
      environment.MONGODB_URI.startsWith('mongodb://') &&
      !/[?&](tls|ssl)=true(?:&|$)/i.test(environment.MONGODB_URI)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'Production MongoDB connections must use TLS',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      (!environment.STRIPE_SECRET_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'Stripe credentials are required in production',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      (!environment.RESEND_API_KEY || !environment.EMAIL_FROM)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Resend email credentials are required in production',
      });
    }
  });

export function validateEnvironment(environment: Record<string, unknown>) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return { ...environment, ...result.data };
}
