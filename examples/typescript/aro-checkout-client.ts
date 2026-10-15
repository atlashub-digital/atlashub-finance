export type Money = {
  amount_minor: number;
  currency: string;
};

export type PixPaymentInstruction = {
  kind: "PIX";
  copy_paste: string;
  qr_payload: string;
  expires_at: string;
};

export type CheckoutSession = {
  id: string;
  order_id: string;
  project: string;
  offer: string;
  state:
    | "CREATED"
    | "PENDING"
    | "APPROVED"
    | "FAILED"
    | "CANCELED"
    | "EXPIRED"
    | "REFUNDED"
    | "CHARGEBACK";
  amount: Money;
  checkout_secret: string;
  payment?: PixPaymentInstruction | {
    kind: "CARD";
    client_secret?: string;
    redirect_url?: string;
  };
  expires_at?: string;
  created_at?: string;
};

export type CreateCheckoutInput = {
  offer: string;
  market: string;
  country?: string;
  currency: string;
  payment_method: "PIX" | "CARD";
  payer: {
    name: string;
    email: string;
    document?: string;
    phone?: string;
    country?: string;
  };
  bump_offers?: string[];
  attribution?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    referrer?: string;
  };
};

export class AroCheckoutClient {
  constructor(
    private readonly config: {
      apiUrl: string;
      project: string;
      publicKey: string;
    },
  ) {}

  async createCheckout(
    input: CreateCheckoutInput,
    idempotencyKey: string,
  ): Promise<CheckoutSession> {
    const response = await fetch(
      this.config.apiUrl.replace(/\/$/, "") + "/v1/checkout-sessions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-ARO-Public-Key": this.config.publicKey,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          project: this.config.project,
          ...input,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(
        typeof error?.error === "string" ? error.error : "ARO_CHECKOUT_FAILED",
      );
    }

    return (await response.json()) as CheckoutSession;
  }

  async getCheckout(
    checkoutId: string,
    checkoutSecret: string,
  ): Promise<CheckoutSession> {
    const response = await fetch(
      this.config.apiUrl.replace(/\/$/, "") +
        "/v1/checkout-sessions/" +
        encodeURIComponent(checkoutId),
      {
        headers: {
          "X-ARO-Checkout-Secret": checkoutSecret,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(
        typeof error?.error === "string" ? error.error : "ARO_STATUS_FAILED",
      );
    }

    return (await response.json()) as CheckoutSession;
  }
}

// Example:
//
// const aro = new AroCheckoutClient({
//   apiUrl: process.env.NEXT_PUBLIC_ARO_API_URL!,
//   project: "levelab",
//   publicKey: process.env.NEXT_PUBLIC_ARO_PUBLIC_KEY!,
// });
//
// const checkout = await aro.createCheckout(
//   {
//     offer: "levelab-reset21-br",
//     market: "BR",
//     country: "BR",
//     currency: "BRL",
//     payment_method: "PIX",
//     payer: {
//       name: "Cliente",
//       email: "cliente@example.com",
//       document: "...",
//     },
//   },
//   crypto.randomUUID(),
// );
//
// if (checkout.payment?.kind === "PIX") {
//   renderCleanQr(checkout.payment.qr_payload);
//   showCopyPaste(checkout.payment.copy_paste);
// }
