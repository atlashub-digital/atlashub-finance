import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import type { AroContext } from "../context.js";
import { errors } from "../lib/errors.js";
import { CheckoutService } from "../modules/checkout/service.js";
import { findProjectBySlug } from "../modules/projects/repo.js";
import { requireServerKey, verifyCheckoutSecret } from "../security/auth.js";
import { createHostedToken, readHostedToken } from "./token.js";
import { embedCheckoutJs, hostedCheckoutHtml, hostedCheckoutJs } from "./ui.js";

const NewLink = z.object({
  offer: z.string().min(1).max(128),
  reference: z.string().max(128).regex(/^[a-zA-Z0-9_.:-]*$/).default(""),
  expires_in_days: z.number().int().min(1).max(30).default(30),
}).strict();
const Payer = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().max(160),
  phone: z.string().trim().max(32).default(""),
  document: z.string().trim().min(11).max(32),
  accept_terms: z.literal(true),
  marketing: z.boolean().default(false),
}).strict();

type Offer = {
  title: string; slug: string; market: string; currency: string; amountMinor: number;
  cadence: string; paymentMethods: string[];
};
const TOKEN = /^hl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SESSION_ID = /^[0-9a-f-]{36}$/i;
function noStore(reply: FastifyReply) {
  reply.header("cache-control", "no-store").header("referrer-policy", "strict-origin-when-cross-origin");
}
async function lookup(ctx: AroContext, projectId: string, slug: string) {
  const [row] = await ctx.sql.unsafe<Offer[]>(
    "SELECT o.title, o.slug, o.cadence, o.\"paymentMethods\", p.market, p.currency, p.\"amountMinor\" " +
    "FROM aro_offer o JOIN catalog_price p ON p.id = o.\"priceId\" " +
    "WHERE o.\"projectId\" = $1 AND o.slug = $2 AND o.status = 'active' AND p.status = 'active'",
    [projectId, slug]);
  return row;
}
function pixReady(o: Offer) {
  return o.cadence === "once" && o.market === "BR" && o.currency === "BRL" &&
    (!o.paymentMethods.length || o.paymentMethods.includes("PIX"));
}
async function resolve(ctx: AroContext, token: string) {
  if (token.length > 2048 || !TOKEN.test(token)) return null;
  const link = readHostedToken(token, ctx.keys.checkoutSecret);
  if (!link) return null;
  const project = await findProjectBySlug(ctx.sql, link.project);
  if (!project || project.projectId !== link.projectId) return null;
  const offer = await lookup(ctx, project.projectId, link.offer);
  if (!offer || !pixReady(offer)) return null;
  return {link, project, offer};
}
async function qrView<T extends {payment?: {kind:string;qr_payload?:string}}>(view:T) {
  if (view.payment?.kind !== "PIX" || !view.payment.qr_payload) return view;
  const qr_svg = await QRCode.toString(view.payment.qr_payload, {type:"svg", margin:2, errorCorrectionLevel:"M", width:270});
  return {...view, qr_svg};
}
export async function hostedCheckoutRoutes(app: FastifyInstance, opts: {ctx:AroContext}) {
  const ctx = opts.ctx;
  const engine = new CheckoutService(ctx);
  const base = new URL(ctx.env.ARO_PUBLIC_BASE_URL);
  const localOrigin = base.origin;

  // Backend de projeto autenticado: links reutilizáveis, vinculados a oferta ACTIVE.
  app.post("/v1/checkout-links", async (req, reply) => {
    noStore(reply);
    const project = await requireServerKey(ctx, req);
    const parsed = NewLink.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({error:"INVALID_REQUEST"});
    const offer = await lookup(ctx, project.projectId, parsed.data.offer);
    if (!offer || !pixReady(offer)) return reply.status(422).send({error:"INVALID_OFFER"});
    const expiresAt = Date.now() + parsed.data.expires_in_days * 86400_000;
    const token = createHostedToken({
      project:project.slug, projectId:project.projectId, offer:offer.slug,
      reference:parsed.data.reference, exp:expiresAt,
    },ctx.keys.checkoutSecret);
    return reply.status(201).send({
      project:project.slug, offer:offer.slug, reference:parsed.data.reference,
      amount:{amount_minor:offer.amountMinor,currency:offer.currency},
      url:new URL("/pay/"+token,base).toString(),
      expires_at:new Date(expiresAt).toISOString(),
    });
  });

  app.get<{Params:{token:string}}>("/pay/:token", async(req,reply)=>{
    noStore(reply);
    const found = await resolve(ctx,req.params.token);
    if(!found) return reply.status(404).send({error:"NOT_FOUND"});
    const origins = found.project.allowedOrigins.filter(x=>{
      try {const u = new URL(x); return u.protocol === "https:" && u.origin === x;}catch{return false;}
    });
    reply.header("content-type","text/html; charset=utf-8")
      .header("content-security-policy",
        "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; script-src 'self'; " +
        "style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self' " + origins.join(" "))
      .header("x-content-type-options","nosniff");
    return reply.send(hostedCheckoutHtml({
      token:req.params.token,project:found.project.slug,title:found.offer.title,
      amountMinor:found.offer.amountMinor,currency:found.offer.currency,origins,
    }));
  });
  app.get("/assets/aro-pay.js",async(_req,reply)=>reply
    .header("content-type","application/javascript; charset=utf-8")
    .header("cache-control","public, max-age=3600")
    .header("x-content-type-options","nosniff").send(hostedCheckoutJs));
  app.get("/assets/aro-checkout.js",async(_req,reply)=>reply
    .header("content-type","application/javascript; charset=utf-8")
    .header("cache-control","public, max-age=3600")
    .header("x-content-type-options","nosniff").send(embedCheckoutJs));

  function originGuard(req:FastifyRequest) {
    if (req.headers.origin && req.headers.origin !== localOrigin) throw errors.forbidden("Invalid Origin");
    if (req.headers["sec-fetch-site"] === "cross-site") throw errors.forbidden("Cross-site blocked");
  }
  app.post<{Params:{token:string}}>("/pay/:token/checkout",{
    config:{rateLimit:{max:8,timeWindow:"1 minute",keyGenerator:(req:FastifyRequest)=>req.ip}},
  },async(req,reply)=>{
    noStore(reply);originGuard(req);
    const found=await resolve(ctx,req.params.token);
    if(!found) return reply.status(404).send({error:"NOT_FOUND"});
    const parsed=Payer.safeParse(req.body);
    if(!parsed.success) return reply.status(400).send({error:"INVALID_PAYER"});
    const idem=req.headers["idempotency-key"];
    if(typeof idem!=="string"||!/^[a-zA-Z0-9_-]{16,128}$/.test(idem))
      return reply.status(400).send({error:"INVALID_REQUEST"});
    const payer=parsed.data;
    const created=await engine.create(found.project,{
      project:found.project.slug,offer:found.offer.slug,market:found.offer.market,
      country:"BR",currency:found.offer.currency,payment_method:"PIX",
      payer:{name:payer.name,email:payer.email,phone:payer.phone,document:payer.document},
      bump_offers:[],attribution:{utm_source:"aro_hosted"},
      metadata:{source:"aro_checkout_link",...(found.link.reference?{reference:found.link.reference}:{}),
        marketing_opt_in:String(payer.marketing)},
    },"hosted:"+idem);
    return reply.status(201).send(await qrView(created.view));
  });

  app.get<{Params:{token:string;id:string}}>("/pay/:token/checkout/:id",async(req,reply)=>{
    noStore(reply);originGuard(req);
    const found=await resolve(ctx,req.params.token);
    if(!found||!SESSION_ID.test(req.params.id))return reply.status(404).send({error:"NOT_FOUND"});
    const secret=req.headers["x-aro-checkout-secret"];
    if(typeof secret!=="string"||!verifyCheckoutSecret(ctx.keys.checkoutSecret,req.params.id,secret))
      throw errors.unauthorized();
    const session=await engine.loadSession(req.params.id);
    if(session.projectId!==found.project.projectId||session.offerSlug!==found.offer.slug)
      return reply.status(404).send({error:"NOT_FOUND"});
    return reply.send(await qrView(await engine.view(session)));
  });
}
