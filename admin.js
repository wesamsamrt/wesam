const loginPage = document.getElementById("loginPage");
const adminPage = document.getElementById("adminPage");

const adminCode = document.getElementById("adminCode");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

const logoutButton = document.getElementById("logoutButton");
const warehouseLoginPage = document.getElementById("warehouseLoginPage");
const warehouseChoiceButtons = document.querySelectorAll("[data-warehouse-choice]");
let selectedWarehouse = null;

function showWarehouseSelection() {
    loginPage.style.display = "none";
    adminPage.style.display = "none";
    warehouseLoginPage.style.display = "flex";
}

function updateWarehouseLabel() {
    const label = document.getElementById("selectedWarehouseLabel");
    if (label) label.textContent = selectedWarehouse ? `مخزن ${selectedWarehouse}` : "—";
    const dashboardName = document.getElementById("dashboardWarehouseName");
    if (dashboardName) dashboardName.textContent = selectedWarehouse ? `مخزن ${selectedWarehouse}` : "وسام سمارت";
}

function selectWarehouse(warehouse) {
    selectedWarehouse = warehouse;
    warehouseOptions?.forEach(option =>
        option.classList.toggle("active", option.dataset.warehouse === warehouse)
    );
    updateWarehouseLabel();
}


/* =========================
   إظهار لوحة الإدارة
========================= */
function showAdmin() {

    const loginPage = document.getElementById("loginPage");
    const adminPage = document.getElementById("adminPage");

    if (!selectedWarehouse) {
        showWarehouseSelection();
        return;
    }

    if (loginPage) {
        loginPage.style.display = "none";
    }

    warehouseLoginPage.style.display = "none";

    const transfersPage = document.getElementById("transfersAdmin");
    if (transfersPage) transfersPage.style.display = "none";

    if (adminPage) {
        adminPage.style.display = "block";
    }
    // تبقى لوحة التحكم الأساسية مستقلة عن أي إضافات إحصائية.
    // بهذا لا يمنع خطأ في تقرير أو تنبيه بقية عناصر الإدارة من العمل.
    updateWarehouseLabel();
    loadDashboardLatestOrders();
    setTimeout(() => loadDashboardData(), 0);

}


/* =========================
   إظهار تسجيل الدخول
========================= */
function showLogin() {

    const loginPage =
        document.getElementById("loginPage");

    const adminPage =
        document.getElementById("adminPage");

    if (loginPage) {
        loginPage.style.display = "flex";
    }

    if (adminPage) {
        adminPage.style.display = "none";
    }

    if (warehouseLoginPage) {
        warehouseLoginPage.style.display = "none";
    }

}


/* =========================
   التحقق هل المستخدم أدمن
========================= */

async function isAdmin() {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    if (!session || !session.user) {

        return false;

    }


    const {
        data,
        error
    } = await supabaseClient
        .from("admins")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();


    if (error) {

        console.error(
            "Admin Check Error:",
            error
        );

        return false;

    }


    return !!data;

}


/* =========================
   تسجيل الدخول للإدارة
========================= */

async function login() {

    const password =
        adminCode.value.trim();


    if (!password) {

        loginMessage.textContent =
            "اكتب كلمة المرور";

        loginMessage.style.color =
            "#e05265";

        return;

    }


    loginButton.disabled = true;

    loginButton.textContent =
        "جاري التحقق...";


    const email =
        "procurement@wesamsa.com";


    try {

        const {
            data,
            error
        } =
            await supabaseClient.auth.signInWithPassword({

                email: email,

                password: password

            });


        if (error) {

            console.error(error);

            loginMessage.textContent =
                "رمز الدخول غير صحيح";

            loginMessage.style.color =
                "#e05265";

            loginButton.disabled =
                false;

            loginButton.textContent =
                "دخول";

            return;

        }


        /* =========================
           التحقق من صلاحية الأدمن
        ========================= */

        const admin =
            await isAdmin();


        if (!admin) {

            await supabaseClient.auth.signOut();


            loginMessage.textContent =
                "هذا الحساب ليس لديه صلاحية دخول لوحة الإدارة";

            loginMessage.style.color =
                "#e05265";

            loginButton.disabled =
                false;

            loginButton.textContent =
                "دخول";

            return;

        }


        /* =========================
           نجاح
        ========================= */

        loginMessage.textContent =
            "تم الدخول بنجاح ✓";

        loginMessage.style.color =
            "#2e9d69";


        showAdmin();


        loginButton.disabled =
            false;

        loginButton.textContent =
            "دخول";

    }

    catch (error) {

        console.error(
            "Admin Login Error:",
            error
        );


        loginMessage.textContent =
            "حدث خطأ أثناء تسجيل الدخول";

        loginMessage.style.color =
            "#e05265";


        loginButton.disabled =
            false;

        loginButton.textContent =
            "دخول";

    }

}


/* =========================
   تسجيل الخروج
========================= */

async function logout() {

    await supabaseClient.auth.signOut();

    showLogin();

    selectedWarehouse = null;

    adminCode.value = "";

}


/* =========================
   زر الدخول
========================= */

loginButton.addEventListener(
    "click",
    login
);


/* =========================
   Enter
========================= */

adminCode.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {

            login();

        }

    }
);


/* =========================
   زر الخروج
========================= */

logoutButton.addEventListener(
    "click",
    logout
);

warehouseChoiceButtons.forEach(button => {
    button.addEventListener("click", () => {
        selectWarehouse(button.dataset.warehouseChoice);
        showAdmin();
    });
});

