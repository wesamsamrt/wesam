let checkoutWarehouse = "";
let customerLat = null;
let customerLng = null;
let customerMap = null;
let customerMarker = null;
let mapSearchDelay = null;

// يقرأ بيانات العنوان الإضافية المحفوظة محليًا دون إيقاف الصفحة عند تلف البيانات القديمة.
function getSavedDeliveryDetails() {
    try { return JSON.parse(localStorage.getItem("customer_delivery_details") || "{}"); }
    catch { return {}; }
}

// يحمي أسماء المواقع القادمة من خدمة البحث قبل عرضها داخل نافذة الخريطة.
function escapeMapHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

// يعرض رسالة واضحة أسفل نموذج العميل مع لون يناسب حالة العملية.
function setCheckoutMessage(text = "", isError = true) {
    const message = document.getElementById("formMessage");
    message.textContent = text;
    message.style.color = isError ? "#ffabb6" : "#7ce5a9";
}

// يجلب السلة الحالية ويعيد تعبئة بيانات العميل المحفوظة عند فتح صفحة البيانات.
async function loadCustomerCheckout() {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) { window.location.href = "login.html"; return; }
    checkoutWarehouse = localStorage.getItem("customer_warehouse") || "";
    if (!checkoutWarehouse) { window.location.href = "products.html?changeRegion=1"; return; }
    const { data: orders, error } = await supabaseClient.from("orders").select("*").eq("user_id", user.id).eq("status", "جديد").eq("warehouse", checkoutWarehouse).order("id", { ascending: false }).limit(1);
    if (error || !orders?.length) { setCheckoutMessage("السلة فارغة، أضف منتجًا أولًا ثم أتمم البيانات."); document.getElementById("submitButton").disabled = true; return; }
    const order = orders[0];
    const savedDetails = getSavedDeliveryDetails();
    const savedName = order.customer_name || user.user_metadata?.name || "";
    const nameParts = savedName.trim().split(/\s+/);
    document.getElementById("firstName").value = savedDetails.firstName || nameParts.shift() || "";
    document.getElementById("lastName").value = savedDetails.lastName || nameParts.join(" ");
    document.getElementById("deliveryRegion").value = checkoutWarehouse;
    document.getElementById("district").value = savedDetails.district || "";
    document.getElementById("street").value = savedDetails.street || "";
    document.getElementById("customerPhone").value = order.customer_phone || user.user_metadata?.phone || "";
    document.getElementById("additionalPhone").value = savedDetails.additionalPhone || "";
    customerLat = Number.isFinite(Number(order.customer_lat)) ? Number(order.customer_lat) : null;
    customerLng = Number.isFinite(Number(order.customer_lng)) ? Number(order.customer_lng) : null;
    updateLocationStatus();
}

