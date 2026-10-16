import { MisticPayAdapter } from "./misticpay/adapter.js";
import { PixGoAdapter } from "./pixgo/adapter.js";
import { StripeAdapter } from "./stripe/adapter.js";
import type { PaymentProviderAdapter, ProviderKey } from "./types.js";

export type ProviderRegistry = Record<ProviderKey, PaymentProviderAdapter>;

export const defaultRegistry = (): ProviderRegistry => ({
  pixgo: new PixGoAdapter(),
  misticpay: new MisticPayAdapter(),
  stripe: new StripeAdapter(),
});