document.getElementById("changeWarehouseButton")?.addEventListener("click", () => {
    document.getElementById("productsAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    showWarehouseSelection();
});

document.getElementById("warehouseBackToLogin")?.addEventListener("click", logout);

/* =========================================================
   تحويلات المخزون بين المستودعات
========================================================= */
const transfersButton = document.getElementById("transfersButton");
const transfersAdmin = document.getElementById("transfersAdmin");
const backFromTransfers = document.getElementById("backFromTransfers");
const transferSourceWarehouse = document.getElementById("transferSourceWarehouse");
const transferDestinationWarehouse = document.getElementById("transferDestinationWarehouse");
const transferProductSelect = document.getElementById("transferProductSelect");
const transferProductSearch = document.getElementById("transferProductSearch");
const transferQuantity = document.getElementById("transferQuantity");
const transferNotes = document.getElementById("transferNotes");
const transferDraftItems = document.getElementById("transferDraftItems");
const transferFormMessage = document.getElementById("transferFormMessage");
const transfersList = document.getElementById("transfersList");
let transferSourceProducts = [];
let transferDraft = [];
let transferMode = "request";
let transfersCache = [];

const transferText = value => String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

function setTransferMessage(message, error = false) {
    if (!transferFormMessage) return;
    transferFormMessage.textContent = message;
    transferFormMessage.style.color = error ? "#c14359" : "#2e9d69";
}

function renderTransferDraft() {
    if (!transferDraftItems) return;
    if (!transferDraft.length) {
        transferDraftItems.innerHTML = "<span>لم تتم إضافة منتجات بعد.</span>";
        return;
    }
    transferDraftItems.innerHTML = transferDraft.map((item, index) => `
        <div class="transfer-draft-item">
            <span>${transferText(item.name)} — <strong>${item.quantity} قطعة</strong><small> · المصدر: ${item.source_quantity} · في مخزني: ${item.destination_quantity}</small></span>
            <button type="button" onclick="removeTransferDraftItem(${index})">إزالة</button>
        </div>
    `).join("");
}

window.removeTransferDraftItem = function (index) {
    transferDraft.splice(index, 1);
    renderTransferDraft();
};

async function loadTransferSourceProducts() {
    if (!transferSourceWarehouse || !transferProductSelect) return;
    transferProductSelect.innerHTML = "<option value=\"\">جاري تحميل منتجات المخزن...</option>";
    const [{ data, error }, { data: destinationProducts, error: destinationError }] = await Promise.all([
        supabaseClient
        .from("products")
        .select("id, product_code, company, model, color, type, product_type, quantity, copied_from_product_id")
        .eq("warehouse", transferSourceWarehouse.value)
        .gt("quantity", 0)
        .order("model"),
        supabaseClient
        .from("products")
        .select("id, quantity, copied_from_product_id")
        .eq("warehouse", transferDestinationWarehouse.value)
    ]);
    if (error || destinationError) {
        console.error("Load transfer source products error:", error);
        transferProductSelect.innerHTML = "<option value=\"\">تعذر تحميل المنتجات</option>";
        setTransferMessage((error || destinationError).message, true);
        return;
    }
    const destinationById = new Map((destinationProducts || []).map(product => [String(product.id), product]));
    const destinationBySourceId = new Map((destinationProducts || []).filter(product => product.copied_from_product_id).map(product => [String(product.copied_from_product_id), product]));
    transferSourceProducts = (data || []).map(product => {
        const counterpart = transferSourceWarehouse.value === "الرياض"
            ? destinationBySourceId.get(String(product.id))
            : destinationById.get(String(product.copied_from_product_id));
        return { ...product, destination_quantity: Number(counterpart?.quantity || 0) };
    });
    renderTransferProductOptions();
}

function renderTransferProductOptions() {
    const search = (transferProductSearch?.value || "").toLowerCase().trim();
    const products = transferSourceProducts.filter(product => {
        const values = [product.product_code, product.company, product.model, product.color, product.type, product.product_type].join(" ").toLowerCase();
        return !search || values.includes(search);
    });
    transferProductSelect.innerHTML = '<option value="">اختر منتجًا للتحويل</option>' + products.map(product => {
        const name = [product.company, product.model, product.product_code].filter(Boolean).join(" ") || `منتج #${product.id}`;
        const details = [product.color, product.type, product.product_type].filter(Boolean).join(" · ");
        return `<option value="${product.id}">${transferText(name)}${details ? ` — ${transferText(details)}` : ""} | المصدر: ${product.quantity || 0} | مخزني: ${product.destination_quantity}</option>`;
    }).join("");
}

function configureTransferMode() {
    if (!transferSourceWarehouse || !transferDestinationWarehouse) return;
    const otherWarehouse = selectedWarehouse === "الرياض" ? "جدة" : "الرياض";
    const requesting = transferMode === "request";
    transferSourceWarehouse.value = requesting ? otherWarehouse : selectedWarehouse;
    transferDestinationWarehouse.value = requesting ? selectedWarehouse : otherWarehouse;
    document.getElementById("createTransferButton").textContent = requesting ? "إرسال طلب البضاعة" : "إنشاء تحويل للإرسال";
    transferDraft = [];
    renderTransferDraft();
    loadTransferSourceProducts();
}

document.querySelectorAll(".transfer-mode").forEach(button => button.addEventListener("click", () => {
    transferMode = button.dataset.transferMode;
    document.querySelectorAll(".transfer-mode").forEach(item => item.classList.toggle("active", item === button));
    configureTransferMode();
}));

document.getElementById("addTransferItemButton")?.addEventListener("click", () => {
    const product = transferSourceProducts.find(item => String(item.id) === transferProductSelect.value);
    const quantity = Number(transferQuantity.value);
    if (!product || !Number.isInteger(quantity) || quantity < 1) {
        setTransferMessage("اختر منتجًا وأدخل كمية صحيحة.", true);
        return;
    }
    if (quantity > Number(product.quantity || 0)) {
        setTransferMessage(`الكمية المتاحة لهذا المنتج هي ${product.quantity || 0} فقط.`, true);
        return;
    }
    const existing = transferDraft.find(item => item.product_id === product.id);
    if (existing) {
        if (existing.quantity + quantity > Number(product.quantity || 0)) {
            setTransferMessage(`إجمالي الكمية يتجاوز المتاح (${product.quantity || 0}).`, true);
            return;
        }
        existing.quantity += quantity;
    } else {
        transferDraft.push({
            product_id: product.id,
            quantity,
            name: [[product.company, product.model, product.product_code].filter(Boolean).join(" ") || `منتج #${product.id}`, product.color, product.type, product.product_type].filter(Boolean).join(" · "),
            source_quantity: product.quantity || 0,
            destination_quantity: product.destination_quantity || 0
        });
    }
    transferQuantity.value = "";
    transferProductSelect.value = "";
    setTransferMessage("");
    renderTransferDraft();
});

document.getElementById("createTransferButton")?.addEventListener("click", async () => {
    const source = transferSourceWarehouse.value;
    const destination = transferDestinationWarehouse.value;
    if (source === destination) { setTransferMessage("يجب أن يختلف مخزن الوجهة عن المصدر.", true); return; }
    if (!transferDraft.length) { setTransferMessage("أضف منتجًا واحدًا على الأقل للتحويل.", true); return; }
    setTransferMessage("جاري إنشاء التحويل...");
    const { data, error } = await supabaseClient.rpc("create_warehouse_transfer", {
        p_source_warehouse: source,
        p_destination_warehouse: destination,
        p_notes: transferNotes.value.trim() || null,
        p_items: transferDraft.map(({ product_id, quantity }) => ({ product_id, quantity })),
        p_creation_mode: transferMode
    });
    if (error) { setTransferMessage(`تعذر إنشاء التحويل: ${error.message}`, true); return; }
    transferDraft = [];
    transferNotes.value = "";
    renderTransferDraft();
    setTransferMessage(transferMode === "request" ? `تم إرسال طلب البضاعة #${data} إلى مخزن ${source}.` : `تم إنشاء التحويل #${data} كمسودة.`);
    loadTransfers();
});

function transferStatusLabel(status) {
    return ({ requested: "بانتظار موافقة المصدر", draft: "مسودة", in_transit: "قيد النقل", received: "تم الاستلام", cancelled: "ملغي" })[status] || status;
}

async function loadTransfers() {
    if (!transfersList) return;
    transfersList.innerHTML = '<div class="message">جاري تحميل التحويلات...</div>';
    const { data: transfers, error } = await supabaseClient
        .from("warehouse_transfers")
        .select("id, source_warehouse, destination_warehouse, status, notes, created_at, dispatched_at, received_at, requested_by_warehouse")
        .order("id", { ascending: false });
    if (error) { transfersList.innerHTML = `<div class="message error">تعذر تحميل التحويلات: ${error.message}</div>`; return; }
    const visibleTransfers = (transfers || []).filter(item => [item.source_warehouse, item.destination_warehouse].includes(selectedWarehouse));
    transfersCache = visibleTransfers;
    const ids = visibleTransfers.map(item => item.id);
    const { data: items, error: itemsError } = ids.length ? await supabaseClient
        .from("warehouse_transfer_items")
        .select("transfer_id, product_name, product_code, company, model, color, product_type, type, quantity")
        .in("transfer_id", ids) : { data: [], error: null };
    if (itemsError) { transfersList.innerHTML = `<div class="message error">تعذر تحميل عناصر التحويلات: ${itemsError.message}</div>`; return; }
    const itemsByTransfer = new Map();
    (items || []).forEach(item => itemsByTransfer.set(item.transfer_id, [...(itemsByTransfer.get(item.transfer_id) || []), item]));
    if (!visibleTransfers.length) { transfersList.innerHTML = '<div class="message">لا توجد تحويلات واردة أو صادرة لمخزن ' + selectedWarehouse + ' حتى الآن.</div>'; return; }
    transfersList.innerHTML = visibleTransfers.map(transfer => {
        const transferItems = itemsByTransfer.get(transfer.id) || [];
        const isSource = transfer.source_warehouse === selectedWarehouse;
        const isDestination = transfer.destination_warehouse === selectedWarehouse;
        const canDispatch = isSource && ["draft", "requested"].includes(transfer.status);
        const canReceive = isDestination && transfer.status === "in_transit";
        const canCancel = ["draft", "requested", "in_transit"].includes(transfer.status);
        const direction = isDestination ? `وارد إلى مخزن ${selectedWarehouse}` : `صادر من مخزن ${selectedWarehouse}`;
        return `<article class="transfer-card">
            <div class="transfer-card-top"><div><h4>تحويل #${transfer.id}: ${transfer.source_warehouse} إلى ${transfer.destination_warehouse}</h4><p class="transfer-card-meta"><span class="transfer-direction">${direction}</span> ${new Date(transfer.created_at).toLocaleString("ar-SA")}${transfer.notes ? ` · ${transferText(transfer.notes)}` : ""}</p></div><span class="transfer-status ${transfer.status}">${transferStatusLabel(transfer.status)}</span></div>
            <div class="transfer-items-summary">${transferItems.map(item => `<div><strong>${transferText(item.product_name)}</strong> — ${item.quantity} قطعة <small>${[item.color, item.type, item.product_type].filter(Boolean).map(transferText).join(" · ")}</small></div>`).join("") || "لا توجد عناصر"}</div>
            <div class="transfer-card-bottom"><span class="transfer-card-meta">${transfer.dispatched_at ? `تم الشحن: ${new Date(transfer.dispatched_at).toLocaleString("ar-SA")}` : "لم يتم الشحن"}</span><div class="transfer-actions">${canDispatch ? `<button class="transfer-action" onclick="changeTransferStatus(${transfer.id}, 'dispatch')">${transfer.status === "requested" ? "قبول وإرسال" : "شحن التحويل"}</button>` : ""}${canReceive ? `<button class="transfer-action receive" onclick="changeTransferStatus(${transfer.id}, 'receive')">تأكيد الاستلام</button>` : ""}${canCancel ? `<button class="transfer-action cancel" onclick="changeTransferStatus(${transfer.id}, 'cancel')">إلغاء</button>` : ""}<button class="transfer-action print" onclick="printTransfer(${transfer.id})">🖨️ طباعة</button></div></div>
        </article>`;
    }).join("");
}

window.changeTransferStatus = async function (transferId, action) {
    const descriptions = { dispatch: "شحن التحويل؟ سيتم خصم الكمية من المخزن المصدر.", receive: "تأكيد استلام التحويل؟ ستضاف الكمية إلى المخزن الوجهة.", cancel: "إلغاء التحويل؟ ستعاد الكميات للمصدر إذا كان التحويل قيد النقل." };
    if (!confirm(descriptions[action])) return;
    const { error } = await supabaseClient.rpc("process_warehouse_transfer", { p_transfer_id: transferId, p_action: action });
    if (error) { alert(`تعذر تنفيذ العملية: ${error.message}`); return; }
    await Promise.all([loadTransfers(), loadTransferSourceProducts(), loadDashboardData(), loadDashboardLatestOrders()]);
};

window.printTransfer = function (transferId) {
    const transfer = transfersCache.find(item => Number(item.id) === Number(transferId));
    if (!transfer) return;
    const card = [...document.querySelectorAll(".transfer-card")].find(item => item.textContent.includes(`تحويل #${transferId}:`));
    const printWindow = window.open("", "_blank", "width=850,height=700");
    if (!printWindow) { alert("السماح بالنوافذ المنبثقة مطلوب للطباعة."); return; }
    printWindow.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تحويل #${transfer.id}</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#171827}h1{color:#5144d8}.transfer-card{border:1px solid #ddd;border-radius:14px;padding:20px}.transfer-card-bottom,.transfer-actions{display:none}.transfer-card-top{border-bottom:1px solid #ddd;padding-bottom:12px}.transfer-items-summary div{padding:9px 0;border-bottom:1px solid #eee}small{color:#666}</style></head><body><h1>فاتورة تحويل مخزون</h1>${card?.outerHTML || ""}<script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
};

transfersButton?.addEventListener("click", async () => {
    document.getElementById("adminPage").style.display = "none";
    document.getElementById("productsAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    transfersAdmin.style.display = "block";
    transferMode = "request";
    document.querySelectorAll(".transfer-mode").forEach(item => item.classList.toggle("active", item.dataset.transferMode === "request"));
    configureTransferMode();
    await loadTransfers();
});
backFromTransfers?.addEventListener("click", () => { transfersAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
transferProductSearch?.addEventListener("input", renderTransferProductOptions);
document.getElementById("refreshTransfersButton")?.addEventListener("click", loadTransfers);
["productsButton", "ordersButton", "categoriesButton", "dashboardButton"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
        if (transfersAdmin) transfersAdmin.style.display = "none";
    });
});


/* =========================
   التحقق عند فتح الصفحة
========================= */
/* =========================
   حساب الإدارة المسموح
========================= */

const ADMIN_EMAIL = "zzzzxxccvvbbnnmm12345a@wesamsa.com";


/* =========================
   التحقق من حساب الإدارة
========================= */

async function checkSession() {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    /* لا يوجد تسجيل دخول */

    if (!session || !session.user) {

        showLogin();

        return;

    }


    /* إيميل المستخدم */

    const userEmail =
        (session.user.email || "")
            .trim()
            .toLowerCase();


    /* =========================
       التحقق من أنه الأدمن
    ========================= */

    if (userEmail !== ADMIN_EMAIL.toLowerCase()) {

        console.log(
            "محاولة دخول غير مصرح بها:",
            userEmail
        );


        /* تسجيل خروج الحساب */

        await supabaseClient.auth.signOut();


        showLogin();


        loginMessage.textContent =
            "هذا الحساب ليس لديه صلاحية دخول لوحة الإدارة";

        loginMessage.style.color =
            "#e05265";


        return;

    }


    /* =========================
       الحساب صحيح
    ========================= */

    showAdmin();

}


checkSession();

/* =========================================================
   بيانات لوحة التحكم الفعلية
========================================================= */
const formatAdminCurrency = value => `${Number(value || 0).toFixed(2)} ر.س`;
let dashboardOrdersCache = [];

async function loadDashboardData() {
    const alerts = document.getElementById("dashboardOperationalAlerts");

    try {
        const [{ data: orders, error: ordersError }, { data: products, error: productsError }] = await Promise.all([
            supabaseClient.from("orders").select("id, status, total, created_at, user_id").eq("warehouse", selectedWarehouse).order("id", { ascending: false }),
            supabaseClient.from("products").select("id, product_code, company, model, quantity, image").eq("warehouse", selectedWarehouse)
        ]);

        if (ordersError) throw ordersError;
        if (productsError) throw productsError;

        const safeOrders = orders || [];
        dashboardOrdersCache = safeOrders;
        const safeProducts = products || [];
        const nonCancelled = safeOrders.filter(order => order.status !== "ملغي");
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthOrders = nonCancelled.filter(order => new Date(order.created_at) >= monthStart);
        const monthSales = monthOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

        document.getElementById("dashboardCustomersCount").textContent = new Set(safeOrders.map(order => order.user_id).filter(Boolean)).size;
        document.getElementById("dashboardSalesTotal").textContent = formatAdminCurrency(nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0));
        document.getElementById("dashboardProductsCount").textContent = safeProducts.length;
        document.getElementById("dashboardOrdersCount").textContent = safeOrders.length;
        document.getElementById("dashboardSalesSummary").textContent = formatAdminCurrency(monthSales);

        const lowStock = safeProducts.filter(product => Number(product.quantity || 0) <= 5);
        const newOrders = safeOrders.filter(order => (order.status || "جديد") === "جديد");
        if (alerts) {
            alerts.innerHTML = `
                <button type="button" class="dashboard-alert new-orders-alert" id="dashboardNewOrdersAlert">
                    <strong>${newOrders.length}</strong><span>طلبات جديدة تحتاج متابعة</span>
                </button>
                <button type="button" class="dashboard-alert stock-alert" id="dashboardLowStockAlert">
                    <strong>${lowStock.length}</strong><span>منتجات مخزونها 5 أو أقل</span>
                </button>
            `;
            document.getElementById("dashboardNewOrdersAlert")?.addEventListener("click", () => {
                ordersButton.click();
                setTimeout(() => { if (adminOrderStatusFilter) adminOrderStatusFilter.value = "جديد"; renderAdminOrdersList(); }, 0);
            });
            document.getElementById("dashboardLowStockAlert")?.addEventListener("click", () => openLowStockInventory());
        }

        await loadDashboardBestProducts(safeOrders);
    } catch (error) {
        console.error("Dashboard data error:", error);
        if (alerts) alerts.innerHTML = '<div class="dashboard-alert-error">تعذر تحميل بعض بيانات لوحة التحكم.</div>';
    }
}