// يفتح خريطة اختيار عنوان العميل مع البحث باسم الموقع أو المعلم أو الشارع.
function openCustomerMap() {
    document.getElementById("customerMapModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "customerMapModal";
    modal.innerHTML = `<div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.72)"><section style="width:min(620px,100%);height:80vh;overflow:hidden;border-radius:20px;background:#fff;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:14px;color:#132140"><strong>📍 حدد موقع العميل</strong><button type="button" onclick="closeCustomerMap()" style="border:0;border-radius:10px;padding:7px 11px;cursor:pointer">✕</button></div><div style="position:relative;padding:0 13px 10px"><div style="display:flex;gap:7px"><input id="mapSearchInput" type="search" placeholder="ابحث عن حي أو شارع أو معلم" style="flex:1;min-width:0;height:42px;border:1px solid #cdd7e8;border-radius:9px;padding:0 10px;font-family:inherit;outline:none"><button type="button" onclick="searchCustomerMap()" style="border:0;border-radius:9px;padding:0 13px;background:#236ee8;color:#fff;font-family:inherit;font-weight:800;cursor:pointer">بحث</button></div><button id="locateMeButton" type="button" onclick="locateCustomerOnMap()" style="width:100%;margin-top:8px;min-height:38px;border:1px solid #236ee8;border-radius:9px;background:#eff5ff;color:#1556be;font-family:inherit;font-weight:800;cursor:pointer">◎ تحديد موقعي الحالي</button><div id="mapLocateStatus" style="padding:5px 2px 0;color:#4b5d79;font-size:12px"></div><div id="mapSearchResults" style="position:absolute;right:13px;left:13px;top:52px;z-index:1000;max-height:135px;overflow:auto;border-radius:9px;background:#fff;box-shadow:0 8px 20px rgba(0,0,0,.2)"></div></div><div id="customerMap" style="flex:1"></div><div style="padding:13px"><button type="button" onclick="confirmCustomerLocation()" style="width:100%;min-height:48px;border:0;border-radius:12px;background:#236ee8;color:#fff;font-family:inherit;font-weight:800;cursor:pointer">تأكيد الموقع</button></div></section></div>`;
    document.body.appendChild(modal);
    const mapSearchInput = document.getElementById("mapSearchInput");
    const mapSearchResults = document.getElementById("mapSearchResults");
    if (mapSearchResults) mapSearchResults.style.top = "96px";
    mapSearchInput?.addEventListener("input", () => {
        clearTimeout(mapSearchDelay);
        if (mapSearchInput.value.trim().length < 2) { if (mapSearchResults) mapSearchResults.innerHTML = ""; return; }
        mapSearchDelay = setTimeout(searchCustomerMap, 350);
    });
    mapSearchInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        clearTimeout(mapSearchDelay);
        searchCustomerMap();
    });
    setTimeout(() => {
        const startLat = customerLat ?? 24.7136;
        const startLng = customerLng ?? 46.6753;
        customerMap = L.map("customerMap").setView([startLat, startLng], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(customerMap);
        if (customerLat !== null && customerLng !== null) customerMarker = L.marker([customerLat, customerLng]).addTo(customerMap);
        customerMap.on("click", event => {
            customerLat = event.latlng.lat; customerLng = event.latlng.lng;
            if (customerMarker) customerMarker.setLatLng([customerLat, customerLng]);
            else customerMarker = L.marker([customerLat, customerLng]).addTo(customerMap);
        });
    }, 100);
}

