
/** Single, ARO-hosted interface shared by standalone payment links and cross-site iframe overlays. */
export const hostedCheckoutJs = String.raw`
(function () {
  "use strict";
  var root = document.getElementById("aro-checkout");
  if (!root) return;
  var token = root.dataset.token;
  var offer = JSON.parse(root.dataset.offer || "{}");
  var allowedParents = JSON.parse(root.dataset.parents || "[]");
  var prefix = "/pay/" + encodeURIComponent(token);
  var form = document.getElementById("aro-form");
  var panel = document.getElementById("aro-payment");
  var action = document.getElementById("aro-submit");
  var status = document.getElementById("aro-status");
  var qr = document.getElementById("aro-qr");
  var pix = document.getElementById("aro-pix-code");
  var copy = document.getElementById("aro-copy");
  var price = document.getElementById("aro-price");
  var note = document.getElementById("aro-payment-note");
  var key = "aro-hosted:" + token;
  var timer = null;
  var pending = null;
  function show(text) { status.textContent = text; }
  function money(minor, currency) {
    return new Intl.NumberFormat("pt-BR", {style:"currency", currency:currency || "BRL"}).format(minor / 100);
  }
  function signal(state) {
    if (window.parent === window) return;
    try {
      var origin = new URL(document.referrer).origin;
      if (allowedParents.indexOf(origin) !== -1) {
        window.parent.postMessage({type:"ARO_CHECKOUT_STATUS", state:state, project:offer.project}, origin);
      }
    } catch (_e) {}
  }
  function restore() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved && typeof saved.id === "string" && typeof saved.secret === "string") return saved;
    } catch (_e) {}
    return null;
  }
  function stop() { if (timer) {clearTimeout(timer); timer = null;} }
  async function poll() {
    stop();
    if (!pending) return;
    try {
      var response = await fetch(prefix + "/checkout/" + encodeURIComponent(pending.id), {
        headers: {"x-aro-checkout-secret":pending.secret}, cache:"no-store", credentials:"omit"
      });
      if (!response.ok) throw Error("status_unavailable");
      var view = await response.json();
      draw(view);
      if (view.state === "PENDING" || view.state === "CREATED") timer = setTimeout(poll, 4000);
    } catch (_e) { show("Verificando o pagamento…"); timer = setTimeout(poll, 8000); }
  }
  function draw(view) {
    form.hidden = true;
    panel.hidden = false;
    var amount = view.amount || {};
    price.textContent = money(amount.amount_minor || 0, amount.currency || offer.currency);
    if (view.state === "APPROVED") {
      qr.hidden = true; pix.hidden = true; copy.hidden = true;
      note.textContent = "Pagamento aprovado. A confirmação do acesso ou inscrição será concluída pelo projeto.";
      show("Pagamento confirmado com segurança.");
      sessionStorage.removeItem(key);
      stop();
      signal("APPROVED");
      return;
    }
    if (["FAILED", "EXPIRED", "CANCELED", "REFUNDED", "CHARGEBACK"].indexOf(view.state) !== -1) {
      qr.hidden = true; pix.hidden = true; copy.hidden = true;
      note.textContent = "Esta tentativa terminou. Para continuar, inicie uma nova compra.";
      show("Pagamento não concluído.");
      sessionStorage.removeItem(key);
      stop(); signal(view.state); return;
    }
    if (view.payment && view.payment.kind === "PIX") {
      qr.hidden = false; pix.hidden = false; copy.hidden = false;
      if (view.qr_svg) qr.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(view.qr_svg);
      pix.value = view.payment.copy_paste || "";
      note.textContent = "Aguardando pagamento. Use o código Copia e Cola na aplicação do banco.";
    } else { note.textContent = "Preparando as instruções de pagamento…"; }
    show("Pagamento pendente");
  }
  copy.addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(pix.value); copy.textContent = "Copiado!"; }
    catch (_e) { pix.focus(); pix.select(); show("Selecione e copie o código acima."); }
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    action.disabled = true;
    show("Gerando pagamento seguro…");
    var fields = new FormData(form);
    var idem = crypto.randomUUID();
    try {
      var response = await fetch(prefix + "/checkout", {
        method:"POST", headers: {"Content-Type":"application/json", "Idempotency-Key":idem},
        credentials:"omit", body:JSON.stringify({
          name:fields.get("name"),email:fields.get("email"),phone:fields.get("phone"),
          document:fields.get("document"),accept_terms:fields.get("terms")==="on",
          marketing:fields.get("marketing")==="on"
        })
      });
      var view = await response.json();
      if (!response.ok || !view.checkout_secret || !view.id) throw Error(view.error || "unavailable");
      pending = {id:view.id,secret:view.checkout_secret};
      sessionStorage.setItem(key,JSON.stringify(pending));
      draw(view);
      if(view.state === "PENDING" || view.state === "CREATED") timer = setTimeout(poll,4000);
    } catch (_e) { show("Não foi possível emitir o Pix. Tente novamente."); }
    finally { action.disabled = false; }
  });
  var stored = restore();
  if (stored) { pending = stored; show("Recuperando pagamento anterior…"); poll(); }
})();
`;

