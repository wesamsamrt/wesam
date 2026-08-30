let checkoutWarehouse = "";
let customerLat = null;
let customerLng = null;
let customerMap = null;
let customerMarker = null;

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
    modal.innerHTML = `<div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.72)"><section style="width:min(620px,100%);height:80vh;overflow:hidden;border-radius:20px;background:#fff;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:14px;color:#132140"><strong>📍 حدد موقع العميل</strong><button type="button" onclick="closeCustomerMap()" style="border:0;border-radius:10px;padding:7px 11px;cursor:pointer">✕</button></div><div style="position:relative;padding:0 13px 10px"><div style="display:flex;gap:7px"><input id="mapSearchInput" type="search" placeholder="ابحث عن حي أو شارع أو معلم" style="flex:1;min-width:0;height:42px;border:1px solid #cdd7e8;border-radius:9px;padding:0 10px;font-family:inherit;outline:none"><button type="button" onclick="searchCustomerMap()" style="border:0;border-radius:9px;padding:0 13px;background:#236ee8;color:#fff;font-family:inherit;font-weight:800;cursor:pointer">بحث</button></div><div id="mapSearchResults" style="position:absolute;right:13px;left:13px;top:52px;z-index:1000;max-height:135px;overflow:auto;border-radius:9px;background:#fff;box-shadow:0 8px 20px rgba(0,0,0,.2)"></div></div><div id="customerMap" style="flex:1"></div><div style="padding:13px"><button type="button" onclick="confirmCustomerLocation()" style="width:100%;min-height:48px;border:0;border-radius:12px;background:#236ee8;color:#fff;font-family:inherit;font-weight:800;cursor:pointer">تأكيد الموقع</button></div></section></div>`;
    document.body.appendChild(modal);
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

// يبحث في خرائط OpenStreetMap عن موقع أو شارع أو معلم داخل السعودية ويضع المؤشر على النتيجة.
async function searchCustomerMap() {
    const input = document.getElementById("mapSearchInput");
    const results = document.getElementById("mapSearchResults");
    const query = input?.value.trim();
    if (!query || !results || !customerMap) return;
    results.innerHTML = '<div style="padding:10px;color:#4b5d79;font-size:12px">جاري البحث...</div>';
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=sa&accept-language=ar&q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const places = await response.json();
        if (!places.length) { results.innerHTML = '<div style="padding:10px;color:#4b5d79;font-size:12px">لم نجد نتيجة، جرّب اسمًا أو شارعًا آخر.</div>'; return; }
        results.innerHTML = places.map((place, index) => `<button type="button" data-place-index="${index}" style="display:block;width:100%;border:0;border-bottom:1px solid #edf0f5;padding:10px;background:#fff;color:#18233a;text-align:right;font-family:inherit;font-size:12px;cursor:pointer">${escapeMapHtml(place.display_name)}</button>`).join("");
        results.querySelectorAll("[data-place-index]").forEach(button => button.addEventListener("click", () => {
            const place = places[Number(button.dataset.placeIndex)];
            customerLat = Number(place.lat); customerLng = Number(place.lon);
            customerMap.setView([customerLat, customerLng], 16);
            if (customerMarker) customerMarker.setLatLng([customerLat, customerLng]);
            else customerMarker = L.marker([customerLat, customerLng]).addTo(customerMap);
            results.innerHTML = "";
        }));
    } catch (error) {
        console.error("Map search error:", error);
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