// يطلب إذن الموقع من الجهاز، ثم ينقل الخريطة والمؤشر إلى موقع العميل الحالي.
function locateCustomerOnMap() {
    const status = document.getElementById("mapLocateStatus");
    const button = document.getElementById("locateMeButton");
    if (!navigator.geolocation) { if (status) status.textContent = "جهازك لا يدعم تحديد الموقع."; return; }
    if (!customerMap) return;
    if (status) status.textContent = "جارٍ تحديد موقعك...";
    if (button) button.disabled = true;
    navigator.geolocation.getCurrentPosition((position) => {
        customerLat = position.coords.latitude;
        customerLng = position.coords.longitude;
        customerMap.setView([customerLat, customerLng], 17);
        if (customerMarker) customerMarker.setLatLng([customerLat, customerLng]);
        else customerMarker = L.marker([customerLat, customerLng]).addTo(customerMap);
        if (status) status.innerHTML = '<span style="color:#218653">✓ تم تحديد موقعك، حرّك المؤشر إذا أردت.</span>';
        if (button) button.disabled = false;
    }, (error) => {
        const messages = { 1: "يرجى السماح للموقع باستخدام موقعك من إعدادات المتصفح.", 2: "تعذر معرفة موقعك حاليًا.", 3: "انتهت مهلة تحديد الموقع، حاول مرة أخرى." };
        if (status) status.textContent = messages[error.code] || "تعذر تحديد موقعك.";
        if (button) button.disabled = false;
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

// يبحث عبر Photon المجاني عن موقع أو شارع أو معلم داخل السعودية ويضع المؤشر على النتيجة.
async function searchCustomerMap() {
    const input = document.getElementById("mapSearchInput");
    const results = document.getElementById("mapSearchResults");
    const query = input?.value.trim();
    if (!query || !results || !customerMap) return;
    results.innerHTML = '<div style="padding:10px;color:#4b5d79;font-size:12px">جاري البحث...</div>';
    try {
        const response = await fetch(`https://photon.komoot.io/api/?limit=5&lang=ar&lat=24.7136&lon=46.6753&q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const payload = await response.json();
        const places = (payload.features || []).filter((place) => {
            const country = String(place.properties?.country || "").toLowerCase();
            return !country || country.includes("saudi") || country.includes("arabia") || country.includes("السعود");
        });
        if (!places.length) { await searchCustomerMapFallback(query, input, results); return; }
        results.innerHTML = places.map((place, index) => {
            const props = place.properties || {};
            const label = [props.name, props.street, props.city || props.district, props.state, props.country].filter(Boolean).join("، ");
            return `<button type="button" data-place-index="${index}" style="display:block;width:100%;border:0;border-bottom:1px solid #edf0f5;padding:10px;background:#fff;color:#18233a;text-align:right;font-family:inherit;font-size:12px;cursor:pointer">${escapeMapHtml(label || "نتيجة على الخريطة")}</button>`;
        }).join("");
        results.querySelectorAll("[data-place-index]").forEach(button => button.addEventListener("click", () => {
            const place = places[Number(button.dataset.placeIndex)];
            const [lng, lat] = place.geometry?.coordinates || [];
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            customerLat = lat; customerLng = lng;
            customerMap.setView([customerLat, customerLng], 16);
            if (customerMarker) customerMarker.setLatLng([customerLat, customerLng]);
            else customerMarker = L.marker([customerLat, customerLng]).addTo(customerMap);
            results.innerHTML = "";
            input.value = place.properties?.name || place.properties?.street || "الموقع المختار";
        }));
    } catch (error) {
        console.error("Map search error:", error);
        await searchCustomerMapFallback(query, input, results);
    }
}

// يستخدم بحث OpenStreetMap كخطة احتياطية عندما لا تتاح خدمة Photon أو لا تعيد نتائج.
async function searchCustomerMapFallback(query, input, results) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=sa&accept-language=ar&q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("FALLBACK_SEARCH_FAILED");
        const places = await response.json();
        if (!places.length) { results.innerHTML = '<div style="padding:10px;color:#4b5d79;font-size:12px">لم نجد هذا الموقع، جرّب كتابة اسم الحي أو الشارع.</div>'; return; }
        results.innerHTML = places.map((place, index) => `<button type="button" data-fallback-place-index="${index}" style="display:block;width:100%;border:0;border-bottom:1px solid #edf0f5;padding:10px;background:#fff;color:#18233a;text-align:right;font-family:inherit;font-size:12px;cursor:pointer">${escapeMapHtml(place.display_name)}</button>`).join("");
        results.querySelectorAll("[data-fallback-place-index]").forEach(button => button.addEventListener("click", () => {
            const place = places[Number(button.dataset.fallbackPlaceIndex)];
            customerLat = Number(place.lat); customerLng = Number(place.lon);
            customerMap.setView([customerLat, customerLng], 16);
            if (customerMarker) customerMarker.setLatLng([customerLat, customerLng]);
            else customerMarker = L.marker([customerLat, customerLng]).addTo(customerMap);
            input.value = place.display_name.split(",").slice(0, 2).join("، ");
            results.innerHTML = "";
        }));
    } catch (error) {
        console.error("Fallback map search error:", error);
        results.innerHTML = '<div style="padding:10px;color:#b33c4d;font-size:12px">تعذر البحث الآن، حدد النقطة مباشرة من الخريطة.</div>';
    }
}

// يحفظ النقطة المختارة ويعرض إحداثياتها كتأكيد مرئي للعميل.
function confirmCustomerLocation() {
    if (customerLat === null || customerLng === null) { alert("اختر موقع العميل من الخريطة أولًا."); return; }
    closeCustomerMap();
    updateLocationStatus();
}

// يغلق نافذة الخريطة وينظف كائن الخريطة قبل فتحها مرة أخرى.
function closeCustomerMap() {
    document.getElementById("customerMapModal")?.remove();
    customerMap = null;
    customerMarker = null;
}

// يحدّث حالة الموقع أسفل زر الخريطة وفق الإحداثيات المختارة.
function updateLocationStatus() {
    const status = document.getElementById("locationStatus");
    status.innerHTML = customerLat === null || customerLng === null ? "لم تحدد الموقع" : `<strong style="color:#7ce5a9">✅ تم تحديد موقع العميل</strong><br>${customerLat.toFixed(6)}, ${customerLng.toFixed(6)}`;
}

// يحفظ بيانات وعنوان الاستلام في السلة الحالية قبل العودة إلى صفحة العميل.
async function saveCustomerDeliveryDetails(event) {
    event.preventDefault();
    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const region = document.getElementById("deliveryRegion").value.trim();
    const district = document.getElementById("district").value.trim();
    const street = document.getElementById("street").value.trim();
    const phone = document.getElementById("customerPhone").value.trim();
    const additionalPhone = document.getElementById("additionalPhone").value.trim();
    const name = `${firstName} ${lastName}`.trim();
    if (!firstName || !lastName || !region || !district || !street || !phone || customerLat === null || customerLng === null) { setCheckoutMessage("أدخل الاسم الأول والأخير والمنطقة والحي والشارع ورقم الجوال وحدد موقعه من الخريطة أولًا."); return; }
    if (!/^0?5\d{8}$/.test(phone.replace(/\s|-/g, ""))) { setCheckoutMessage("اكتب رقم جوال سعودي صحيحًا."); return; }
    if (additionalPhone && !/^0?5\d{8}$/.test(additionalPhone.replace(/\s|-/g, ""))) { setCheckoutMessage("اكتب رقم الجوال الإضافي بصيغة صحيحة أو اتركه فارغًا."); return; }
    const button = document.getElementById("submitButton");
    button.disabled = true; button.textContent = "جاري حفظ العنوان..."; setCheckoutMessage("", false);
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error("يجب تسجيل الدخول أولًا.");
        const { data: orders, error: orderError } = await supabaseClient.from("orders").select("id").eq("user_id", user.id).eq("status", "جديد").eq("warehouse", checkoutWarehouse).order("id", { ascending: false }).limit(1);
        if (orderError || !orders?.length) throw new Error("لم يتم العثور على سلة قابلة للتقديم.");
        const order = orders[0];
        const addressSummary = [region, district && `حي ${district}`, street && `شارع ${street}`].filter(Boolean).join(" - ");
        const location = `${addressSummary || region} • الموقع: ${customerLat.toFixed(6)},${customerLng.toFixed(6)}`;
        const { error: detailsError } = await supabaseClient.from("orders").update({ customer_name: name, customer_phone: phone, customer_location: location, customer_lat: customerLat, customer_lng: customerLng }).eq("id", order.id).eq("user_id", user.id);
        if (detailsError) throw detailsError;
        localStorage.setItem("customer_delivery_address", addressSummary || `موقع محدد: ${customerLat.toFixed(5)}, ${customerLng.toFixed(5)}`);
        localStorage.setItem("customer_delivery_details", JSON.stringify({ firstName, lastName, region, district, street, additionalPhone }));
        window.location.href = "orders.html";
    } catch (error) {
        console.error("Customer checkout error:", error);
        setCheckoutMessage(error.message || "تعذر حفظ عنوان الاستلام، حاول مرة أخرى.");
    } finally {
        button.disabled = false; button.textContent = "حفظ عنوان الاستلام";
    }
}

document.getElementById("customerDetailsForm").addEventListener("submit", saveCustomerDeliveryDetails);
loadCustomerCheckout();