async function loadDashboardBestProducts(orders) {
    const container = document.getElementById("dashboardBestProducts");
    if (!container) return;

    const orderIds = orders.filter(order => order.status !== "ملغي").map(order => order.id);
    if (!orderIds.length) {
        container.innerHTML = '<div class="dashboard-empty">لا توجد مبيعات لعرض أفضل المنتجات.</div>';
        return;
    }

    const { data: items, error } = await supabaseClient
        .from("order_items")
        .select("product_code, company, model, quantity, image")
        .in("order_id", orderIds);
    if (error) throw error;

    const totals = new Map();
    (items || []).forEach(item => {
        const key = item.product_code || `${item.company || ""} ${item.model || ""}`.trim() || "منتج بدون كود";
        const current = totals.get(key) || { ...item, quantity: 0 };
        current.quantity += Number(item.quantity || 0);
        totals.set(key, current);
    });
    const best = [...totals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    container.innerHTML = best.length ? best.map((item, index) => `
        <div class="dashboard-best-product-row">
            <span class="best-product-rank">${index + 1}</span>
            <span class="best-product-name">${item.company || ""} ${item.model || item.product_code || "منتج"}</span>
            <strong>${item.quantity} قطعة</strong>
        </div>
    `).join("") : '<div class="dashboard-empty">لا توجد منتجات مباعة حتى الآن.</div>';
}

function exportSalesReport() {
    if (!dashboardOrdersCache.length) {
        alert("لا توجد بيانات مبيعات لتصديرها بعد.");
        return;
    }

    const rows = [["رقم الطلب", "الحالة", "التاريخ", "الإجمالي"]];
    dashboardOrdersCache.forEach(order => rows.push([
        order.id,
        order.status || "جديد",
        new Date(order.created_at).toLocaleString("ar-SA"),
        Number(order.total || 0).toFixed(2)
    ]));
    const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

document.getElementById("dashboardMonthLabel")?.addEventListener("click", loadDashboardData);
document.getElementById("dashboardBestProductsButton")?.addEventListener("click", exportSalesReport);



/* =========================================================
   إدارة المنتجات
========================================================= */

const productsButton =
    document.getElementById("productsButton");

const productsAdmin =
    document.getElementById("productsAdmin");

const backToDashboard =
    document.getElementById("backToDashboard");

const dashboardContent =
    document.querySelector(".admin-content");

const adminProducts =
    document.getElementById("adminProducts");

const adminProductSearch =
    document.getElementById("adminProductSearch");


let adminProductsData = [];
let selectedProductImage = null;

const warehouseOptions = document.querySelectorAll(".warehouse-option");

function getProductsForSelectedWarehouse() {
    return adminProductsData.filter(product =>
        (product.warehouse || "الرياض") === selectedWarehouse
    );
}

function renderSelectedWarehouseProducts() {
    renderAdminProducts(getProductsForSelectedWarehouse());
}

warehouseOptions.forEach(button => {
    button.addEventListener("click", () => {
        selectWarehouse(button.dataset.warehouse);
        adminProductSearch.value = "";
        adminProductSearch.placeholder = `ابحث في منتجات مخزن ${selectedWarehouse}...`;
        if (productsAdmin.style.display !== "none") {
            loadAdminProducts();
        }
        loadDashboardData();
        loadDashboardLatestOrders();
    });
});

const productImage =
    document.getElementById("productImage");

productImage.addEventListener("change", function () {

    selectedProductImage =
        this.files[0] || null;

});

/* فتح إدارة المنتجات */
productsButton.addEventListener("click", async function () {

    document.getElementById("adminPage").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("productsAdmin").style.display = "block";

    await loadAdminProducts();

});


/* الرجوع */
backToDashboard.addEventListener("click", function () {

    document.getElementById("productsAdmin").style.display = "none";

    document.getElementById("adminPage").style.display = "block";

});

/* تحميل المنتجات */
async function loadAdminProducts() {

    adminProducts.innerHTML = `
        <div class="loading">
            جاري تحميل جميع المنتجات...
        </div>
    `;

    try {

        let allProducts = [];
        let from = 0;
        const pageSize = 1000;

        while (true) {

            const {
                data,
                error
            } = await supabaseClient
                .from("products")
                .select("*")
                .eq("warehouse", selectedWarehouse)
                .order("id", {
                    ascending: false
                })
                .range(
                    from,
                    from + pageSize - 1
                );

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) {
                break;
            }

            allProducts.push(...data);

            console.log(
                "تم تحميل المنتجات:",
                allProducts.length
            );

            // إذا رجعت أقل من 1000
            // فهذا يعني أننا وصلنا للنهاية
            if (data.length < pageSize) {
                break;
            }

            from += pageSize;
        }

        adminProductsData = allProducts;

        console.log(
            "✅ إجمالي المنتجات:",
            adminProductsData.length
        );

        renderSelectedWarehouseProducts();

    }

    catch (error) {

        console.error(
            "❌ خطأ تحميل جميع المنتجات:",
            error
        );

        adminProducts.innerHTML = `
            <div class="message error">
                حدث خطأ أثناء تحميل المنتجات
                <br>
                ${error.message || ""}
            </div>
        `;

    }

}


async function openLowStockInventory() {
    document.getElementById("adminPage").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("productsAdmin").style.display = "block";
    await loadAdminProducts();
    adminProductSearch.value = "";
    adminProductSearch.placeholder = "تُعرض المنتجات ذات المخزون المنخفض (5 أو أقل)";
    renderAdminProducts(getProductsForSelectedWarehouse().filter(product => Number(product.quantity || 0) <= 5));
}

/* عرض المنتجات */

function renderAdminProducts(products) {

    adminProducts.innerHTML = "";


    if (!products.length) {

        adminProducts.innerHTML = `
            <div class="message">
                لا توجد منتجات
            </div>
        `;

        return;
    }


    products.forEach(product => {

        const item =
            document.createElement("div");

        item.className =
            "admin-product";


        item.innerHTML = `

            <div class="admin-product-info">

                <h3>
                    ${product.model || "بدون موديل"}
                </h3>

                <p>
                    ${product.category || ""}
                    •
                    ${product.product_type || ""}
                    •
                    ${product.type || ""}
                    •
                    ${product.company || ""}
                </p>

            </div>


            <div class="admin-product-quantity">
                الكمية: ${product.quantity ?? 0}
            </div>


            <div class="admin-product-price">
                ${product.price ?? 0} ر.س
            </div>


            <div class="admin-product-actions">

                <button
                    class="edit-product"
                    onclick="editProduct(${product.id})"
                >
                    ✏️
                </button>

                <button
                    class="delete-product"
                    onclick="deleteProduct(${product.id})"
                >
                    🗑️
                </button>

            </div>
        `;


        adminProducts.appendChild(item);

    });

}


/* البحث */

adminProductSearch.addEventListener(
    "input",
    function () {

        const search =
            this.value
                .toLowerCase()
                .trim();


        const filtered =
            getProductsForSelectedWarehouse().filter(product => {

               const text = `

                 ${product.product_code || ""}
                ${product.model || ""}
                 ${product.company || ""}
                     ${product.category || ""}
                 ${product.product_type || ""}
                 ${product.type || ""}

                `.toLowerCase();


                return text.includes(search);

            });


        renderAdminProducts(filtered);

    }
);

document.getElementById("addProductDashboardButton")?.addEventListener("click", async () => {
    document.getElementById("adminPage").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("productsAdmin").style.display = "block";
    await loadAdminProducts();
    addProductButton.click();
});

document.getElementById("inventoryDashboardButton")?.addEventListener("click", openLowStockInventory);
document.getElementById("newOrderDashboardButton")?.addEventListener("click", () => ordersButton.click());
document.getElementById("reportsDashboardButton")?.addEventListener("click", exportSalesReport);




/* =========================
   إضافة / تعديل منتج
========================= */

const addProductButton =
    document.getElementById("addProductButton");

const productFormCard =
    document.getElementById("productFormCard");

const cancelProductButton =
    document.getElementById("cancelProductButton");

const saveProductButton =
    document.getElementById("saveProductButton");

const productFormMessage =
    document.getElementById("productFormMessage");


addProductButton.addEventListener("click", function () {

    productFormCard.style.display = "block";
    document.getElementById("productWarehouse").value = selectedWarehouse;
    document.getElementById(
    "productCompatibilityType"
).value = "device";

updateProductCompatibilityFields();

    productFormMessage.textContent = "";

    productFormCard.scrollIntoView({
        behavior: "smooth"
    });

});


cancelProductButton.addEventListener("click", function () {

    productFormCard.style.display = "none";

    clearProductForm();

});


function clearProductForm() {

    document.getElementById("productCategory").value = "";
    document.getElementById("productProductType").value = "";
    document.getElementById("productType").value = "";
    document.getElementById("productCompany").value = "";
    document.getElementById("productModel").value = "";
    document.getElementById("productColor").value = "";
    document.getElementById("productQuantity").value = "";
    document.getElementById("productWarehouse").value = selectedWarehouse;
    document.getElementById("productPrice").value = "";

const compatibilitySelect =
    document.getElementById(
        "productCompatibilityType"
    );

if (compatibilitySelect) {

    compatibilitySelect.value =
        "device";

}


const compatibleDevicesInput =
    document.getElementById(
        "compatibleDevices"
    );

if (compatibleDevicesInput) {

    compatibleDevicesInput.value =
        "";

}


updateProductCompatibilityFields();
    selectedProductImage = null;

document.getElementById("productImage").value = "";

document.getElementById("productImagePreview").innerHTML = "";
}

/* =========================================================
   رفع صورة المنتج
========================================================= */
async function uploadProductImage(productId, file) {

    if (!productId) {
        console.error("لا يوجد productId");
        return null;
    }

    if (!file) {
        console.error("لم يتم اختيار صورة");
        return null;
    }

    try {

        /* =========================
           اسم فريد للصورة
        ========================= */

        const fileExt =
            file.name.split(".").pop();

        const fileName =
            `${crypto.randomUUID()}.${fileExt}`;

        const filePath =
            `products/${fileName}`;


        /* =========================
           رفع الصورة إلى Storage
        ========================= */

        const {
            error: uploadError
        } = await supabaseClient
            .storage
            .from("product-images")
            .upload(
                filePath,
                file,
                {
                    upsert: false,
                    contentType: file.type
                }
            );


        if (uploadError) {

            console.error(
                "Image Upload Error:",
                uploadError
            );

            alert(
                "حدث خطأ أثناء رفع الصورة:\n" +
                uploadError.message
            );

            return null;
        }


        /* =========================
           الحصول على رابط الصورة
        ========================= */

        const {
            data: publicData
        } =
            supabaseClient
                .storage
                .from("product-images")
                .getPublicUrl(filePath);


        const imageUrl =
            publicData?.publicUrl;


        if (!imageUrl) {

            console.error(
                "لم يتم الحصول على رابط الصورة"
            );

            return null;
        }


        console.log(
            "رابط الصورة:",
            imageUrl
        );


        /* =========================
           حفظ الرابط في نفس المنتج
        ========================= */

        const {
            error: updateError
        } =
            await supabaseClient
                .from("products")
                .update({
                    image: imageUrl
                })
                .eq("id", productId);


        if (updateError) {

            console.error(
                "Product Image Update Error:",
                updateError
            );

            alert(
                "تم رفع الصورة، لكن لم يتم حفظها داخل المنتج:\n" +
                updateError.message
            );

            return null;
        }


        console.log(
            "تم حفظ الصورة داخل المنتج ✅"
        );


        return imageUrl;

    }

    catch (error) {

        console.error(
            "Upload Product Image Error:",
            error
        );

        alert(
            "حدث خطأ أثناء رفع الصورة"
        );

        return null;
    }

}


/* حفظ المنتج */

saveProductButton.addEventListener(
    "click",
    saveNewProduct
);


async function saveNewProduct() {

    const category =
        document.getElementById("productCategory").value.trim();

    const productType =
        document.getElementById("productProductType").value.trim();

    const type =
        document.getElementById("productType").value.trim();

    const company =
        document.getElementById("productCompany").value.trim();

    const model =
        document.getElementById("productModel").value.trim();

    const color =
        document.getElementById("productColor").value.trim();

    const quantity =
        Number(
            document.getElementById("productQuantity").value
        );

    const warehouse = document.getElementById("productWarehouse").value;

    const price =
        Number(
            document.getElementById("productPrice").value
        );

    const imageFile =
        document.getElementById("productImage").files[0];


    if (
    !category ||
    !productType ||
    !type
) {

    productFormMessage.textContent =
        "فضلاً أكمل بيانات المنتج المطلوبة";

    productFormMessage.style.color =
        "#e05265";

    return;
}

const compatibilityType =
    document.getElementById(
        "productCompatibilityType"
    ).value;



/* =========================
   التحقق حسب نوع التوافق
========================= */

if (
    compatibilityType === "device" &&
    (!company || !model)
) {

    productFormMessage.textContent =
        "اكتب الشركة والموديل لهذا المنتج";

    productFormMessage.style.color =
        "#e05265";

    return;
}


let compatibleDevicesArray = [];


if (
    compatibilityType === "multi"
) {

    compatibleDevicesArray =
        compatibleDevices.value
            .split("\n")
            .map(item => item.trim())
            .filter(Boolean);


    if (
        compatibleDevicesArray.length === 0
    ) {

        productFormMessage.textContent =
            "أدخل جهازًا واحدًا على الأقل";

        productFormMessage.style.color =
            "#e05265";

        return;
    }

}


    saveProductButton.disabled = true;

    saveProductButton.textContent =
        editingProductId
            ? "جاري تعديل المنتج..."
            : "جاري الحفظ...";



            let imageUrl = null;

try {

    if (imageFile) {

        imageUrl =
            await uploadProductImage(imageFile);

    }

}
catch (error) {

    productFormMessage.textContent =
        "حدث خطأ أثناء رفع صورة المنتج";

    productFormMessage.style.color =
        "#e05265";

    saveProductButton.disabled = false;

    saveProductButton.textContent =
        editingProductId
            ? "حفظ التعديل"
            : "حفظ المنتج";

    return;
}

    let result;


    if (editingProductId) {

        result =
            await supabaseClient
                .from("products")
                .update({

    category: category,

    product_type: productType,

    type: type,

    company:
        compatibilityType === "device"
            ? company
            : null,

    model:
        compatibilityType === "device"
            ? model
            : null,

    color: color,

    quantity: quantity || 0,

    warehouse: warehouse,

    price: price || 0,

    compatibility_type:
        compatibilityType,

    compatible_devices:
        compatibleDevicesArray

})
                .eq("id", editingProductId)
                .select()
                .single();

    }

    else {

        result =
            await supabaseClient
                .from("products")
               .insert({

    category: category,

    product_type: productType,

    type: type,

    company:
        compatibilityType === "device"
            ? company
            : null,

    model:
        compatibilityType === "device"
            ? model
            : null,

    color: color,

    quantity: quantity || 0,

    warehouse: warehouse,

    price: price || 0,

    image: imageUrl,

    compatibility_type:
        compatibilityType,

    compatible_devices:
        compatibleDevicesArray

})
                .select()
                .single();

    }


    if (result.error) {

        console.error(result.error);

        productFormMessage.textContent =
            result.error.message;

        productFormMessage.style.color =
            "#e05265";

        saveProductButton.disabled = false;

        saveProductButton.textContent =
            editingProductId
                ? "حفظ التعديل"
                : "حفظ المنتج";

        return;
    }
/* =========================
   رفع صورة المنتج
========================= */

if (selectedProductImage) {

    await uploadProductImage(
        result.data.id,
        selectedProductImage
    );

}

    productFormMessage.textContent =
        editingProductId
            ? "تم تعديل المنتج بنجاح ✅"
            : "تمت إضافة المنتج بنجاح ✅";

    productFormMessage.style.color =
        "#2e9d69";


    editingProductId = null;

    clearProductForm();

    await loadAdminProducts();


    saveProductButton.disabled = false;

    saveProductButton.textContent =
        "حفظ المنتج";

}


let editingProductId = null;


/* تعديل المنتج */

async function editProduct(id) {

    const product =
        adminProductsData.find(
            item => item.id === id
        );


    if (!product) {

        alert("لم يتم العثور على المنتج");

        return;
    }


    editingProductId = id;


    document.getElementById("productCategory").value =
        product.category || "";

    document.getElementById("productProductType").value =
        product.product_type || "";

    document.getElementById("productType").value =
        product.type || "";

    document.getElementById("productCompany").value =
        product.company || "";

    document.getElementById("productModel").value =
        product.model || "";

    document.getElementById("productColor").value =
        product.color || "";

    document.getElementById("productQuantity").value =
        product.quantity ?? 0;

    document.getElementById("productWarehouse").value =
        product.warehouse || "الرياض";

    document.getElementById("productPrice").value =
        product.price ?? 0;


    productFormCard.style.display = "block";


    productFormCard.scrollIntoView({
        behavior: "smooth"
    });


    productFormMessage.textContent =
        "أنت الآن تعدل المنتج";

    productFormMessage.style.color =
        "var(--purple)";


    saveProductButton.textContent =
        "حفظ التعديل";

}


/* حذف المنتج */

async function deleteProduct(id) {

    const product =
        adminProductsData.find(
            item => item.id === id
        );


    if (!product) {

        alert("لم يتم العثور على المنتج");

        return;
    }


    const confirmed =
        confirm(
            `هل أنت متأكد من حذف المنتج؟\n\n${product.model || "هذا المنتج"}`
        );


    if (!confirmed) {

        return;
    }


    const { error } =
        await supabaseClient
            .from("products")
            .delete()
            .eq("id", id);


    if (error) {

        console.error(error);

        alert(
            "حدث خطأ أثناء حذف المنتج:\n" +
            error.message
        );

        return;
    }


    await loadAdminProducts();

    alert("تم حذف المنتج بنجاح ✅");

}






/* =========================================================
   إدارة التصنيفات + رفع الأيقونات
   ========================================================= */

const CATEGORY_BUCKET = "category-icons";


const categoriesButton =
    document.getElementById("categoriesButton");

const categoriesAdmin =
    document.getElementById("categoriesAdmin");

const backFromCategories =
    document.getElementById("backFromCategories");

const addCategoryButton =
    document.getElementById("addCategoryButton");

const categoryFormCard =
    document.getElementById("categoryFormCard");

const cancelCategoryButton =
    document.getElementById("cancelCategoryButton");

const saveCategoryButton =
    document.getElementById("saveCategoryButton");

const categoriesList =
    document.getElementById("categoriesList");

const categoryFormMessage =
    document.getElementById("categoryFormMessage");

const categoryIconFile =
    document.getElementById("categoryIconFile");

const categoryIconPreview =
    document.getElementById("categoryIconPreview");


let adminCategories = [];
let editingCategoryId = null;


/* =========================================================
   اختيار صورة الأيقونة
   ========================================================= */

categoryIconFile.addEventListener("change", function () {

    const file = this.files[0];

    if (!file) {
        categoryIconPreview.innerHTML =
            "<span>لم يتم اختيار أيقونة</span>";
        return;
    }


    const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/svg+xml"
    ];


    if (!allowedTypes.includes(file.type)) {

        alert(
            "نوع الصورة غير مدعوم.\n\n" +
            "المسموح: PNG / JPG / WEBP / SVG"
        );

        this.value = "";

        categoryIconPreview.innerHTML =
            "<span>لم يتم اختيار أيقونة</span>";

        return;
    }


    /* الحد الأقصى 2MB */

    if (file.size > 2 * 1024 * 1024) {

        alert(
            "حجم الصورة كبير جداً.\n\n" +
            "الحد الأقصى هو 2MB."
        );

        this.value = "";

        categoryIconPreview.innerHTML =
            "<span>لم يتم اختيار أيقونة</span>";

        return;
    }


    const previewURL =
        URL.createObjectURL(file);


    categoryIconPreview.innerHTML = `
        <img
            src="${previewURL}"
            alt="معاينة الأيقونة"
        >
    `;

});


