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

// يفتح خريطة اختيار عنوان العميل ويسمح بتحديد نقطة واحدة للطلب.
function openCustomerMap() {
    document.getElementById("customerMapModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "customerMapModal";
    modal.innerHTML = `<div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.72)"><section style="width:min(620px,100%);height:80vh;overflow:hidden;border-radius:20px;background:#fff;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:14px;color:#132140"><strong>📍 حدد موقع العميل</strong><button type="button" onclick="closeCustomerMap()" style="border:0;border-radius:10px;padding:7px 11px;cursor:pointer">✕</button></div><div id="customerMap" style="flex:1"></div><div style="padding:13px"><button type="button" onclick="confirmCustomerLocation()" style="width:100%;min-height:48px;border:0;border-radius:12px;background:#236ee8;color:#fff;font-family:inherit;font-weight:800;cursor:pointer">تأكيد الموقع</button></div></section></div>`;
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
    status.innerHTML = customerLat === null || customerLng === null ? "لم يتم تحديد الموقع بعد" : `<strong style="color:#7ce5a9">✅ تم تحديد موقع العميل</strong><br>${customerLat.toFixed(6)}, ${customerLng.toFixed(6)}`;
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
    if (!firstName || !lastName || !region || !phone || customerLat === null || customerLng === null) { setCheckoutMessage("أدخل الاسم الأول والأخير والمنطقة ورقم الجوال وحدد موقعه من الخريطة أولًا."); return; }
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
        const location = `${customerLat},${customerLng}`;
        const { error: detailsError } = await supabaseClient.from("orders").update({ customer_name: name, customer_phone: phone, customer_location: location, customer_lat: customerLat, customer_lng: customerLng }).eq("id", order.id).eq("user_id", user.id);
        if (detailsError) throw detailsError;
        const addressSummary = [region, district, street].filter(Boolean).join(" - ");
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
