# Product & Offer Catalog

## Catalog first

Products and offers are registered **before** checkout. A checkout request names an offer code; ARO resolves product, price, currency, market, payment methods and entitlements from its catalog. A request can never create a product or set a price.

## Where the catalog lives (V1)

```
atlashub-finance/infra/projects/<project>/aro.project.yaml   # catalog (products, offers, fulfillment)
atlashub-finance/infra/projects/<project>/aro.config.json    # ARO-side settings (tenant, origins, webhook)
```

The manifest format is defined by [`schemas/project-commerce-manifest.schema.json`](https://github.com/atlashub-digital/atlashub-finance/blob/main/schemas/project-commerce-manifest.schema.json). A generic example: [`examples/manifests/training-platform.yaml`](https://github.com/atlashub-digital/atlashub-finance/blob/main/examples/manifests/training-platform.yaml).

Changes go through a reviewed pull request in the ARO repository; ARO operations then apply them.

## Manifest outline

```yaml
version: "1"
project: { slug: espelhomeu, name: EspelhoMeu, default_market: BR, default_currency: BRL }
products:
  - { code: p01, name: EspelhoMeu P01, type: ebook }
offers:
  - code: p01-br
    name: EspelhoMeu P01
    products: [p01]
    market: BR
    currency: BRL
    amount_minor: 1190
    cadence: once
    payment_methods: [PIX]
    entitlements: ["espelhomeu:p01"]
    status: active
fulfillment:
  - { entitlement: "espelhomeu:p01", type: web_access }
```

## Validation rules

Beyond the JSON Schema, ARO rejects a manifest when:

- an offer references an unknown product;
- an entitlement key does not start with `<project-slug>:` (a project can never grant another project's rights);
- a currency is not supported by the AtlasHub catalog (V1: `BRL`, `EUR`, `USD`);
- a fulfillment entry names an entitlement that no offer grants.

## V1 limits

- `cadence` must be `once` for checkout. Offers with `month`/`year` can be registered but checkout returns `INVALID_OFFER` — there is no recurring billing in V1.
- `payment_methods` is enforced at checkout (`INVALID_OFFER` if the method is not allowed).
- Entitlements have no expiry in V1.

## Operations (ARO only)

```bash
node dist/admin-cli.js validate infra/projects/<p>/aro.project.yaml           # no database needed
node dist/admin-cli.js sync-project infra/projects/<p>/aro.config.json \
                                    infra/projects/<p>/aro.project.yaml
```

Sync is idempotent. Every effective change is stored verbatim as a catalog revision (versioning + audit). A changed price creates a new price row and retires the old one; offers removed from the manifest are retired, never deleted, because past orders reference them.

## Entitlement naming

Recommended: `<project>:<type>:<resource>` (`levelab:course:reset21`, `rsp:ebook:volume-01`). Short keys are fine when already in use (`espelhomeu:p01`). Do not rename keys that customers already hold.
