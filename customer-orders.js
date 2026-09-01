// يحمي النصوص القادمة من قاعدة البيانات قبل إضافتها إلى بطاقات الطلبات.
function escapeOrdersHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

// يجلب طلبات العميل المقدمة ويعرض كل طلب مع المنتجات والإجمالي.
async function loadCustomerPreviousOrders() {
    const container = document.getElementById("ordersList");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) { window.location.href = "login.html"; return; }
    const { data: orders, error } = await supabaseClient.from("orders").select("*").eq("user_id", user.id).order("id", { ascending: false });
    if (error) { container.textContent = "تعذر تحميل الطلبات، حاول مرة أخرى."; return; }
    if (!orders?.length) { container.innerHTML = "📋 لا توجد طلبات سابقة حتى الآن."; return; }
    container.className = "";
    container.innerHTML = "";
    for (const order of orders) {
        const { data: items, error: itemsError } = await supabaseClient.from("order_items").select("*").eq("order_id", order.id).order("id", { ascending: true });
        const date = new Date(order.created_at).toLocaleString("ar-SA", {
            timeZone: "Asia/Riyadh",
            dateStyle: "medium",
            timeStyle: "short"
        });
        const card = document.createElement("article");
        card.className = "order";
        const renderedItems = itemsError ? '<p class="meta">تعذر تحميل المنتجات.</p>' : (items || []).map(item => `<div class="item"><div>${item.image ? `<img src="${escapeOrdersHtml(item.image)}" alt="">` : '<div class="fallback">📱</div>'}</div><div class="item-info"><strong>${escapeOrdersHtml(item.type || item.product_type || item.model || "منتج")}</strong><span>${escapeOrdersHtml([item.company, item.model, item.color].filter(Boolean).join(" • "))}</span><span>الكمية: ${Number(item.quantity || 1)}</span></div><strong class="item-price">${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)} ر.س</strong></div>`).join("") || '<p class="meta">لا توجد منتجات لهذا الطلب.</p>';
        const editAction = order.status === "جديد" ? `<a class="edit-invoice-button" href="orders.html?editOrder=${encodeURIComponent(order.id)}&warehouse=${encodeURIComponent(order.warehouse || "")}">تعديل الفاتورة ✏️</a>` : '<button type="button" class="edit-invoice-button disabled" disabled>لا يمكن تعديل الفاتورة لأنها قيد التجهيز</button>';
        card.innerHTML = `<div class="order-head"><div><h2>الطلب #${order.id}</h2><p class="date">${date}</p><p class="meta">📍 موجه إلى مخزن ${escapeOrdersHtml(order.warehouse || "الرياض")}</p></div><span class="status">${escapeOrdersHtml(order.status || "غير محدد")}</span></div><div class="items">${renderedItems}</div><div class="total"><span>إجمالي الطلب</span><strong>${Number(order.total || 0).toFixed(2)} ر.س</strong></div><div class="order-actions">${editAction}<a class="track-order-button" href="order-tracking.html?id=${encodeURIComponent(order.id)}">تتبع الطلب ←</a></div>`;
        container.appendChild(card);
    }
}

loadCustomerPreviousOrders();