/* =========================================================
   عرض أيقونة موجودة مسبقاً
   ========================================================= */

function showCategoryIcon(icon) {

    if (!icon) {

        categoryIconPreview.innerHTML =
            "<span>لم يتم اختيار أيقونة</span>";

        return;
    }


    /* إذا كانت صورة */

    if (
        typeof icon === "string" &&
        icon.startsWith("http")
    ) {

        categoryIconPreview.innerHTML = `
            <img
                src="${icon}"
                alt="أيقونة التصنيف"
            >
        `;

        return;
    }


    /* إذا كانت أيقونة قديمة عبارة عن إيموجي */

    categoryIconPreview.innerHTML = `
        <span style="
            font-size:45px;
        ">
            ${icon}
        </span>
    `;
}


/* =========================================================
   استخراج مسار الصورة من Supabase Storage
   ========================================================= */

function getStoragePathFromPublicUrl(url) {

    if (!url || typeof url !== "string") {
        return null;
    }


    const marker =
        `/storage/v1/object/public/${CATEGORY_BUCKET}/`;


    const index =
        url.indexOf(marker);


    if (index === -1) {
        return null;
    }


    return decodeURIComponent(
        url.substring(
            index + marker.length
        )
    );
}


/* =========================================================
   حذف صورة من Storage
   ========================================================= */

async function deleteCategoryIcon(iconUrl) {

    const path =
        getStoragePathFromPublicUrl(iconUrl);


    if (!path) {
        return;
    }


    const { error } =
        await supabaseClient
            .storage
            .from(CATEGORY_BUCKET)
            .remove([path]);


    if (error) {

        console.error(
            "خطأ في حذف الأيقونة القديمة:",
            error
        );
    }
}


/* =========================================================
   رفع صورة جديدة
   ========================================================= */

async function uploadCategoryIcon(file, categoryId) {

    if (!file) {
        return null;
    }


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    const safeExtension =
        extension.replace(
            /[^a-z0-9]/gi,
            ""
        ) || "png";


    const fileName =
        `${crypto.randomUUID()}.${safeExtension}`;


    const filePath =
        `${categoryId}/${fileName}`;


    const { error: uploadError } =
        await supabaseClient
            .storage
            .from(CATEGORY_BUCKET)
            .upload(
                filePath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type
                }
            );


    if (uploadError) {

        console.error(
            "خطأ في رفع الأيقونة:",
            uploadError
        );

        throw uploadError;
    }


    const {
        data: publicData
    } =
        supabaseClient
            .storage
            .from(CATEGORY_BUCKET)
            .getPublicUrl(filePath);


    if (!publicData?.publicUrl) {

        throw new Error(
            "لم يتم الحصول على رابط الأيقونة"
        );
    }


    return publicData.publicUrl;
}


/* =========================================================
   فتح التصنيفات
   ========================================================= */