export const embedCheckoutJs = String.raw`
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var host = new URL(script.src).origin;
  function open(config) {
    if (!config || typeof config.url !== "string") throw new Error("ARO: checkout URL required");
    var dest = new URL(config.url);
    if (dest.origin !== host || !/^\\/pay\\/hl1\\./.test(dest.pathname)) throw new Error("ARO: invalid checkout link");
    var before = document.activeElement;
    var priorOverflow = document.body.style.overflow;
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,8,22,.80);display:flex;align-items:center;justify-content:center;padding:14px";
    var frame = document.createElement("iframe");
    frame.src = dest.href;
    frame.title = "Pagamento em ambiente seguro · ARO Systems";
    frame.setAttribute("allow","payment");
    frame.style.cssText = "width:min(440px,100%);height:min(780px,calc(100dvh - 28px));border:0;border-radius:18px;background:#06172a";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label","Fechar checkout");
    close.textContent = "×";
    close.style.cssText = "position:absolute;top:20px;right:25px;color:white;background:#142f44;border:1px solid #55758b;border-radius:50%;width:42px;height:42px;font-size:27px;cursor:pointer";
    function done() {
      window.removeEventListener("message",received);
      window.removeEventListener("keydown",keyPressed);
      overlay.remove();
      document.body.style.overflow = priorOverflow;
      if (before && typeof before.focus === "function") before.focus();
    }
    function keyPressed(e) { if(e.key === "Escape") done(); }
    function received(e) {
      if(e.origin !== host || e.source !== frame.contentWindow || !e.data || e.data.type !== "ARO_CHECKOUT_STATUS") return;
      if(typeof config.onStatus === "function") config.onStatus(e.data.state); // signal only, not proof of payment!
      if(e.data.state === "APPROVED") { if(typeof config.onApproved === "function") config.onApproved(); /* site must verify server-side */ }
    }
    close.addEventListener("click",done);
    overlay.addEventListener("click",function (e){if(e.target === overlay) done();});
    overlay.appendChild(frame);overlay.appendChild(close);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    close.focus();
    window.addEventListener("keydown",keyPressed);
    window.addEventListener("message",received);
    return {close:done};
  }
  window.AROCheckout = Object.freeze({open:open});
})();
`;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]!));
export function hostedCheckoutHtml(model: {
  token: string; project: string; title: string; amountMinor: number;
  currency: string; origins: string[];
}) {
  const data = {project:model.project,currency:model.currency};
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Pagamento · ARO Systems</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:linear-gradient(155deg,#07182c,#020e1c);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#f4fbff}main{max-width:460px;margin:auto;padding:28px 22px 35px}
small{color:#80dcec;letter-spacing:.16em;font-size:11px;font-weight:700}h1{font-size:24px;line-height:1.15;letter-spacing:-.03em;margin:12px 0}p{color:#aecad9}h2{font-size:34px;letter-spacing:-.04em;margin:6px 0 16px}
label{display:block;font-size:12px;color:#d5e8f3;font-weight:600;margin:12px 0 6px}input:not([type=checkbox]){width:100%;padding:13px;border:1px solid #37657a;background:#071f34;color:white;border-radius:9px;font:inherit;font-size:15px}input:focus,button:focus-visible{outline:2px solid #53e9f7;outline-offset:2px}
button{cursor:pointer;border:0;border-radius:10px;font:700 16px system-ui;padding:14px;width:100%;background:linear-gradient(115deg,#55e6ef,#249deb);color:#052039;margin-top:16px}
button:disabled{opacity:.6}.check{display:flex;gap:8px;align-items:flex-start;margin-top:12px}.check label{margin:0;font-weight:400;line-height:1.5}
#aro-qr{display:block;max-width:190px;max-height:190px;padding:12px;background:white;border-radius:11px;margin:14px auto}#aro-payment{margin-top:20px}#aro-pix-code{font-size:12px;word-break:break-all}#aro-status{font-size:13px;min-height:18px;color:#91e9f8}
footer{text-align:center;margin-top:26px;border-top:1px solid #244257;padding-top:16px;color:#adc8d8;font-size:11px}.brand{color:#76efdc;font-size:18px;letter-spacing:.025em;font-weight:800}
[hidden]{display:none!important}@media(max-width:480px){main{padding:22px 18px 28px}}
</style></head><body><main id="aro-checkout" data-token="${escapeHtml(model.token)}" data-offer="${escapeHtml(JSON.stringify(data))}" data-parents="${escapeHtml(JSON.stringify(model.origins))}">
<small>ARO SYSTEMS · CHECKOUT PROTEGIDO</small><h1>${escapeHtml(model.title)}</h1><div class="brand">Pix · Brasil</div><h2 id="aro-price">${(model.amountMinor / 100).toLocaleString("pt-BR",{style:"currency",currency:model.currency})}</h2>
<form id="aro-form"><label for="name">Nome completo</label><input id="name" name="name" required minlength="2" maxlength="160" autocomplete="name">
<label for="email">E-mail</label><input id="email" name="email" type="email" required maxlength="160" autocomplete="email">
<label for="phone">WhatsApp com DDD</label><input id="phone" name="phone" type="tel" maxlength="32" autocomplete="tel">
<label for="doc">CPF ou CNPJ</label><input id="doc" name="document" inputmode="numeric" required maxlength="32" autocomplete="off">
<div class="check"><input id="terms" name="terms" type="checkbox" required><label for="terms">Aceito as condições comerciais informadas pelo vendedor e o tratamento de dados necessário para o pagamento.</label></div>
<div class="check"><input id="marketing" name="marketing" type="checkbox"><label for="marketing">Aceito receber comunicações comerciais (opcional).</label></div>
<button type="submit" id="aro-submit">Pagar com Pix →</button></form>
<section id="aro-payment" hidden><img id="aro-qr" alt="QR Code Pix" hidden><label for="aro-pix-code">Pix Copia e Cola</label><input id="aro-pix-code" readonly hidden><button id="aro-copy" type="button" hidden>Copiar código Pix</button><p id="aro-payment-note"></p></section>
<p id="aro-status" role="status" aria-live="polite"></p><footer>🔒 Pagamento em ambiente seguro · ARO Systems</footer>
</main><script src="/assets/aro-pay.js" defer></script></body></html>`;
}
