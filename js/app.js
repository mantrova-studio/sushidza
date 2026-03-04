/* PROЖАРИМ — магазин (GitHub Pages front)
   Корзина: localStorage
   Доставка: Leaflet + Nominatim + GeoJSON зоны + point-in-polygon
   Отправка заказа: через API (Cloudflare Worker / Netlify Function)
*/

const ORDER_API_URL = "https://YOUR-WORKER-URL.example.workers.dev/order"; // <-- заменишь

const els = {
  products: document.getElementById("products"),
  tabs: document.getElementById("categoryTabs"),
  search: document.getElementById("search"),
  hits: document.getElementById("hits"),

  openCart: document.getElementById("openCart"),
  cartDrawer: document.getElementById("cartDrawer"),
  closeCart: document.getElementById("closeCart"),
  closeCart2: document.getElementById("closeCart2"),
  cartItems: document.getElementById("cartItems"),
  cartCount: document.getElementById("cartCount"),
  cartSubtotal: document.getElementById("cartSubtotal"),
  goCheckout: document.getElementById("goCheckout"),

  checkoutModal: document.getElementById("checkoutModal"),
  closeCheckout: document.getElementById("closeCheckout"),
  closeCheckout2: document.getElementById("closeCheckout2"),
  checkoutForm: document.getElementById("checkoutForm"),

  pickupBlock: document.getElementById("pickupBlock"),
  deliveryBlock: document.getElementById("deliveryBlock"),

  sumProducts: document.getElementById("sumProducts"),
  sumDelivery: document.getElementById("sumDelivery"),
  sumTotal: document.getElementById("sumTotal"),
  toast: document.getElementById("toast"),

  addrSearch: document.getElementById("addrSearch"),
  btnSearchAddr: document.getElementById("btnSearchAddr"),
  mapInfo: document.getElementById("mapInfo"),
};

const STORAGE_KEY = "prozh_cart_v1";

let MENU = [];
let ZONES = null;

let state = {
  category: "Все",
  query: "",
  cart: loadCart(),
  mode: "delivery",
  delivery: {
    lat: null,
    lng: null,
    address: "",
    zone: null,
    restaurant: null,
    price: null,
  }
};

function rub(n){ return `${Math.round(n)} ₽`; }

function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add("isOn");
  setTimeout(()=>els.toast.classList.remove("isOn"), 2600);
}

function loadCart(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  renderCartBadge();
}
function cartCount(){
  return Object.values(state.cart).reduce((a,b)=>a+b,0);
}
function cartSum(){
  let sum = 0;
  for (const [id, qty] of Object.entries(state.cart)){
    const p = MENU.find(x=>x.id===id);
    if (p) sum += p.price * qty;
  }
  return sum;
}

function openDrawer(){
  els.cartDrawer.classList.add("isOn");
  els.cartDrawer.setAttribute("aria-hidden","false");
  renderCart();
}
function closeDrawer(){
  els.cartDrawer.classList.remove("isOn");
  els.cartDrawer.setAttribute("aria-hidden","true");
}
function openCheckout(){
  if (cartCount() === 0){
    showToast("Корзина пуста");
    return;
  }
  els.checkoutModal.classList.add("isOn");
  els.checkoutModal.setAttribute("aria-hidden","false");
  renderTotals();
  ensureMap();
}
function closeCheckout(){
  els.checkoutModal.classList.remove("isOn");
  els.checkoutModal.setAttribute("aria-hidden","true");
}

function renderCartBadge(){
  els.cartCount.textContent = String(cartCount());
}

function addToCart(id){
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  showToast("Добавлено в корзину");
}
function decFromCart(id){
  if (!state.cart[id]) return;
  state.cart[id] -= 1;
  if (state.cart[id] <= 0) delete state.cart[id];
  saveCart();
  renderCart();
  renderTotals();
}
function incFromCart(id){
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  renderCart();
  renderTotals();
}

