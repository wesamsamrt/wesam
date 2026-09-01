function escapeDriverOrdersHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;", "'":"&#039;" }[character]));
}
function formatDriverOrderDate(value) {
  return value ? new Date(value).toLocaleString("ar-SA", { timeZone:"Asia/Riyadh", dateStyle:"medium", timeStyle:"short" }) : "—";
}
async function loadDriverPreviousOrders() {
  const container = document.getElementById("ordersList");
  const { data:{ user }, error:userError } = await supabaseClient.auth.getUser();
  if (userError || !user) { window.location.href = "login.html"; return; }
  const { data:identity, error:identityError } = await supabaseClient.rpc("get_my_driver_identity");
  if (identityError || !identity?.is_driver) { container.innerHTML = '<div class="empty">هذه الصفحة مخصصة لحسابات المناديب فقط.</div>'; return; }
  const { data:orders, error } = await supabaseClient.from("orders").select("*").eq("user_id", user.id).order("id", { ascending:false });
  if (error) { container.innerHTML = '<div class="empty">تعذر تحميل الطلبات، حاول مرة أخرى.</div>'; return; }
  if (!orders?.length) { container.innerHTML = '<div class="empty">📋 لا توجد طلبات سابقة حتى الآن.</div>'; return; }
  container.className = ""; container.innerHTML = "";
  for (const order of orders) {
    const { data:items, error:itemsError } = await supabaseClient.from("order_items").select("*").eq("order_id", order.id).order("id", { ascending:true });
    const renderedItems = itemsError ? '<p class="meta">تعذر تحميل المنتجات.</p>' : (items || []).map(item => `<div class="item"><div>${item.image ? `<img src="${escapeDriverOrdersHtml(item.image)}" alt="">` : '<div class="fallback">📦</div>'}</div><div class="item-info"><strong>${escapeDriverOrdersHtml(item.type || item.product_type || item.model || "منتج")}</strong><span>${escapeDriverOrdersHtml([item.company, item.model, item.color].filter(Boolean).join(" • "))}</span><span>الكمية: ${Number(item.quantity || 1)}</span></div><strong class="item-price">${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)} ر.س</strong></div>`).join("") || '<p class="meta">لا توجد منتجات لهذا الطلب.</p>';
    const card = document.createElement("article"); card.className = "order";
    const canEditInvoice = ["جديد", "متقدم"].includes(order.status);
    const editAction = canEditInvoice ? `<a class="edit-invoice-button" href="orders.html?editOrder=${encodeURIComponent(order.id)}&warehouse=${encodeURIComponent(order.warehouse || "")}">تعديل الفاتورة ✏️</a>` : '<button type="button" class="edit-invoice-button disabled" disabled>لا يمكن تعديل الفاتورة لأنها قيد التجهيز</button>';
    card.innerHTML = `<div class="order-head"><div><h2>الطلب #${order.id}</h2><p class="date">${formatDriverOrderDate(order.created_at)}</p><p class="meta">👤 العميل: ${escapeDriverOrdersHtml(order.customer_name || "غير مسجل")} · 📍 مخزن ${escapeDriverOrdersHtml(order.warehouse || "الرياض")}</p></div><span class="status">${escapeDriverOrdersHtml(order.status || "غير محدد")}</span></div><div class="items">${renderedItems}</div><div class="total"><span>إجمالي الطلب</span><strong>${Number(order.total || 0).toFixed(2)} ر.س</strong></div><div class="order-actions">${editAction}<a class="track-order-button" href="order-tracking.html?id=${encodeURIComponent(order.id)}&from=driver">تتبع الطلب ←</a></div>`;
    container.appendChild(card);
  }
}
loadDriverPreviousOrders();
