import { createHmac } from "node:crypto";

/**
 * In-memory HTTP simulators of the provider APIs, injected as `fetch` into the
 * real adapters. Shapes follow the provider docs referenced in docs/providers.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Mode = "ok" | "reject" | "timeout_created" | "timeout_not_created" | "down";

export class PixGoSim {
  payments = new Map<string, { payment_id: string; external_id: string; amount: number; status: string; qr_code: string; expires_at: string }>();
  createMode: Mode = "ok";
  lookupDown = false;
  calls: string[] = [];
  private n = 0;

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    this.calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/payment/create") {
      if (this.createMode === "down") throw new TypeError("fetch failed");
      if (this.createMode === "reject") return json(400, { success: false, error: "LIMIT_EXCEEDED", message: "limit" });
      const body = JSON.parse(String(init?.body));
      const id = `dep_${++this.n}`;
      const p = {
        payment_id: id,
        external_id: body.external_id,
        amount: body.amount,
        status: "pending",
        qr_code: `00020126PIXGO${id}`,
        expires_at: "2099-01-01 12:20:00",
      };
      if (this.createMode !== "timeout_not_created") this.payments.set(id, p);
      if (this.createMode.startsWith("timeout")) {
        this.createMode = "ok";
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return json(201, { success: true, data: p });
    }
    if (this.lookupDown) return json(503, {});
    if (path === "/payments") {
      const ext = url.searchParams.get("external_id");
      return json(200, { success: true, data: [...this.payments.values()].filter((p) => p.external_id === ext) });
    }
    const m = /^\/payment\/([^/]+)$/.exec(path);
    if (m) {
      const p = this.payments.get(m[1]!);
      if (!p) return json(404, { success: false });
      return json(["expired", "refunded", "cancelled"].includes(p.status) ? 410 : 200, { success: true, data: p });
    }
    return json(404, {});
  };

  /** Signed webhook as PixGo sends it. */
  webhook(secret: string, paymentId: string, event: "payment.completed" | "payment.expired" | "payment.refunded", opts: { amount?: number; ts?: number } = {}) {
    const p = this.payments.get(paymentId)!;
    const status = { "payment.completed": "completed", "payment.expired": "expired", "payment.refunded": "refunded" }[event];
    p.status = status;
    const amount = opts.amount ?? p.amount;
    const body = JSON.stringify({
      event,
      timestamp: "2026-10-15T12:15:30-03:00",
      data: {
        payment_id: p.payment_id,
        external_id: p.external_id,
        status,
        customer: { name: "Cliente", cpf: "52998224725" },
        amount,
        amounts: { gross: amount, fee_total: 0.5, net: Number((amount - 0.5).toFixed(2)), currency: "BRL" },
      },
    });
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    return {
      body,
      headers: { "content-type": "application/json", "x-webhook-event": event, "x-webhook-timestamp": ts, "x-webhook-signature": sig },
    };
  }
}

export class MisticPaySim {
  tx = new Map<string, { providerId: string; clientId: string; value: number; state: string }>();
  createMode: Mode = "ok";
  private n = 1000;

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.endsWith("/transactions/create")) {
      if (this.createMode === "reject") return json(400, { message: "erro" });
      const providerId = String(++this.n);
      this.tx.set(body.transactionId, { providerId, clientId: body.transactionId, value: body.amount, state: "PENDENTE" });
      return json(201, {
        message: "ok",
        data: {
          transactionId: providerId,
          transactionAmount: Math.round(body.amount * 100),
          transactionFee: 23,
          transactionState: "PENDENTE",
          copyPaste: `00020101MISTIC${providerId}`,
        },
      });
    }
    if (url.pathname.endsWith("/transactions/check")) {
      const t = this.tx.get(String(body.transactionId));
      if (!t) return json(404, { message: "not found" });
      return json(200, { message: "ok", transaction: { transactionId: t.clientId, value: t.value, fee: 0.23, transactionState: t.state } });
    }
    return json(404, {});
  };

  byClientId(id: string) {
    return this.tx.get(id)!;
  }

  /** Unsigned deposit webhook (values as documented: unreliable units). */
  webhook(clientId: string, status: string) {
    const t = this.tx.get(clientId)!;
    return {
      body: JSON.stringify({ transactionId: Number(t.providerId), transactionType: "DEPOSITO", transactionMethod: "PIX", status, value: 455, fee: 23 }),
      headers: { "content-type": "application/json" },
    };
  }
}

export class StripeSim {
  intents = new Map<string, { id: string; amount: number; currency: string; status: string; client_secret: string; metadata: Record<string, string> }>();
  private n = 0;
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/payment_intents" && init?.method === "POST") {
      const f = new URLSearchParams(String(init.body));
      const id = `pi_${++this.n}`;
      const pi = {
        id,
        amount: Number(f.get("amount")),
        currency: f.get("currency")!,
        status: "requires_payment_method",
        client_secret: `${id}_secret_x`,
        metadata: { aro_attempt_id: f.get("metadata[aro_attempt_id]")! },
      };
      this.intents.set(id, pi);
      return json(200, { object: "payment_intent", ...pi });
    }
    const m = /^\/v1\/payment_intents\/(pi_\d+)$/.exec(url.pathname);
    if (m) {
      const pi = this.intents.get(m[1]!);
      return pi ? json(200, pi) : json(404, {});
    }
    return json(404, {});
  };

  webhook(secret: string, id: string, type: string) {
    const pi = this.intents.get(id)!;
    if (type === "payment_intent.succeeded") pi.status = "succeeded";
    const body = JSON.stringify({ id: `evt_${id}_${type}`, type, data: { object: { ...pi, object: "payment_intent" } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    return { body, headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` } };
  }
}

/** Captures ARO → project webhook deliveries. */
export class ProjectReceiver {
  received: { url: string; headers: Record<string, string>; body: string }[] = [];
  status = 200;
  fetch: typeof fetch = async (input, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    this.received.push({ url: String(input), headers, body: String(init?.body) });
    return new Response(null, { status: this.status });
  };
  events() {
    return this.received.filter((r) => r.headers["x-aro-event-id"]).map((r) => JSON.parse(r.body) as { id: string; type: string; data: Record<string, unknown> });
  }
}