categoriesButton.addEventListener("click", async function () {

    document.getElementById("adminPage").style.display = "none";
    document.getElementById("productsAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "block";

    await loadAdminCategories();

});


/* =========================================================
   الرجوع
   ========================================================= */
backFromCategories.addEventListener("click", function () {

    document.getElementById("categoriesAdmin").style.display = "none";

    document.getElementById("adminPage").style.display = "block";

});


/* =========================================================
   تحميل التصنيفات
   ========================================================= */

async function loadAdminCategories() {

    categoriesList.innerHTML = `
        <div class="message">
            جاري تحميل التصنيفات...
        </div>
    `;


    const {
        data,
        error
    } =
        await supabaseClient
            .from("categories")
            .select("*")
            .order("id", {
                ascending: true
            });


    if (error) {

        console.error(error);

        categoriesList.innerHTML = `
            <div class="message error">
                ${error.message}
            </div>
        `;

        return;
    }


    adminCategories =
        data || [];


    renderAdminCategories();

}


/* =========================================================
   عرض التصنيفات
   ========================================================= */

function renderAdminCategories() {

    categoriesList.innerHTML = "";


    if (!adminCategories.length) {

        categoriesList.innerHTML = `
            <div class="message">
                لا توجد تصنيفات
            </div>
        `;

        return;
    }


    adminCategories.forEach(category => {

        const item =
            document.createElement("div");


        item.className =
            "category-admin-item";


        let iconHTML =
            "📦";


        if (
            category.icon &&
            category.icon.startsWith("http")
        ) {

            iconHTML = `
                <img
                    src="${category.icon}"
                    alt="${category.name}"
                >
            `;

        }

        else if (category.icon) {

            iconHTML =
                category.icon;

        }


        item.innerHTML = `

            <div class="category-admin-icon">
                ${iconHTML}
            </div>


            <div class="category-admin-info">

                <h3>
                    ${category.name}
                </h3>

            </div>


            <div class="category-admin-actions">

                <button
                    class="edit-category"
                    onclick="editCategory(${category.id})"
                >
                    ✏️
                </button>


                <button
                    class="delete-category"
                    onclick="deleteCategory(${category.id})"
                >
                    🗑️
                </button>

            </div>

        `;


        categoriesList.appendChild(item);

    });

}


/* =========================================================
   إضافة تصنيف جديد
   ========================================================= */

addCategoryButton.addEventListener(
    "click",
    function () {

        editingCategoryId =
            null;


        document.getElementById(
            "categoryName"
        ).value = "";


        categoryIconFile.value =
            "";


        showCategoryIcon(
            null
        );


        saveCategoryButton.textContent =
            "حفظ التصنيف";


        categoryFormMessage.textContent =
            "";


        categoryFormCard.style.display =
            "block";

    }
);


/* =========================================================
   إلغاء
   ========================================================= */

cancelCategoryButton.addEventListener(
    "click",
    function () {

        categoryFormCard.style.display =
            "none";


        editingCategoryId =
            null;


        categoryIconFile.value =
            "";

    }
);


/* =========================================================
   حفظ
   ========================================================= */

saveCategoryButton.addEventListener(
    "click",
    saveCategory
);


async function saveCategory() {

    const name =
        document.getElementById(
            "categoryName"
        )
        .value
        .trim();


    const file =
        categoryIconFile.files[0] ||
        null;


    if (!name) {

        categoryFormMessage.textContent =
            "اكتب اسم التصنيف";


        categoryFormMessage.style.color =
            "#e05265";


        return;
    }


    saveCategoryButton.disabled =
        true;


    saveCategoryButton.textContent =
        "جاري الحفظ...";


    try {

        /* =================================================
           تعديل تصنيف
           ================================================= */

        if (editingCategoryId) {

            const oldCategory =
                adminCategories.find(
                    item =>
                        item.id ===
                        editingCategoryId
                );


            if (!oldCategory) {

                throw new Error(
                    "لم يتم العثور على التصنيف"
                );
            }


            let newIcon =
                oldCategory.icon ||
                null;


            /* إذا اختار المستخدم صورة جديدة */

            if (file) {

                newIcon =
                    await uploadCategoryIcon(
                        file,
                        editingCategoryId
                    );

            }


            const {
                error: updateError
            } =
                await supabaseClient
                    .from("categories")
                    .update({
                        name: name,
                        icon: newIcon
                    })
                    .eq(
                        "id",
                        editingCategoryId
                    );


            if (updateError) {

                /* إذا تم رفع الصورة ولكن فشل
                   تحديث قاعدة البيانات، نحذف
                   الصورة الجديدة */

                if (
                    file &&
                    newIcon
                ) {

                    await deleteCategoryIcon(
                        newIcon
                    );

                }


                throw updateError;
            }


            /* بعد نجاح تحديث قاعدة البيانات
               نحذف الصورة القديمة */

            if (
                file &&
                oldCategory.icon &&
                oldCategory.icon.startsWith("http")
            ) {

                await deleteCategoryIcon(
                    oldCategory.icon
                );

            }


            categoryFormMessage.textContent =
                "تم تعديل التصنيف بنجاح ✅";


            categoryFormMessage.style.color =
                "#2e9d69";

        }


        /* =================================================
           إضافة تصنيف جديد
           ================================================= */

        else {

            /* أولاً نضيف التصنيف */

            const {
                data: insertedCategory,
                error: insertError
            } =
                await supabaseClient
                    .from("categories")
                    .insert({
                        name: name,
                        icon: null
                    })
                    .select()
                    .single();


            if (insertError) {
                throw insertError;
            }


            let newIcon =
                null;


            /* إذا اختار المستخدم صورة */

            if (file) {

                newIcon =
                    await uploadCategoryIcon(
                        file,
                        insertedCategory.id
                    );


                /* حفظ رابط الصورة */

                const {
                    error: iconUpdateError
                } =
                    await supabaseClient
                        .from("categories")
                        .update({
                            icon: newIcon
                        })
                        .eq(
                            "id",
                            insertedCategory.id
                        );


                if (iconUpdateError) {

                    /* حذف الصورة إذا فشل
                       حفظ الرابط */

                    await deleteCategoryIcon(
                        newIcon
                    );


                    /* حذف التصنيف */

                    await supabaseClient
                        .from("categories")
                        .delete()
                        .eq(
                            "id",
                            insertedCategory.id
                        );


                    throw iconUpdateError;
                }

            }


            categoryFormMessage.textContent =
                "تمت إضافة التصنيف بنجاح ✅";


            categoryFormMessage.style.color =
                "#2e9d69";

        }


        editingCategoryId =
            null;


        categoryIconFile.value =
            "";


        categoryFormCard.style.display =
            "none";


        await loadAdminCategories();

    }

    catch (error) {

        console.error(
            "Category Save Error:",
            error
        );


        categoryFormMessage.textContent =
            error.message ||
            "حدث خطأ أثناء حفظ التصنيف";


        categoryFormMessage.style.color =
            "#e05265";

    }


    finally {

        saveCategoryButton.disabled =
            false;


        saveCategoryButton.textContent =
            "حفظ التصنيف";

    }

}


/* =========================================================
   تعديل التصنيف
   ========================================================= */

async function editCategory(id) {

    const category =
        adminCategories.find(
            item =>
                item.id === id
        );


    if (!category) {
        return;
    }


    editingCategoryId =
        id;


    document.getElementById(
        "categoryName"
    ).value =
        category.name || "";


    categoryIconFile.value =
        "";


    showCategoryIcon(
        category.icon
    );


    saveCategoryButton.textContent =
        "حفظ التعديل";


    categoryFormMessage.textContent =
        "";


    categoryFormCard.style.display =
        "block";


    categoryFormCard.scrollIntoView({
        behavior: "smooth"
    });

}


/* =========================================================
   حذف التصنيف + حذف الأيقونة
   ========================================================= */

async function deleteCategory(id) {

    const category =
        adminCategories.find(
            item =>
                item.id === id
        );


    if (!category) {
        return;
    }


    const confirmed =
        confirm(
            `هل أنت متأكد من حذف التصنيف؟\n\n${category.name}`
        );


    if (!confirmed) {
        return;
    }


    try {

        /* حذف التصنيف من قاعدة البيانات */

        const {
            error
        } =
            await supabaseClient
                .from("categories")
                .delete()
                .eq("id", id);


        if (error) {
            throw error;
        }


        /* حذف صورة الأيقونة من Storage */

        if (
            category.icon &&
            category.icon.startsWith("http")
        ) {

            await deleteCategoryIcon(
                category.icon
            );

        }


        await loadAdminCategories();


        alert(
            "تم حذف التصنيف والأيقونة بنجاح ✅"
        );

    }

    catch (error) {

        console.error(
            "Delete Category Error:",
            error
        );


        alert(
            "حدث خطأ أثناء حذف التصنيف:\n" +
            error.message
        );

    }

}








/* =========================================================
   إدارة الطلبات
========================================================= */

const ordersButton =
    document.getElementById("ordersButton");

const ordersAdmin =
    document.getElementById("ordersAdmin");

const backFromOrders =
    document.getElementById("backFromOrders");

const adminOrders =
    document.getElementById("adminOrders");

const adminOrderSearch = document.getElementById("adminOrderSearch");
const adminOrderStatusFilter = document.getElementById("adminOrderStatusFilter");
const refreshAdminOrders = document.getElementById("refreshAdminOrders");
const ordersSummary = document.getElementById("ordersSummary");
const driverWarehouseNumber = document.getElementById("driverWarehouseNumber");
const driverWarehouseSelect = document.getElementById("driverWarehouseSelect");
const driverWarehouseMessage = document.getElementById("driverWarehouseMessage");
let adminOrdersData = [];

async function assignDriverWarehouse() {
    const driverNumber = driverWarehouseNumber?.value.trim();
    const warehouse = driverWarehouseSelect?.value;

    if (!driverNumber || !warehouse) {
        driverWarehouseMessage.textContent = "أدخل رقم المندوب واختر المخزن.";
        return;
    }

    driverWarehouseMessage.textContent = "جاري الربط...";
    const { data, error } = await supabaseClient.rpc("assign_driver_warehouse", {
        p_driver_number: driverNumber,
        p_warehouse: warehouse
    });

    if (error) {
        console.error("Assign driver warehouse error:", error);
        driverWarehouseMessage.textContent = `تعذر الربط: ${error.message}`;
        return;
    }

    driverWarehouseMessage.textContent = `تم ربط ${data?.driver_name || "المندوب"} بمخزن ${warehouse} ونقل ${data?.orders_updated || 0} من طلباته الحالية.`;
    loadAdminOrders();
    loadDashboardData();
    loadDashboardLatestOrders();
}

function renderAdminOrdersList() {
    const search = (adminOrderSearch?.value || "").trim().toLowerCase();
    const status = adminOrderStatusFilter?.value || "";
    const filteredOrders = adminOrdersData.filter(order => {
        const searchable = [order.id, order.customer_name, order.customer_phone, order.driver_name, order.driver_number]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return (!search || searchable.includes(search)) && (!status || order.status === status);
    });

    adminOrders.innerHTML = "";
    if (!filteredOrders.length) {
        adminOrders.innerHTML = '<div class="message">لا توجد طلبات مطابقة للفلاتر الحالية.</div>';
        return;
    }

    filteredOrders.forEach(order => renderAdminOrder(order, order.items));
}

function updateOrdersSummary() {
    if (!ordersSummary) return;
    const activeOrders = adminOrdersData.filter(order => !["تم استلام طلبك", "ملغي"].includes(order.status || "جديد"));
    const total = adminOrdersData.reduce((sum, order) => sum + Number(order.total || 0), 0);
    ordersSummary.innerHTML = `<span><strong>${adminOrdersData.length}</strong> إجمالي الطلبات</span><span><strong>${activeOrders.length}</strong> قيد المتابعة</span><span><strong>${total.toFixed(2)}</strong> ر.س إجمالي المبيعات</span>`;
}

adminOrderSearch?.addEventListener("input", renderAdminOrdersList);
adminOrderStatusFilter?.addEventListener("change", renderAdminOrdersList);
refreshAdminOrders?.addEventListener("click", loadAdminOrders);
document.getElementById("saveDriverWarehouseButton")?.addEventListener("click", assignDriverWarehouse);

/* =========================================================
   فتح صفحة الطلبات
========================================================= */

ordersButton.addEventListener("click", async function () {

    // إخفاء الصفحة الرئيسية
    const adminPage = document.getElementById("adminPage");

    if (adminPage) {
        adminPage.style.display = "none";
    }

    // إخفاء المنتجات
    if (productsAdmin) {
        productsAdmin.style.display = "none";
    }

    // إخفاء التصنيفات
    if (categoriesAdmin) {
        categoriesAdmin.style.display = "none";
    }

    // إظهار الطلبات
    if (ordersAdmin) {
        ordersAdmin.style.display = "block";
    }

    // تحميل الطلبات
    await loadAdminOrders();

});


/* الرجوع */
backFromOrders.addEventListener("click", function () {

    document.getElementById("ordersAdmin").style.display = "none";

    document.getElementById("adminPage").style.display = "block";

});


/* تحميل الطلبات */

async function loadAdminOrders() {

    adminOrders.innerHTML = `
        <div class="message">
            جاري تحميل الطلبات...
        </div>
    `;


    const {
    data: orders,
    error
} = await supabaseClient
    .from("orders")
    .select(`
    id,
    status,
    customer_name,
    customer_phone,
    customer_lat,
    customer_lng,
    customer_location,
    total,
    created_at,
    user_id,
    driver_name,
    driver_number,
    warehouse
`)
    .eq("warehouse", selectedWarehouse)
    .order("id", {
        ascending: false
    });

    if (error) {

        console.error(error);

        adminOrders.innerHTML = `
            <div class="message error">
                حدث خطأ أثناء تحميل الطلبات:
                ${error.message}
            </div>
        `;

        return;
    }


    if (!orders || orders.length === 0) {

        adminOrdersData = [];
        updateOrdersSummary();

        adminOrders.innerHTML = `
            <div class="message">
                لا توجد طلبات حتى الآن 📋
            </div>
        `;

        return;
    }


    // نجلب عناصر كل الطلبات بطلب واحد بدلاً من طلب منفصل لكل بطاقة.
    const { data: allItems, error: itemsError } = await supabaseClient
        .from("order_items")
        .select("*")
        .in("order_id", orders.map(order => order.id))
        .order("id", { ascending: true });

    if (itemsError) {
        console.error(itemsError);
        adminOrders.innerHTML = '<div class="message error">حدث خطأ أثناء تحميل منتجات الطلبات.</div>';
        return;
    }

    const itemsByOrder = new Map();
    (allItems || []).forEach(item => {
        const items = itemsByOrder.get(item.order_id) || [];
        items.push(item);
        itemsByOrder.set(item.order_id, items);
    });

    adminOrdersData = orders.map(order => ({
        ...order,
        items: itemsByOrder.get(order.id) || []
    }));
    updateOrdersSummary();
    renderAdminOrdersList();

}


const dashboardOrdersButton =
    document.getElementById("dashboardOrdersButton");


if (dashboardOrdersButton) {

    dashboardOrdersButton.addEventListener(
        "click",
        function () {

            document.getElementById("adminPage").style.display =
                "none";

            document.getElementById("productsAdmin").style.display =
                "none";

            document.getElementById("categoriesAdmin").style.display =
                "none";

            document.getElementById("ordersAdmin").style.display =
                "block";

            loadAdminOrders();

        }
    );

}



/* =========================================================
   آخر الطلبات في الصفحة الرئيسية
========================================================= */

async function loadDashboardLatestOrders() {

    const container =
        document.getElementById("dashboardLatestOrders");

    if (!container) {
        console.error(
            "لم يتم العثور على dashboardLatestOrders"
        );
        return;
    }

    container.innerHTML = `
        <div class="dashboard-empty">
            جاري تحميل الطلبات...
        </div>
    `;

    try {

        const {
            data: orders,
            error
        } = await supabaseClient
            .from("orders")
            .select(`
                id,
                status,
                customer_name,
                customer_phone,
                total,
                created_at
            `)
            .eq("warehouse", selectedWarehouse)
            .order("id", {
                ascending: false
            })
            .limit(5);


        if (error) {

            console.error(
                "Dashboard Orders Error:",
                error
            );

            container.innerHTML = `
                <div class="dashboard-empty">
                    حدث خطأ أثناء تحميل الطلبات
                </div>
            `;

            return;
        }


        if (!orders || orders.length === 0) {

            container.innerHTML = `
                <div class="dashboard-empty">
                    لا توجد طلبات حتى الآن 📋
                </div>
            `;

            return;
        }


        container.innerHTML = "";


        orders.forEach(order => {

            const row =
                document.createElement("div");

            row.className =
                "dashboard-order-row";


            const status =
                order.status || "جديد";


            const total =
                Number(order.total || 0)
                    .toFixed(2);


            const customer =
                order.customer_name || "عميل";


            row.innerHTML = `

                <div class="dashboard-order-info">

                    <strong>
                        الطلب #${order.id}
                    </strong>

                    <span>
                        ${customer}
                    </span>

                </div>


                <div class="dashboard-order-price">

                    <strong>
                        ${total} ر.س
                    </strong>

                    <span class="dashboard-order-status">
                        ${status}
                    </span>

                </div>

            `;


            container.appendChild(row);

        });


    } catch (error) {

        console.error(
            "Dashboard Latest Orders Error:",
            error
        );

        container.innerHTML = `
            <div class="dashboard-empty">
                حدث خطأ أثناء تحميل الطلبات
            </div>
        `;

    }

}

/* عرض طلب واحد */

function renderAdminOrder(order, items = []) {


    const card =
        document.createElement("div");

    card.className =
        "admin-order-card";


    const date =
        new Date(order.created_at)
            .toLocaleString("ar-SA", {
                dateStyle: "medium",
                timeStyle: "short"
            });


    let productsHTML = "";


    (items || []).forEach(item => {

        const itemTotal =
            Number(item.price || 0) *
            Number(item.quantity || 1);


        productsHTML += `

            <div class="admin-order-item">

                <div class="admin-order-item-image">

                    ${
                        item.image
                        ?
                        `<img
                            src="${item.image}"
                            alt=""
                        >`
                        :
                        "📦"
                    }

                </div>


                <div class="admin-order-item-info">

                    <h4>
                        ${item.model || "بدون موديل"}
                    </h4>

                    <p>
                        ${item.company || ""}
                        ${
                            item.color
                            ? " • " + item.color
                            : ""
                        }
                    </p>

                    <span>
                        الكمية: ${item.quantity || 1}
                    </span>

                </div>


                <div class="admin-order-item-price">

                    ${itemTotal.toFixed(2)} ر.س

                </div>

            </div>

        `;

    });


    /* =========================
       إحصائيات الأنواع
    ========================= */

    /* =========================
   إحصائيات المنتجات حسب الكود
========================= */

const typeCodes = {};

(items || []).forEach(item => {

    const code =
        item.product_code?.trim() || "بدون كود";

    const quantity =
        Number(item.quantity || 1);

    typeCodes[code] =
        (typeCodes[code] || 0) + quantity;

});


let typeStatsHTML = "";

Object.entries(typeCodes).forEach(
    ([code, quantity]) => {

        typeStatsHTML += `
            <span class="type-stat">
                ${code}: ${quantity} قطعة
            </span>
        `;

    }
);


    card.innerHTML = `

        <div class="admin-order-top">

            <div>

                <span class="admin-order-number">
                    الطلب #${order.id}
                </span>

                <h3>
                    ${order.customer_name}
                </h3>

                <p>
                         📱 ${order.customer_phone}
                    </p>

                    <p>
    🚚 المندوب:
    <strong>
        ${order.driver_name || "غير محدد"}
    </strong>

    ${
        order.driver_number
        ? ` • رقم المندوب: ${order.driver_number}`
        : ""
    }
</p>

<p style="margin-top:8px;">
    📍 الموقع:

    ${
        order.customer_lat && order.customer_lng
        ?
        `
        <a
            href="https://www.google.com/maps?q=${order.customer_lat},${order.customer_lng}"
            target="_blank"
            style="
                display:inline-block;
                margin-top:5px;
                padding:7px 12px;
                background:#eeeaff;
                color:#6557ed;
                border-radius:10px;
                text-decoration:none;
                font-weight:800;
                font-size:12px;
            "
        >
            🗺️ فتح موقع العميل
        </a>
        `
        :
        `
        <span style="color:#999;">
            لم يتم تحديد الموقع
        </span>
        `
    }
</p>

                  </div>


          <div class="admin-order-date">

                ${date}

                <div style="display:flex; gap:8px; flex-wrap:wrap;">

    <button
        class="edit-order-button"
        onclick="editOrder(${order.id})"
    >
        ✏️ تعديل الطلب
    </button>

    <button
        class="print-order-button"
        onclick="printOrder(${order.id})"
    >
        🖨️ طباعة الطلب
    </button>

</div>

            </div>

        </div>


        <div class="admin-order-status">

            <span>
                الحالة:
            </span>


            <select
                class="order-status-select"
                onchange="updateOrderStatus(${order.id}, this.value)"
            >

                <option
                    value="جديد"
                    ${order.status === "جديد" ? "selected" : ""}
                >
                    جديد
                </option>


                <option
                    value="قيد التجهيز"
                    ${order.status === "قيد التجهيز" ? "selected" : ""}
                >
                    قيد التجهيز
                </option>


                <option
                    value="تم شحن الطلب"
                    ${order.status === "تم شحن الطلب" ? "selected" : ""}
                >
                    تم شحن الطلب
                </option>


                <option
                    value="تم استلام طلبك"
                    ${order.status === "تم استلام طلبك" ? "selected" : ""}
                >
                    تم استلام طلبك
                </option>


                <option
                    value="ملغي"
                    ${order.status === "ملغي" ? "selected" : ""}
                >
                    ملغي
                </option>

            </select>

            <select
                class="order-status-select"
                aria-label="نقل الطلب إلى مخزن آخر"
                onchange="moveOrderToWarehouse(${order.id}, this.value)"
            >
                <option value="الرياض" ${order.warehouse === "الرياض" ? "selected" : ""}>مخزن الرياض</option>
                <option value="جدة" ${order.warehouse === "جدة" ? "selected" : ""}>مخزن جدة</option>
            </select>

        </div>


        <div class="admin-order-items">

            ${productsHTML}

        </div>


        <div class="admin-order-bottom">

            <strong>
                الإجمالي
            </strong>

            <strong class="admin-order-total">
                ${Number(order.total || 0).toFixed(2)} ر.س
            </strong>

        </div>

    `;


    adminOrders.appendChild(card);

}


/* =========================
   تغيير حالة الطلب
========================= */
async function updateOrderStatus(orderId, newStatus) {

    try {

        // =========================
        // 1 - جلب الطلب
        // =========================

        const {
            data: order,
            error: orderError
        } = await supabaseClient
            .from("orders")
            .select("id, user_id, status")
            .eq("id", orderId)
            .single();


        if (orderError || !order) {

            console.error(orderError);

            alert("لم يتم العثور على الطلب");

            return;
        }


        // =========================
        // 2 - إذا نفس الحالة
        // =========================

        if (order.status === newStatus) {

            return;

        }


        // =========================
        // 3 - تحديث حالة الطلب
        // =========================

        const {
            error: updateError
        } = await supabaseClient
            .from("orders")
            .update({
                status: newStatus
            })
            .eq("id", orderId);


        if (updateError) {

            console.error(updateError);

            alert(
                "حدث خطأ أثناء تحديث حالة الطلب:\n" +
                updateError.message
            );

            return;
        }


        // =========================
        // 4 - إنشاء إشعار للمستخدم
        // =========================

        if (order.user_id) {

            const {
                error: notificationError
            } = await supabaseClient
                .from("notifications")
                .insert({

                    user_id: order.user_id,

                    order_id: order.id,

                    title: "تحديث حالة الطلب 🔔",

                    message:
                        `تم تحديث حالة طلبك #${order.id} إلى "${newStatus}"`

                });


            if (notificationError) {

                console.error(
                    "خطأ في إنشاء الإشعار:",
                    notificationError
                );

                alert(
                    "تم تحديث حالة الطلب، لكن حدث خطأ في إرسال الإشعار."
                );

                return;
            }

        }


        // =========================
        // 5 - نجاح
        // =========================

        alert(
            `تم تحديث الطلب #${order.id} إلى "${newStatus}" ✅`
        );


        // =========================
        // 6 - إعادة تحميل الطلبات في الإدارة
        // =========================

        await loadAdminOrders();


    }

    catch (error) {

        console.error(
            "Update Order Status Error:",
            error
        );

        alert(
            "حدث خطأ غير متوقع أثناء تحديث الطلب"
        );

    }

}

async function moveOrderToWarehouse(orderId, warehouse) {
    if (warehouse === selectedWarehouse) return;

    const { error } = await supabaseClient
        .from("orders")
        .update({ warehouse })
        .eq("id", orderId);

    if (error) {
        console.error("Move order warehouse error:", error);
        alert("تعذر نقل الطلب إلى المخزن المحدد: " + error.message);
        await loadAdminOrders();
        return;
    }

    await loadAdminOrders();
    loadDashboardData();
    loadDashboardLatestOrders();
}


/* =========================================================
   طباعة الطلب
========================================================= */

async function printOrder(orderId) {

    try {

        const {
            data: order,
            error: orderError
        } =
            await supabaseClient
                .from("orders")
                .select("*")
                .eq("id", orderId)
                .single();


        if (orderError || !order) {

            console.error(orderError);

            alert(
                "لم يتم العثور على الطلب"
            );

            return;
        }


        const {
            data: items,
            error: itemsError
        } =
            await supabaseClient
                .from("order_items")
                .select("*")
                .eq("order_id", orderId)
                .order("id", {
                    ascending: true
                });


        if (itemsError) {

            console.error(itemsError);

            alert(
                "حدث خطأ أثناء تحميل منتجات الطلب"
            );

            return;
        }


        const date =
            new Date(order.created_at)
                .toLocaleString(
                    "ar-SA",
                    {
                        dateStyle: "medium",
                        timeStyle: "short"
                    }
                );


        let rowsHTML = "";


        const typeCodes = {};

(items || []).forEach(item => {

    const code =
        item.product_code?.trim() ||
        "بدون كود";

    const quantity =
        Number(item.quantity || 1);

    typeCodes[code] =
        (typeCodes[code] || 0) + quantity;

});


let typeStatsHTML = "";

Object.entries(typeCodes).forEach(
    ([code, quantity]) => {

        typeStatsHTML += `
            <span class="type-stat">
                ${code}: ${quantity} قطعة
            </span>
        `;

    }
);


        (items || []).forEach(
            (item, index) => {

                const quantity =
                    Number(item.quantity || 1);


                const price =
                    Number(item.price || 0);


                const total =
                    quantity * price;


                rowsHTML += `

                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                             ${item.product_code || "-"}
                        </td>

                        <td>
                            ${item.category || "-"}
                        </td>

                        <td>
                            ${item.product_type || "-"}
                        </td>

                        <td>
                            ${item.type || "-"}
                        </td>

                        <td>
                            ${item.company || "-"}
                        </td>

                        <td>
                            ${item.model || "-"}
                        </td>

                        <td>
                            ${item.color || "-"}
                        </td>

                        <td>
                            ${quantity}
                        </td>

                        <td>
                            ${price.toFixed(2)} ر.س
                        </td>

                        <td>
                            ${total.toFixed(2)} ر.س
                        </td>

                    </tr>

                `;

            }
        );


        const printWindow =
            window.open(
                "",
                "_blank",
                "width=1200,height=800"
            );


        if (!printWindow) {

            alert(
                "المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى."
            );

            return;
        }


        printWindow.document.write(`

<!DOCTYPE html>

<html
    lang="ar"
    dir="rtl"
>

<head>

    <meta charset="UTF-8">

    <title>
        طلب #${order.id}
    </title>


    <style>

        * {
            box-sizing: border-box;
        }


        body {

            font-family:
                Arial,
                Tahoma,
                sans-serif;

            margin: 0;

            padding: 30px;

            background: white;

            color: #111;

        }


        .print-page {

            width: 100%;

            max-width: 1200px;

            margin: auto;

        }


        .header {

            display: flex;

            justify-content: space-between;

            align-items: flex-start;

            border-bottom: 2px solid #111;

            padding-bottom: 18px;

            margin-bottom: 20px;

        }


        .header h1 {

            margin: 0 0 8px;

            font-size: 25px;

        }


        .header p {

            margin: 4px 0;

            font-size: 13px;

        }


        .order-number {

            font-size: 22px;

            font-weight: bold;

        }


        .customer-info {

    display: grid;

    grid-template-columns:
        repeat(5, 1fr);

    border: 1px solid #111;

    margin-bottom: 20px;
}

        .customer-box {

            padding: 12px;

            border-left: 1px solid #111;

        }


        .customer-box:last-child {

            border-left: none;

        }


        .customer-label {

            display: block;

            font-size: 11px;

            color: #555;

            margin-bottom: 5px;

        }


        .customer-value {

            font-size: 14px;

            font-weight: bold;

        }


        table {

            width: 100%;

            border-collapse: collapse;

            table-layout: fixed;

            font-size: 11px;

        }


        th,
        td {

            border: 1px solid #111;

            padding: 9px 5px;

            text-align: center;

            vertical-align: middle;

            word-break: break-word;

        }


        th {

            background: #eeeeee;

            font-weight: bold;

        }


        tbody tr:nth-child(even) {

            background: #fafafa;

        }


        .total-section {

            margin-top: 20px;

            display: flex;

            justify-content: flex-end;

        }


        .total-box {

            border: 2px solid #111;

            min-width: 280px;

            display: flex;

            justify-content: space-between;

            padding: 14px 18px;

            font-size: 17px;

            font-weight: bold;

        }


        .type-stats {

            margin-top: 12px;

            display: flex;

            gap: 8px;

            flex-wrap: wrap;

            justify-content: flex-end;

        }


        .type-stat {

            border: 1px solid #111;

            padding: 5px 9px;

            font-size: 11px;

        }


        .footer {

            margin-top: 30px;

            padding-top: 12px;

            border-top: 1px solid #aaa;

            text-align: center;

            font-size: 11px;

            color: #555;

        }


        @media print {

            body {

                padding: 10px;

            }


            .print-page {

                max-width: none;

            }


            @page {

                size: A4 portrait;

                margin: 10mm;

            }


            th {

                background: #eeeeee !important;

                -webkit-print-color-adjust: exact;

                print-color-adjust: exact;

            }

        }

    </style>

</head>


<body>


<div class="print-page">


    <div class="header">

        <div>

            <h1>
               تحضير
            </h1>

            <p>
                رقم الطلب:
                <strong>
                    #${order.id}
                </strong>
            </p>

        </div>


        <div>

            <div class="order-number">
                طلب #${order.id}
            </div>

            <p>
                ${date}
            </p>

        </div>

    </div>


    <div class="customer-info">


        <div class="customer-box">

            <span class="customer-label">
                اسم العميل
            </span>

            <span class="customer-value">
                ${order.customer_name || "-"}
            </span>

        </div>


        <div class="customer-box">

            <span class="customer-label">
                رقم الجوال
            </span>

            <span class="customer-value">
                ${order.customer_phone || "-"}
            </span>

        </div>


        <div class="customer-box">

            <span class="customer-label">
                حالة الطلب
            </span>

            <span class="customer-value">
                ${order.status || "جديد"}
            </span>

                  </div>
                <div class="customer-box">

              <span class="customer-label">
                 المندوب
                 </span>

             <span class="customer-value">
             ${order.driver_name || "-"}
              ${
                 order.driver_number
            ? ` (${order.driver_number})`
              : ""
              }
             </span>

                </div>

        <div class="customer-box">

            <span class="customer-label">
                رقم الطلب
            </span>

            <span class="customer-value">
                #${order.id}
            </span>

        </div>


    </div>


    <table>

        <thead>

            <tr>

                <th>#</th>
                <th>
                     رقم المنتج
                </th>

                <th>
                    التصنيف
                </th>

                <th>
                    نوع المنتج
                </th>

                <th>
                    النوع
                </th>

                <th>
                    الشركة
                </th>

                <th>
                    الموديل
                </th>

                <th>
                    اللون
                </th>

                <th>
                    الكمية
                </th>

                <th>
                    السعر
                </th>

                <th>
                    الإجمالي
                </th>

            </tr>

        </thead>


        <tbody>

            ${rowsHTML}

        </tbody>

    </table>


    <div class="total-section">

        <div>

            <div class="total-box">

                <span>
                    إجمالي الطلب
                </span>

                <span>
                    ${Number(order.total || 0).toFixed(2)} ر.س
                </span>

            </div>


            <div class="type-stats">

                <strong>
                    إحصائيات الأنواع:
                </strong>

                ${typeStatsHTML}

            </div>

        </div>

    </div>


    <div class="footer">

        تم إنشاء هذا الكشف من لوحة إدارة المتجر

    </div>


</div>


<script>

    window.onload = function () {

        window.print();

    };

<\/script>


</body>

</html>

        `);


        printWindow.document.close();


    }

    catch (error) {

        console.error(error);

        alert(
            "حدث خطأ أثناء تجهيز الطلب للطباعة"
        );

    }

}


/* =========================================================
   تعديل الطلب
========================================================= */

let editingOrderId = null;
let editingOrderItems = [];


/* عناصر نافذة التعديل */

const editOrderModal =
    document.getElementById("editOrderModal");

const closeEditOrderButton =
    document.getElementById("closeEditOrderButton");

const cancelOrderEditButton =
    document.getElementById("cancelOrderEditButton");

const saveOrderEditButton =
    document.getElementById("saveOrderEditButton");

const addOrderItemButton =
    document.getElementById("addOrderItemButton");

const editOrderItems =
    document.getElementById("editOrderItems");

const editOrderTotal =
    document.getElementById("editOrderTotal");

const editOrderMessage =
    document.getElementById("editOrderMessage");


/* =========================================================
   فتح تعديل الطلب
========================================================= */

async function editOrder(orderId) {

    try {

        editOrderMessage.textContent = "";

        editingOrderId = orderId;


        /* =========================
           جلب الطلب
        ========================= */

        const {
            data: order,
            error: orderError
        } = await supabaseClient
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();


        if (orderError || !order) {

            console.error(orderError);

            alert("لم يتم العثور على الطلب");

            return;

        }


        /* =========================
           جلب منتجات الطلب
        ========================= */

        const {
            data: items,
            error: itemsError
        } = await supabaseClient
            .from("order_items")
            .select("*")
            .eq("order_id", orderId)
            .order("id", {
                ascending: true
            });


        if (itemsError) {

            console.error(itemsError);

            alert(
                "حدث خطأ أثناء تحميل منتجات الطلب:\n" +
                itemsError.message
            );

            return;

        }


        /* =========================
           بيانات العميل
        ========================= */

        document.getElementById(
            "editOrderNumber"
        ).textContent =
            `الطلب #${order.id}`;


        document.getElementById(
            "editOrderCustomerName"
        ).value =
            order.customer_name || "";


        document.getElementById(
            "editOrderCustomerPhone"
        ).value =
            order.customer_phone || "";


        document.getElementById(
            "editOrderDriverName"
        ).value =
            order.driver_name || "";


        document.getElementById(
            "editOrderDriverNumber"
        ).value =
            order.driver_number || "";


        /* =========================
           نسخ المنتجات
        ========================= */

        editingOrderItems =
            (items || []).map(item => ({
                ...item
            }));


        renderEditOrderItems();


        /* =========================
           فتح النافذة
        ========================= */

        editOrderModal.style.display =
            "flex";


        document.body.style.overflow =
            "hidden";

    }

    catch (error) {

        console.error(
            "Edit Order Error:",
            error
        );

        alert(
            "حدث خطأ أثناء فتح تعديل الطلب"
        );

    }

}


/* =========================================================
   عرض منتجات الطلب داخل النافذة
========================================================= */

function renderEditOrderItems() {

    editOrderItems.innerHTML = "";


    if (!editingOrderItems.length) {

        editOrderItems.innerHTML = `

            <div class="message">

                لا توجد منتجات في الطلب

            </div>

        `;

        calculateEditOrderTotal();

        return;

    }


    editingOrderItems.forEach(
        (item, index) => {

            const row =
                document.createElement("div");

            row.className =
                "edit-order-item";


            row.innerHTML = `

                <div class="edit-order-item-grid">

                    <div class="edit-order-item-field">

                        <label>
                            الموديل
                        </label>

                        <input
                            type="text"
                            value="${escapeHtmlAttribute(item.model || "")}"
                            onchange="changeEditOrderItem(${index}, 'model', this.value)"
                        >

                    </div>


                    <div class="edit-order-item-field">

                        <label>
                            اللون
                        </label>

                        <input
                            type="text"
                            value="${escapeHtmlAttribute(item.color || "")}"
                            onchange="changeEditOrderItem(${index}, 'color', this.value)"
                        >

                    </div>


                    <div class="edit-order-item-field">

                        <label>
                            الكمية
                        </label>

                        <input
                            type="number"
                            min="1"
                            value="${Number(item.quantity || 1)}"
                            onchange="changeEditOrderItem(${index}, 'quantity', this.value)"
                        >

                    </div>


                    <div class="edit-order-item-field">

                        <label>
                            السعر
                        </label>

                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value="${Number(item.price || 0)}"
                            onchange="changeEditOrderItem(${index}, 'price', this.value)"
                        >

                    </div>


                    <button
                        type="button"
                        class="remove-order-item"
                        onclick="removeEditOrderItem(${index})"
                    >
                        🗑️
                    </button>

                </div>

            `;


            editOrderItems.appendChild(row);

        }
    );


    calculateEditOrderTotal();

}


/* =========================================================
   تغيير بيانات منتج
========================================================= */

function changeEditOrderItem(
    index,
    field,
    value
) {

    if (!editingOrderItems[index]) {

        return;

    }


    if (
        field === "quantity"
    ) {

        value =
            Math.max(
                1,
                Number(value) || 1
            );

    }


    if (
        field === "price"
    ) {

        value =
            Math.max(
                0,
                Number(value) || 0
            );

    }


    editingOrderItems[index][field] =
        value;


    calculateEditOrderTotal();

}


/* =========================================================
   حذف منتج من الطلب
========================================================= */

function removeEditOrderItem(index) {

    if (!editingOrderItems[index]) {

        return;

    }


    const confirmed =
        confirm(
            "هل تريد حذف هذا المنتج من الطلب؟"
        );


    if (!confirmed) {

        return;

    }


    editingOrderItems.splice(
        index,
        1
    );


    renderEditOrderItems();

}


/* =========================================================
   حساب الإجمالي
========================================================= */

function calculateEditOrderTotal() {

    const total =
        editingOrderItems.reduce(
            (sum, item) => {

                const price =
                    Number(item.price || 0);

                const quantity =
                    Number(item.quantity || 1);

                return sum +
                    (price * quantity);

            },
            0
        );


    editOrderTotal.textContent =
        total.toFixed(2);


    return total;

}


/* =========================================================
   إضافة منتج جديد للطلب
========================================================= */



/* =========================================================
   حفظ تعديل الطلب
========================================================= */

saveOrderEditButton.addEventListener(
    "click",
    saveOrderEdit
);


async function saveOrderEdit() {

    if (!editingOrderId) {

        return;

    }


    try {

        saveOrderEditButton.disabled =
            true;

        saveOrderEditButton.textContent =
            "جاري الحفظ...";


        editOrderMessage.textContent = "";


        /* =========================
           بيانات العميل
        ========================= */

        const customerName =
            document.getElementById(
                "editOrderCustomerName"
            ).value.trim();


        const customerPhone =
            document.getElementById(
                "editOrderCustomerPhone"
            ).value.trim();


        const driverName =
            document.getElementById(
                "editOrderDriverName"
            ).value.trim();


        const driverNumber =
            document.getElementById(
                "editOrderDriverNumber"
            ).value.trim();

        let driverWarehouse = selectedWarehouse;
        if (driverNumber) {
            const { data: driver } = await supabaseClient
                .from("drivers")
                .select("warehouse")
                .eq("driver_number", driverNumber)
                .maybeSingle();
            driverWarehouse = driver?.warehouse || selectedWarehouse;
        }


        /* =========================
           حساب الإجمالي
        ========================= */

        const total =
            calculateEditOrderTotal();


        /* =========================
           تحديث الطلب
        ========================= */

        const {
            error: orderUpdateError
        } = await supabaseClient
            .from("orders")
            .update({

                customer_name:
                    customerName,

                customer_phone:
                    customerPhone,

                driver_name:
                    driverName,

                driver_number:
                    driverNumber,

                warehouse:
                    driverWarehouse,

                total:
                    total

            })
            .eq("id", editingOrderId);


        if (orderUpdateError) {

            throw orderUpdateError;

        }


        /* =========================
           تحديث المنتجات
        ========================= */

        const originalItems =
            editingOrderItems.filter(
                item => item.id
            );


        const currentIds =
            originalItems.map(
                item => item.id
            );


        /* =========================
           حذف المنتجات التي حذفها الأدمن
        ========================= */

        const {
            data: oldItems,
            error: oldItemsError
        } = await supabaseClient
            .from("order_items")
            .select("id")
            .eq("order_id", editingOrderId);


        if (oldItemsError) {

            throw oldItemsError;

        }


        const idsToDelete =
            (oldItems || [])
                .filter(
                    oldItem =>
                        !currentIds.includes(
                            oldItem.id
                        )
                )
                .map(
                    item => item.id
                );


        if (idsToDelete.length) {

            const {
                error: deleteError
            } = await supabaseClient
                .from("order_items")
                .delete()
                .in(
                    "id",
                    idsToDelete
                );


            if (deleteError) {

                throw deleteError;

            }

        }


        /* =========================
           تحديث المنتجات الموجودة
        ========================= */

        for (
            const item
            of originalItems
        ) {

            const {
                error: itemUpdateError
            } = await supabaseClient
                .from("order_items")
                .update({

                    product_code:
                        item.product_code || null,

                    category:
                        item.category || null,

                    product_type:
                        item.product_type || null,

                    type:
                        item.type || null,

                    company:
                        item.company || null,

                    model:
                        item.model || null,

                    color:
                        item.color || null,

                    quantity:
                        Math.max(
                            1,
                            Number(
                                item.quantity
                            ) || 1
                        ),

                    price:
                        Math.max(
                            0,
                            Number(
                                item.price
                            ) || 0
                        ),

                    image:
                        item.image || null

                })
                .eq(
                    "id",
                    item.id
                );


            if (itemUpdateError) {

                throw itemUpdateError;

            }

        }


        /* =========================
           إضافة المنتجات الجديدة
        ========================= */

        const newItems =
            editingOrderItems.filter(
                item => !item.id
            );


        if (newItems.length) {

            const insertData =
                newItems.map(item => ({

                    order_id:
                        editingOrderId,

                    product_id:
                       item.product_id,    

                    product_code:
                        item.product_code || null,

                    category:
                        item.category || null,

                    product_type:
                        item.product_type || null,

                    type:
                        item.type || null,

                    company:
                        item.company || null,

                    model:
                        item.model || null,

                    color:
                        item.color || null,

                    quantity:
                        Math.max(
                            1,
                            Number(
                                item.quantity
                            ) || 1
                        ),

                    price:
                        Math.max(
                            0,
                            Number(
                                item.price
                            ) || 0
                        ),

                    image:
                        item.image || null

                }));


            const {
                error: insertError
            } = await supabaseClient
                .from("order_items")
                .insert(
                    insertData
                );


            if (insertError) {

                throw insertError;

            }

        }


        /* =========================
           نجاح
        ========================= */

        editOrderMessage.textContent =
            "تم حفظ تعديل الطلب بنجاح ✅";

        editOrderMessage.style.color =
            "#2e9d69";


        setTimeout(
            async function () {

                closeEditOrder();

                await loadAdminOrders();

            },
            700
        );


    }

    catch (error) {

        console.error(
            "Save Order Edit Error:",
            error
        );


        editOrderMessage.textContent =
            "حدث خطأ أثناء حفظ التعديلات:\n" +
            error.message;

        editOrderMessage.style.color =
            "#e05265";

    }

    finally {

        saveOrderEditButton.disabled =
            false;

        saveOrderEditButton.textContent =
            "حفظ التعديلات";

    }

}


/* =========================================================
   إغلاق نافذة التعديل
========================================================= */

function closeEditOrder() {

    editOrderModal.style.display =
        "none";

    document.body.style.overflow =
        "";

    editingOrderId = null;

    editingOrderItems = [];

}


/* =========================================================
   أزرار الإغلاق
========================================================= */

closeEditOrderButton.addEventListener(
    "click",
    closeEditOrder
);


cancelOrderEditButton.addEventListener(
    "click",
    closeEditOrder
);


/* إغلاق عند الضغط خارج النافذة */

editOrderModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target ===
            editOrderModal
        ) {

            closeEditOrder();

        }

    }
);


