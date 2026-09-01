const trackingOrderId = new URLSearchParams(window.location.search).get("id");
const trackingFromDriver = new URLSearchParams(window.location.search).get("from") === "driver";
const trackingBack = document.getElementById("trackingBack");
if (trackingFromDriver && trackingBack) trackingBack.href = "driver-orders.html";

// يحمي بيانات الطلب والنصوص قبل إدراجها في واجهة التتبع.
function escapeTrackingHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[character])); }

// يحول حالة الطلب المخزنة إلى رقم المرحلة التي ينبغي إضاءتها في شريط التتبع.
function getTrackingStep(status) { return ({ "جديد":0, "قيد التجهيز":1, "تم شحن الطلب":2, "تم التسليم":3, "تم استلام طلبك":3 })[status] ?? 0; }

// يرجع موقع المخزن التقريبي لتوفير رابط خريطة عملي في صفحة التتبع.
function getWarehouseCoordinates(warehouse) { return warehouse === "جدة" ? [21.4858, 39.1925] : [24.7136, 46.6753]; }

// ينشئ شكل كل مرحلة وبياناتها وفق حالة الطلب الحالية.
function renderTrackingStages(order) {
  const active = getTrackingStep(order.status);
  const stages = [{ label:"تم استلام الطلب", icon:"✓" },{ label:"قيد التجهيز", icon:"⌘" },{ label:"تم الشحن", icon:"🚚" },{ label:"تم التسليم", icon:"✓" }];
  return `<div class="stages">${stages.map((stage,index) => `<div class="stage ${index < active ? "done" : ""} ${index === active ? "current" : ""}"><div class="stage-icon">${stage.icon}</div><strong>${stage.label}</strong><small>${index <= active ? formatTrackingDate(order.created_at) : "—"}</small></div>`).join("")}</div>`;
}

// يعرض وقت الطلب بصيغة عربية مختصرة داخل مراحل وسجل النشاط.
function formatTrackingDate(value) { return value ? new Date(value).toLocaleString("ar-SA", { timeZone:"Asia/Riyadh", dateStyle:"medium", timeStyle:"short" }) : "—"; }

// يحمّل الطلب المملوك للحساب الحالي وعناصره ثم يرسم لوحة التتبع كاملة.
async function loadOrderTracking() {
  const page = document.getElementById("trackingPage");
  if (!trackingOrderId) { page.textContent = "لم يتم تحديد رقم الطلب."; return; }
  const { data:{ user }, error:userError } = await supabaseClient.auth.getUser();
  if (userError || !user) { window.location.href = "login.html"; return; }
  const { data:order, error:orderError } = await supabaseClient.from("orders").select("*").eq("id", trackingOrderId).eq("user_id", user.id).neq("status", "جديد").maybeSingle();
  if (orderError || !order) { page.textContent = "لم يتم العثور على هذا الطلب."; return; }
  const { data:items, error:itemsError } = await supabaseClient.from("order_items").select("*").eq("order_id", order.id).order("id", { ascending:true });
  if (itemsError) { page.textContent = "تعذر تحميل منتجات الطلب."; return; }
  const [latitude, longitude] = getWarehouseCoordinates(order.warehouse || "الرياض");
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  const active = getTrackingStep(order.status);
  const eventLabels = ["تم استلام الطلب", "قيد التجهيز", "تم الشحن", "تم التسليم"];
  const eventNotes = ["تم استلام طلبك بنجاح", "جار تجهيز طلبك في المخزن", "سيتم تحديث الحالة عند إرسال الشحنة", "تم تسليم الطلب بنجاح"];
  const timeline = eventLabels.map((label,index) => `<div class="timeline-row ${index < active ? "done" : ""} ${index === active ? "current" : ""}"><span class="timeline-time">${index <= active ? formatTrackingDate(order.created_at) : "—"}</span><div class="timeline-copy"><strong>${label}</strong><small>${eventNotes[index]}</small></div><span class="timeline-dot">${index < active ? "✓" : index === active ? "⌘" : "○"}</span></div>`).join("");
  const products = (items || []).map(item => `<div class="invoice-item">${item.image ? `<img src="${escapeTrackingHtml(item.image)}" alt="">` : '<div class="fallback">📦</div>'}<div class="invoice-info"><strong>${escapeTrackingHtml(item.type || item.product_type || item.model || "منتج")}</strong><small>الكمية: ${Number(item.quantity || 1)}</small></div><strong class="invoice-price">${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)} ر.س</strong></div>`).join("") || '<p class="error">لا توجد منتجات.</p>';
  document.getElementById("trackingTitle").textContent = `تتبع الطلب #${order.id}`;
  page.className = "";
  page.innerHTML = `<section class="panel tracker">${order.status === "ملغي" ? '<p style="text-align:center;color:#ff9eab">هذا الطلب ملغي.</p>' : renderTrackingStages(order)}</section><div class="content-grid"><div class="left"><section class="panel"><h2 class="card-title">معلومات الطلب</h2><div class="details"><div class="details-row"><div class="detail"><span>اسم العميل 👤</span><strong>${escapeTrackingHtml(order.customer_name || "عميل")}</strong></div><div class="detail"><span>رقم الجوال 📞</span><strong>${escapeTrackingHtml(order.customer_phone || "—")}</strong></div><div class="detail"><span>المخزن 🏠</span><strong>مخزن ${escapeTrackingHtml(order.warehouse || "الرياض")}</strong></div><div class="detail"><span>تاريخ الطلب 📅</span><strong>${formatTrackingDate(order.created_at)}</strong></div></div><div class="warehouse-map"><div class="map-art"><i class="pin"></i></div><div class="warehouse-info"><div><span>موقع المخزن</span><strong>مخزن ${escapeTrackingHtml(order.warehouse || "الرياض")}</strong><small>${escapeTrackingHtml(order.warehouse || "الرياض")}، المملكة العربية السعودية</small></div><a class="map-link" target="_blank" href="${mapUrl}">⌖ عرض الموقع على الخريطة</a></div></div></div></section><section class="panel"><h2 class="card-title">سجل التتبع</h2><div class="timeline">${timeline}</div></section></div><aside class="panel"><h2 class="card-title">ملخص الفاتورة</h2><div class="invoice">${products}<div class="totals"><div class="total-row"><span>المجموع الفرعي</span><strong>${Number(order.total || 0).toFixed(2)} ر.س</strong></div><div class="total-row"><span>الشحن</span><strong>—</strong></div><div class="total-row final"><span>الإجمالي</span><strong>${Number(order.total || 0).toFixed(2)} ر.س</strong></div></div></div></aside></div>`;
}

loadOrderTracking();
