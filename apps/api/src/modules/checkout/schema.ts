import { z } from "zod";

/** Mirrors openapi/aro-v1.yaml#/components/schemas/CreateCheckoutSessionRequest. */
export const CreateCheckoutSessionRequest = z.object({
  project: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  offer: z.string().min(1).max(128),
  market: z.string().min(1).max(16),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  payment_method: z.enum(["PIX", "CARD"]),
  payer: z.object({
    name: z.string().min(2).max(160),
    email: z.email(),
    document: z.string().max(32).optional(),
    phone: z.string().max(32).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  }),
  bump_offers: z.array(z.string().min(1).max(128)).max(4).default([]),
  attribution: z
    .object({
      utm_source: z.string().max(128).optional(),
      utm_medium: z.string().max(128).optional(),
      utm_campaign: z.string().max(160).optional(),
      utm_content: z.string().max(160).optional(),
      utm_term: z.string().max(160).optional(),
      referrer: z.string().max(512).optional(),
    })
    .strict()
    .optional(),
  metadata: z
    .record(z.string(), z.string())
    .refine((m) => Object.keys(m).length <= 20, "metadata allows at most 20 properties")
    .optional(),
});

export type CreateCheckoutSessionRequest = z.infer<typeof CreateCheckoutSessionRequest>;

export const IdempotencyKey = z.string().min(16).max(128);