/* =========================================================
   حماية النصوص داخل value=""
========================================================= */

function escapeHtmlAttribute(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}



/* =========================================================
   اختيار منتج لإضافته إلى الطلب
========================================================= */
addOrderItemButton.addEventListener("click", async function () {

    addOrderItemButton.disabled = true;
    addOrderItemButton.textContent = "جاري تحميل المنتجات...";

    try {

        const { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("id", { ascending: false })
            .limit(1000);

        if (error) {

            console.error("PRODUCT LOAD ERROR:", error);

            alert(
                "خطأ في تحميل المنتجات:\n\n" +
                error.message
            );

            return;
        }

        console.log(
            "منتجات الإضافة:",
            data
        );

        if (!data || data.length === 0) {

            alert("لم يتم العثور على منتجات");

            return;
        }

        showOrderProductList(data);

    }

    catch (error) {

        console.error(
            "ADD PRODUCT ERROR:",
            error
        );

        alert(
            "حدث خطأ:\n\n" +
            error.message
        );

    }

    finally {

        addOrderItemButton.disabled = false;

        addOrderItemButton.textContent =
            "+ إضافة منتج";

    }

});


function showOrderProductList(products) {

    const oldPicker =
        document.getElementById("orderProductPicker");

    if (oldPicker) {
        oldPicker.remove();
    }


    const picker =
        document.createElement("div");

    picker.id =
        "orderProductPicker";

    picker.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0,0,0,.55);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;


    picker.innerHTML = `

        <div style="
            background:white;
            width:100%;
            max-width:700px;
            max-height:85vh;
            overflow:hidden;
            border-radius:20px;
            padding:20px;
        ">

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:15px;
            ">

                <h3 style="margin:0;">
                    اختر المنتج
                </h3>

                <button
                    type="button"
                    onclick="closeOrderProductPicker()"
                    style="
                        border:none;
                        background:#eee;
                        border-radius:10px;
                        width:38px;
                        height:38px;
                        cursor:pointer;
                    "
                >
                    ✕
                </button>

            </div>


            <input
                id="orderProductSearch"
                type="text"
                placeholder="ابحث عن موديل أو شركة..."
                style="
                    width:100%;
                    box-sizing:border-box;
                    padding:13px;
                    border:1px solid #ddd;
                    border-radius:12px;
                    margin-bottom:15px;
                    font-family:inherit;
                "
            >


            <div
                id="orderProductList"
                style="
                    max-height:60vh;
                    overflow-y:auto;
                "
            ></div>

        </div>
    `;


    document.body.appendChild(picker);


    renderOrderProductList(products);


    document
        .getElementById("orderProductSearch")
        .addEventListener("input", function () {

            const search =
                this.value
                    .trim()
                    .toLowerCase();


            const filtered =
                products.filter(product => {

                    const text = `
                        ${product.model || ""}
                        ${product.company || ""}
                        ${product.product_code || ""}
                        ${product.category || ""}
                        ${product.product_type || ""}
                        ${product.type || ""}
                    `.toLowerCase();


                    return text.includes(search);

                });


            renderOrderProductList(filtered);

        });

}

