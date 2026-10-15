export type AroEntitlement = {
  key: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  source_order_id?: string;
  starts_at: string;
  expires_at?: string;
};

export async function resolveAroEntitlements(input: {
  apiUrl: string;
  serverKey: string;
  project: string;
  customerId?: string;
  email?: string;
}): Promise<AroEntitlement[]> {
  const body =
    input.customerId
      ? { project: input.project, customer_id: input.customerId }
      : {
          project: input.project,
          identity: { email: input.email },
        };

  const response = await fetch(
    input.apiUrl.replace(/\/$/, "") + "/v1/entitlements/resolve",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + input.serverKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("ARO_ENTITLEMENT_RESOLVE_FAILED");

  const payload = (await response.json()) as {
    entitlements: AroEntitlement[];
  };

  return payload.entitlements;
}

export function hasActiveEntitlement(
  entitlements: AroEntitlement[],
  key: string,
) {
  return entitlements.some(
    (entitlement) =>
      entitlement.key === key && entitlement.status === "ACTIVE",
  );
}
