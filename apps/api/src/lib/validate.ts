import type { z } from "zod";
import { AroError } from "./errors.js";

/** Parses with Zod; failures become contract INVALID_REQUEST errors naming paths only. */
export function parseOr400<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const where = r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
      .join("; ");
    throw new AroError(400, "INVALID_REQUEST", where);
  }
  return r.data;
}