function renderOrderProductList(products) {

    const list =
        document.getElementById(
            "orderProductList"
        );

    if (!list) return;

    list.innerHTML = "";


    products.forEach(product => {

        const button =
            document.createElement("button");

        button.type = "button";

        button.style.cssText = `
            width:100%;
            display:flex;
            align-items:center;
            gap:12px;
            padding:12px;
            margin-bottom:8px;
            border:1px solid #eee;
            border-radius:12px;
            background:white;
            cursor:pointer;
            text-align:right;
            font-family:inherit;
        `;


        button.innerHTML = `

            <div style="
                width:55px;
                height:55px;
                border-radius:10px;
                overflow:hidden;
                background:#f3f3f3;
                display:flex;
                align-items:center;
                justify-content:center;
                flex-shrink:0;
            ">

                ${
                    product.image
                    ?
                    `<img
                        src="${escapeHtmlAttribute(product.image)}"
                        style="
                            width:100%;
                            height:100%;
                            object-fit:cover;
                        "
                    >`
                    :
                    "📦"
                }

            </div>


            <div>

                <strong>
                    ${escapeHtmlAttribute(
                        product.model ||
                        "بدون موديل"
                    )}
                </strong>

                <div style="
                    color:#777;
                    font-size:12px;
                    margin-top:4px;
                ">

                    ${escapeHtmlAttribute(
                        product.company || ""
                    )}

                    ${
                        product.color
                        ?
                        " • " +
                        escapeHtmlAttribute(
                            product.color
                        )
                        :
                        ""
                    }

                </div>


                <div style="
                    color:#6557ed;
                    font-size:12px;
                    margin-top:4px;
                ">

                    ${Number(
                        product.price || 0
                    ).toFixed(2)} ر.س

                </div>

            </div>

        `;


        button.addEventListener(
            "click",
            function () {

                addProductToCurrentOrder(
                    product
                );

            }
        );


        list.appendChild(button);

    });

}