function renderCart(){
  els.cartItems.innerHTML = "";
  const ids = Object.keys(state.cart);
  if (ids.length === 0){
    els.cartItems.innerHTML = `<div class="muted">Корзина пуста. Выберите блюда в каталоге.</div>`;
  } else {
    for (const id of ids){
      const p = MENU.find(x=>x.id===id);
      if (!p) continue;
      const qty = state.cart[id];

      const row = document.createElement("div");
      row.className = "cartItem";
      row.innerHTML = `
        <img src="${p.img}" alt="">
        <div>
          <div class="cartItem__name">${escapeHtml(p.name)}</div>
          <div class="cartItem__meta">${rub(p.price)} • ${escapeHtml(p.weight || "")}</div>
        </div>
        <div class="qty">
          <button type="button" data-act="dec">−</button>
          <span>${qty}</span>
          <button type="button" data-act="inc">+</button>
        </div>
      `;
      row.querySelector('[data-act="dec"]').addEventListener("click", ()=>decFromCart(id));
      row.querySelector('[data-act="inc"]').addEventListener("click", ()=>incFromCart(id));

      els.cartItems.appendChild(row);
    }
  }
  els.cartSubtotal.textContent = rub(cartSum());
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function makeCard(p){
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <img class="card__img" src="${p.img}" alt="${escapeHtml(p.name)}">
    <div class="card__body">
      <div class="card__cat">${escapeHtml(p.category)}</div>
      <div class="card__name">${escapeHtml(p.name)}</div>
      <div class="card__desc">${escapeHtml(p.desc || "")}</div>
      <div class="card__row">
        <div>
          <div class="price">${rub(p.price)}</div>
          <div class="meta">${escapeHtml(p.weight || "")}</div>
        </div>
        <button class="btn btn--primary" type="button">В корзину</button>
      </div>
    </div>
  `;
  el.querySelector("button").addEventListener("click", ()=>addToCart(p.id));
  return el;
}

function renderTabs(){
  const cats = ["Все", ...Array.from(new Set(MENU.map(x=>x.category)))];
  els.tabs.innerHTML = "";
  for (const c of cats){
    const b = document.createElement("button");
    b.className = "tab" + (c === state.category ? " isOn" : "");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", ()=>{
      state.category = c;
      renderTabs();
      renderProducts();
    });
    els.tabs.appendChild(b);
  }
}

function renderProducts(){
  const q = state.query.trim().toLowerCase();
  let list = MENU.slice();

  if (state.category !== "Все"){
    list = list.filter(x=>x.category === state.category);
  }
  if (q){
    list = list.filter(x =>
      (x.name||"").toLowerCase().includes(q) ||
      (x.desc||"").toLowerCase().includes(q) ||
      (x.category||"").toLowerCase().includes(q)
    );
  }

  els.products.innerHTML = "";
  for (const p of list){
    els.products.appendChild(makeCard(p));
  }
}

function renderHits(){
  const hits = MENU.filter(x=>x.hit).slice(0,4);
  if (!hits.length){
    els.hits.innerHTML = `<div class="muted">Добавь пометку "hit": true в menu.json</div>`;
    return;
  }
  els.hits.innerHTML = "";
  for (const p of hits){
    const it = document.createElement("div");
    it.className = "cartItem";
    it.innerHTML = `
      <img src="${p.img}" alt="">
      <div>
        <div class="cartItem__name">${escapeHtml(p.name)}</div>
        <div class="cartItem__meta">${rub(p.price)} • ${escapeHtml(p.weight||"")}</div>
      </div>
      <div><button class="btn btn--primary" type="button">+</button></div>
    `;
    it.querySelector("button").addEventListener("click", ()=>addToCart(p.id));
    els.hits.appendChild(it);
  }
}

/* ===== Delivery: map + zones ===== */
let map = null;
let marker = null;
let zonesLayer = null;

function ensureMap(){
  if (map) return;
  const center = [51.7682, 55.0968]; // Оренбург пример (lat,lng)

  map = L.map("map", { zoomControl: true }).setView(center, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  map.on("click", (e)=> setDeliveryPoint(e.latlng.lat, e.latlng.lng, null));

  if (ZONES){
    zonesLayer = L.geoJSON(ZONES, {
      style: () => ({ weight: 1, fillOpacity: 0.06 })
    }).addTo(map);
  }
}

async function geocode(query){
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept":"application/json" }});
  if (!res.ok) throw new Error("Geocode failed");
  const arr = await res.json();
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), display: arr[0].display_name };
}

// point-in-polygon (ray casting), coords: [lng,lat]
function pointInPolygon(point, vs){
  const x = point[0], y = point[1];
  let inside = false;
  for (let i=0, j=vs.length-1; i<vs.length; j=i++){
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function findZone(lat, lng){
  if (!ZONES) return null;
  const pt = [lng, lat];
  for (const f of ZONES.features || []){
    if (!f.geometry) continue;
    if (f.geometry.type === "Polygon"){
      const ring = f.geometry.coordinates?.[0];
      if (ring && pointInPolygon(pt, ring)) return f;
    } else if (f.geometry.type === "MultiPolygon"){
      const polys = f.geometry.coordinates || [];
      for (const poly of polys){
        const ring = poly?.[0];
        if (ring && pointInPolygon(pt, ring)) return f;
      }
    }
  }
  return null;
}

function setDeliveryPoint(lat, lng, addressStr){
  state.delivery.lat = lat;
  state.delivery.lng = lng;

  if (!marker){
    marker = L.marker([lat,lng]).addTo(map);
  } else {
    marker.setLatLng([lat,lng]);
  }

  const zone = findZone(lat,lng);
  if (!zone){
    state.delivery.zone = null;
    state.delivery.restaurant = null;
    state.delivery.price = null;
    els.mapInfo.textContent = "Вне зоны доставки (или не загружены полигоны).";
  } else {
    state.delivery.zone = zone.properties?.zone ?? "—";
    state.delivery.restaurant = zone.properties?.restaurant ?? "—";
    state.delivery.price = Number(zone.properties?.deliveryPrice ?? 0);

    els.mapInfo.textContent =
      `Зона: ${state.delivery.zone} • Ресторан: ${state.delivery.restaurant} • Доставка: ${rub(state.delivery.price)}`;
  }

  if (addressStr){
    state.delivery.address = addressStr;
    els.checkoutForm.elements.address.value = addressStr;
  } else {
    // если вручную кликнули — поле адреса оставим как есть
  }

  renderTotals();
}

function renderTotals(){
  const s = cartSum();
  els.sumProducts.textContent = rub(s);

  let d = null;
  if (state.mode === "delivery"){
    d = state.delivery.price;
    els.sumDelivery.textContent = (typeof d === "number") ? rub(d) : "Укажите адрес";
    els.sumTotal.textContent = (typeof d === "number") ? rub(s + d) : rub(s);
  } else {
    els.sumDelivery.textContent = "0 ₽";
    els.sumTotal.textContent = rub(s);
  }
}

/* ===== Checkout mode switch ===== */
function setMode(mode){
  state.mode = mode;
  els.checkoutForm.elements.mode.value = mode;

  const btns = els.checkoutForm.querySelectorAll(".seg__btn");
  btns.forEach(b => b.classList.toggle("isOn", b.dataset.mode === mode));

  if (mode === "pickup"){
    els.pickupBlock.hidden = false;
    els.deliveryBlock.hidden = true;
  } else {
    els.pickupBlock.hidden = true;
    els.deliveryBlock.hidden = false;
    ensureMap();
  }
  renderTotals();
}

/* ===== Submit order ===== */
function buildOrderPayload(form){
  const items = Object.entries(state.cart).map(([id, qty])=>{
    const p = MENU.find(x=>x.id===id);
    return {
      id,
      name: p?.name || id,
      price: p?.price || 0,
      qty,
      sum: (p?.price || 0) * qty,
      weight: p?.weight || ""
    };
  });

  const subtotal = items.reduce((a,b)=>a+b.sum,0);

  let delivery = {
    type: "pickup",
    price: 0,
    address: form.pickupAddress?.value || "",
    zone: null,
    restaurant: form.pickupAddress?.value || ""
  };

  if (state.mode === "delivery"){
    delivery = {
      type: "delivery",
      price: (typeof state.delivery.price === "number") ? state.delivery.price : null,
      address: form.address?.value?.trim() || state.delivery.address || "",
      lat: state.delivery.lat,
      lng: state.delivery.lng,
      zone: state.delivery.zone,
      restaurant: state.delivery.restaurant
    };
  }

  const total = subtotal + (delivery.price || 0);

  return {
    createdAt: new Date().toISOString(),
    customer: {
      name: form.name.value.trim(),
      phone: form.phone.value.trim()
    },
    payment: form.payment.value,
    comment: form.comment.value.trim(),
    items,
    subtotal,
    delivery,
    total,
    meta: {
      userAgent: navigator.userAgent
    }
  };
}

async function sendOrder(payload){
  const res = await fetch(ORDER_API_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data?.error || "Ошибка отправки");
  return data;
}

/* ===== Init ===== */
async function init(){
  // UI events
  els.openCart.addEventListener("click", openDrawer);
  els.closeCart.addEventListener("click", closeDrawer);
  els.closeCart2.addEventListener("click", closeDrawer);
  els.goCheckout.addEventListener("click", ()=>{ closeDrawer(); openCheckout(); });

  els.closeCheckout.addEventListener("click", closeCheckout);
  els.closeCheckout2.addEventListener("click", closeCheckout);

  els.search.addEventListener("input", (e)=>{
    state.query = e.target.value || "";
    renderProducts();
  });

  // mode buttons
  const segBtns = els.checkoutForm.querySelectorAll(".seg__btn");
  segBtns.forEach(b => b.addEventListener("click", ()=> setMode(b.dataset.mode)));

  // address search
  els.btnSearchAddr.addEventListener("click", async ()=>{
    try{
      const q = els.addrSearch.value.trim();
      if (!q) return;
      const r = await geocode(q);
      if (!r) return showToast("Адрес не найден");
      map.setView([r.lat, r.lng], 15);
      setDeliveryPoint(r.lat, r.lng, r.display);
    }catch(e){
      showToast("Ошибка поиска адреса");
    }
  });

  // checkout submit
  els.checkoutForm.addEventListener("submit", async (e)=>{
    e.preventDefault();

    if (cartCount() === 0) return showToast("Корзина пуста");

    if (state.mode === "delivery"){
      const addr = els.checkoutForm.elements.address.value.trim();
      if (!addr) return showToast("Укажите адрес доставки");
      if (typeof state.delivery.price !== "number") return showToast("Точка вне зоны или зоны не настроены");
    }

    const payload = buildOrderPayload(els.checkoutForm.elements);

    const btn = document.getElementById("submitOrder");
    btn.disabled = true;
    btn.textContent = "Отправляем…";

    try{
      await sendOrder(payload);
      showToast("Заказ отправлен ✅");

      // clear cart
      state.cart = {};
      saveCart();
      renderCart();
      renderTotals();

      setTimeout(()=> closeCheckout(), 700);
    }catch(err){
      showToast(String(err.message || err));
    }finally{
      btn.disabled = false;
      btn.textContent = "Отправить заказ";
    }
  });

  // Load data
  MENU = await fetch("data/menu.json").then(r=>r.json());
  ZONES = await fetch("data/zones.geojson").then(r=>r.json()).catch(()=>null);

  renderTabs();
  renderProducts();
  renderHits();
  renderCartBadge();
  renderTotals();

  // default mode
  setMode("delivery");
}

document.addEventListener("DOMContentLoaded", init);