function addProductToCurrentOrder(product) {

    if (!product || !product.id) {

        alert(
            "المنتج لا يحتوي على رقم product_id"
        );

        return;

    }


    editingOrderItems.push({

        id: null,

        order_id:
            editingOrderId,

        product_id:
            product.id,

        product_code:
            product.product_code || null,

        category:
            product.category || null,

        product_type:
            product.product_type || null,

        type:
            product.type || null,

        company:
            product.company || null,

        model:
            product.model || null,

        color:
            product.color || null,

        quantity: 1,

        price:
            Number(product.price || 0),

        image:
            product.image || null

    });


    closeOrderProductPicker();

    renderEditOrderItems();

}
function closeOrderProductPicker() {

    const picker =
        document.getElementById(
            "orderProductPicker"
        );

    if (picker) {
        picker.remove();
    }

}

/* =========================================================
   توافق المنتج
========================================================= */

const productCompatibilityType =
    document.getElementById(
        "productCompatibilityType"
    );

const productCompanyGroup =
    document.getElementById(
        "productCompanyGroup"
    );

const productModelGroup =
    document.getElementById(
        "productModelGroup"
    );

const compatibleDevicesGroup =
    document.getElementById(
        "compatibleDevicesGroup"
    );

const compatibleDevices =
    document.getElementById(
        "compatibleDevices"
    );


function updateProductCompatibilityFields() {

    if (!productCompatibilityType) {
        return;
    }

    const type =
        productCompatibilityType.value;


    /* =========================
       منتج عام
    ========================= */

    if (type === "general") {

        productCompanyGroup.style.display =
            "none";

        productModelGroup.style.display =
            "none";

        compatibleDevicesGroup.style.display =
            "none";

        document.getElementById(
            "productCompany"
        ).value = "";

        document.getElementById(
            "productModel"
        ).value = "";

        compatibleDevices.value = "";

    }


    /* =========================
       منتج مخصص لجهاز
    ========================= */

    else if (type === "device") {

        productCompanyGroup.style.display =
            "block";

        productModelGroup.style.display =
            "block";

        compatibleDevicesGroup.style.display =
            "none";

        compatibleDevices.value = "";

    }


    /* =========================
       عدة أجهزة
    ========================= */

    else if (type === "multi") {

        productCompanyGroup.style.display =
            "none";

        productModelGroup.style.display =
            "none";

        compatibleDevicesGroup.style.display =
            "block";

        document.getElementById(
            "productCompany"
        ).value = "";

        document.getElementById(
            "productModel"
        ).value = "";

    }

}


if (productCompatibilityType) {

    productCompatibilityType.addEventListener(
        "change",
        updateProductCompatibilityFields
    );

}
