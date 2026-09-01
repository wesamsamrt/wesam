const loginPage = document.getElementById("loginPage");
const adminPage = document.getElementById("adminPage");

const adminCode = document.getElementById("adminCode");
const adminEmail = document.getElementById("adminEmail");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

const logoutButton = document.getElementById("logoutButton");
const warehouseLoginPage = document.getElementById("warehouseLoginPage");
let selectedWarehouse = null;
let warehouses = [];
let warehouseOptions = [];
let currentTeamAccess = null;
let warehouseNotificationsChannel = null;

// يخزن إشعارات الطلبات التي تم تحميلها لعرضها واحتساب شارة الجرس.
let adminOrderNotificationsCache = [];

// يحدّث الرقم الصغير فوق جرس الإدارة بعد تغيير إشعارات المخزن.
function refreshAdminOrderNotificationBadge() {
    const badge = document.getElementById("adminOrderNotificationsBadge");
    if (!badge) return;
    const count = adminOrderNotificationsCache.length;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = count ? "grid" : "none";
}

// يجلب إشعارات الطلبات الحالية، ويقصرها على المخزن المفتوح وصلاحيات الحساب.
async function loadAdminOrderNotifications() {
    if (!selectedWarehouse) return [];

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user?.id) return [];

    const [{ data: notices, error: noticesError }, { data: warehouseOrders, error: ordersError }] = await Promise.all([
        supabaseClient.from("notifications").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(50),
        supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse })
    ]);

    const orders = Array.isArray(warehouseOrders) ? warehouseOrders : [];
    const ordersById = new Map(orders.map(order => [String(order.id), order]));
    const savedNotices = noticesError ? [] : (notices || [])
        .filter(notice => notice.order_id && ordersById.has(String(notice.order_id)))
        .map(notice => ({
            id: notice.id,
            orderId: notice.order_id,
            title: notice.title || "إشعار طلب",
            message: notice.message || "لديك طلب يحتاج متابعة.",
            createdAt: notice.created_at
        }));

    // في حال لم تُشغّل قاعدة بيانات الإشعارات بعد، نبقي الجرس مفيدًا بعرض الطلبات المقدمة حديثًا.
    const fallback = savedNotices.length ? [] : orders
        .filter(order => ["مقدم", "قيد التجهيز"].includes(order.status || ""))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20)
        .map(order => ({
            id: `order-${order.id}`,
            orderId: order.id,
            title: "طلب يحتاج متابعة 🔔",
            message: `الطلب #${order.id} · ${order.customer_name || "عميل"} · الحالة: ${order.status}`,
            createdAt: order.created_at
        }));

    if (ordersError) console.warn("تعذر تحميل طلبات الإشعارات:", ordersError);
    if (noticesError) console.warn("تعذر تحميل سجل الإشعارات، سيتم عرض الطلبات الحديثة:", noticesError);
    adminOrderNotificationsCache = savedNotices.length ? savedNotices : fallback;
    refreshAdminOrderNotificationBadge();
    return adminOrderNotificationsCache;
}

// يرسم نافذة إشعارات الطلبات ويتيح فتح الطلب المرتبط منها.
async function openAdminOrderNotifications() {
    const modal = document.getElementById("adminOrderNotificationsModal");
    const list = document.getElementById("adminOrderNotificationsList");
    const warehouseLabel = document.getElementById("adminOrderNotificationsWarehouse");
    if (!modal || !list) return;

    modal.style.display = "grid";
    if (warehouseLabel) warehouseLabel.textContent = `المخزن: ${selectedWarehouse || "—"}`;
    list.innerHTML = '<div class="admin-order-notifications-empty">جاري تحميل إشعارات الطلبات...</div>';
    const notices = await loadAdminOrderNotifications();
    list.innerHTML = notices.length ? notices.map(notice => `
        <button type="button" class="admin-order-notification-item" data-order-id="${transferText(notice.orderId)}">
            <span class="admin-order-notification-icon">🔔</span>
            <span><strong>${transferText(notice.title)}</strong><span>${transferText(notice.message)}<br>${notice.createdAt ? new Date(notice.createdAt).toLocaleString("ar-SA") : ""}</span></span>
        </button>
    `).join("") : '<div class="admin-order-notifications-empty">لا توجد إشعارات طلبات لهذا المخزن حاليًا.</div>';

    list.querySelectorAll("[data-order-id]").forEach(button => button.addEventListener("click", async () => {
        modal.style.display = "none";
        ordersButton?.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const search = document.getElementById("adminOrderSearch");
        if (search) {
            search.value = button.dataset.orderId;
            renderAdminOrdersList();
        }
    }));
}

// يغلق نافذة إشعارات الطلبات دون تغيير حالة الصفحة الحالية.
function closeAdminOrderNotifications() {
    const modal = document.getElementById("adminOrderNotificationsModal");
    if (modal) modal.style.display = "none";
}

document.getElementById("adminOrderNotificationsButton")?.addEventListener("click", openAdminOrderNotifications);
document.getElementById("closeAdminOrderNotifications")?.addEventListener("click", closeAdminOrderNotifications);
document.getElementById("adminOrderNotificationsModal")?.addEventListener("click", event => {
    if (event.target.id === "adminOrderNotificationsModal") closeAdminOrderNotifications();
});

// يسجل عامل الخدمة ويستمع فوراً لإشعارات الطلبات الخاصة بالحساب الحالي.
async function setupWarehouseOrderNotifications() {
    try {
        const canShowSystemNotification = "Notification" in window && "serviceWorker" in navigator;
        if (canShowSystemNotification) await navigator.serviceWorker.register("./service-worker.js");
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user?.id || warehouseNotificationsChannel) return;

        warehouseNotificationsChannel = supabaseClient
            .channel(`warehouse-order-notifications-${session.user.id}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `user_id=eq.${session.user.id}`
            }, async payload => {
                const notice = payload.new;
                adminOrderNotificationsCache.unshift({
                    id: notice.id,
                    orderId: notice.order_id,
                    title: notice.title || "طلب جديد 🔔",
                    message: notice.message || "لديك طلب جديد يحتاج متابعة.",
                    createdAt: notice.created_at
                });
                refreshAdminOrderNotificationBadge();

                // لا نعرض تنبيهاً نظامياً عندما تكون لوحة الإدارة أمام المستخدم بالفعل.
                if (!canShowSystemNotification || !document.hidden || Notification.permission !== "granted") return;
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(notice.title || "طلب جديد 🔔", {
                    body: notice.message || "لديك طلب جديد يحتاج متابعة.",
                    tag: `warehouse-order-${notice.order_id || notice.id}`,
                    renotify: true,
                    data: { url: "./admin.html" }
                });
            })
            .subscribe();
    } catch (error) {
        console.warn("تعذر تفعيل إشعارات الطلبات:", error);
    }
}

// يطلب إذن إشعارات المتصفح من الموظف ثم يبدأ استقبال تنبيهات مخزنه.
async function enableWarehouseOrderNotifications() {
    if (!("Notification" in window)) {
        alert("هذا المتصفح لا يدعم إشعارات النظام.");
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        alert("لم يتم السماح بالإشعارات. فعّلها من إعدادات المتصفح لاحقًا.");
        return;
    }
    await setupWarehouseOrderNotifications();
    alert("تم تفعيل إشعارات الطلبات لهذا المتصفح.");
}

// يطبق صلاحيات الأقسام المحفوظة على عناصر التنقل في لوحة الإدارة.
function applyTeamAccessToInterface() {
    if (!currentTeamAccess?.is_active) return;
    const allowedSections = currentTeamAccess.permissions?.sections || [];
    const isOwner = currentTeamAccess.role === "owner";
    const sectionButtons = {
        dashboardButton: "dashboard",
        productsButton: "products",
        ordersButton: "orders",
        salesButton: "sales",
        offersButton: "offers",
        driversButton: "drivers",
        transfersButton: "transfers",
        accountsButton: "accounts"
    };
    Object.entries(sectionButtons).forEach(([id, section]) => {
        const button = document.getElementById(id);
        if (button) button.style.display = isOwner || allowedSections.includes(section) ? "" : "none";
    });
}

// يرجع أسماء المخازن المسموح للحساب الحالي برؤيتها؛ المدير العام يرى الجميع.
function getPermittedWarehouseNames() {
    if (currentTeamAccess?.role === "owner") return null;
    const permitted = currentTeamAccess?.permissions?.warehouses;
    return Array.isArray(permitted) && permitted.length ? permitted : null;
}

// يتحقق أن المخزن مطلوب العرض داخل نطاق صلاحية الحساب الحالي.
function canAccessWarehouse(warehouseName) {
    const permitted = getPermittedWarehouseNames();
    return !permitted || permitted.includes(warehouseName);
}

// ينشئ خيارات HTML لقوائم اختيار المخازن ويحدد المخزن المختار عند الحاجة.
function warehouseOptionsHtml(selected = "") {
    return warehouses.map(warehouse => `<option value="${transferText(warehouse.name)}" ${warehouse.name === selected ? "selected" : ""}>مخزن ${transferText(warehouse.name)}</option>`).join("");
}

// يحدّث جميع عناصر واجهة المخازن: شاشة الاختيار، التبويبات، وقوائم المنتجات والمناديب والتحويلات.
function renderWarehouseControls() {
    const choices = document.getElementById("warehouseChoiceList");
    if (choices) {
        choices.innerHTML = warehouses.length ? warehouses.map(warehouse => `<button type="button" class="warehouse-login-option" data-warehouse-choice="${transferText(warehouse.name)}"><strong>مخزن ${transferText(warehouse.name)}</strong><span>فتح لوحة الإدارة والمخزون</span></button>`).join("") : "لا توجد مخازن بعد.";
        choices.querySelectorAll("[data-warehouse-choice]").forEach(button => button.addEventListener("click", () => { selectWarehouse(button.dataset.warehouseChoice); showAdmin(); }));
    }
    // إنشاء المخازن متاح للمدير العام فقط حتى لا يوسّع الموظف نطاق عمله بنفسه.
    const addWarehouseBox = document.querySelector(".add-warehouse-box");
    const warehouseAddMessage = document.getElementById("warehouseAddMessage");
    const canManageWarehouses = currentTeamAccess?.role === "owner";
    if (addWarehouseBox) addWarehouseBox.style.display = canManageWarehouses ? "" : "none";
    if (warehouseAddMessage && !canManageWarehouses) warehouseAddMessage.textContent = "";
    const productWarehouse = document.getElementById("productWarehouse");
    const driverWarehouse = document.getElementById("driverWarehouseSelect");
    const source = document.getElementById("transferSourceWarehouse");
    const destination = document.getElementById("transferDestinationWarehouse");
    if (productWarehouse) productWarehouse.innerHTML = warehouseOptionsHtml(selectedWarehouse);
    if (driverWarehouse) driverWarehouse.innerHTML = warehouseOptionsHtml(selectedWarehouse);
    if (source) source.innerHTML = warehouseOptionsHtml(source.value);
    if (destination) destination.innerHTML = warehouseOptionsHtml(destination.value);

    const tabs = document.getElementById("productWarehouseTabs");
    if (tabs) {
        tabs.innerHTML = warehouses.map(warehouse => `<button type="button" class="warehouse-option ${warehouse.name === selectedWarehouse ? "active" : ""}" data-warehouse="${transferText(warehouse.name)}">مخزن ${transferText(warehouse.name)}</button>`).join("");
        warehouseOptions = [...tabs.querySelectorAll(".warehouse-option")];
        warehouseOptions.forEach(button => button.addEventListener("click", () => {
            selectWarehouse(button.dataset.warehouse);
            adminProductSearch.value = "";
            adminProductSearch.placeholder = `ابحث في منتجات مخزن ${selectedWarehouse}...`;
            if (productsAdmin?.style.display !== "none") loadAdminProducts();
            loadDashboardData();
            loadDashboardLatestOrders();
        }));
    }
}

// يجلب قائمة المخازن المسجلة من قاعدة البيانات ثم يعرضها في الواجهة.
async function loadWarehouses() {
    const choices = document.getElementById("warehouseChoiceList");
    const { data, error } = await supabaseClient.from("warehouses").select("id, name").order("name");
    if (error) {
        if (choices) choices.innerHTML = `<div class="message error">تعذر تحميل المخازن: ${transferText(error.message)}</div>`;
        return;
    }
    // لا نضع في الواجهة إلا المخازن المحددة للحساب، أما عدم تحديد مخزن فيعني جميع المخازن.
    warehouses = (data || []).filter(warehouse => canAccessWarehouse(warehouse.name));

    if (selectedWarehouse && !canAccessWarehouse(selectedWarehouse)) {
        selectedWarehouse = null;
    }
    renderWarehouseControls();
}

// يخفي صفحات الإدارة ويعرض شاشة اختيار المخزن بعد التحقق من دخول المدير.
function showWarehouseSelection() {
    loginPage.style.display = "none";
    adminPage.style.display = "none";
    warehouseLoginPage.style.display = "flex";
    loadWarehouses();
}

// يعرض اسم المخزن الحالي في القائمة الجانبية وفي عنوان لوحة التحكم.
function updateWarehouseLabel() {
    const label = document.getElementById("selectedWarehouseLabel");
    if (label) label.textContent = selectedWarehouse ? `مخزن ${selectedWarehouse}` : "—";
    const dashboardName = document.getElementById("dashboardWarehouseName");
    if (dashboardName) dashboardName.textContent = selectedWarehouse ? `مخزن ${selectedWarehouse}` : "وسام سمارت";
}

// يحفظ المخزن المختار ويحدّث عناصر الواجهة المرتبطة به.
function selectWarehouse(warehouse) {
    if (!canAccessWarehouse(warehouse)) {
        console.warn("محاولة فتح مخزن خارج صلاحيات الحساب:", warehouse);
        return;
    }
    selectedWarehouse = warehouse;
    warehouseOptions?.forEach(option =>
        option.classList.toggle("active", option.dataset.warehouse === warehouse)
    );
    updateWarehouseLabel();
    renderWarehouseControls();
}


/* =========================
   إظهار لوحة الإدارة
========================= */
// يفتح لوحة الإدارة للمخزن المحدد ويبدأ تحميل بياناتها.
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
    const accountsPage = document.getElementById("accountsAdmin");
    if (accountsPage) accountsPage.style.display = "none";
    const salesPage = document.getElementById("salesAdmin");
    if (salesPage) salesPage.style.display = "none";
    const driversPage = document.getElementById("driversAdmin");
    if (driversPage) driversPage.style.display = "none";

    if (adminPage) {
        adminPage.style.display = "block";
    }
    // تبقى لوحة التحكم الأساسية مستقلة عن أي إضافات إحصائية.
    // بهذا لا يمنع خطأ في تقرير أو تنبيه بقية عناصر الإدارة من العمل.
    updateWarehouseLabel();
    applyTeamAccessToInterface();
    setupWarehouseOrderNotifications();
    loadAdminOrderNotifications();
    loadDashboardLatestOrders();
    setTimeout(() => loadDashboardData(), 0);

}


/* =========================
   إظهار تسجيل الدخول
========================= */
// يعيد المستخدم إلى شاشة تسجيل الدخول ويخفي صفحات الإدارة والمخازن.
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

// يتحقق من أن المستخدم الحالي لديه حساب إدارة نشط وصلاحيات مفعّلة.
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


    if (!data) return false;

    const { data: access, error: accessError } = await supabaseClient.rpc("get_my_team_access");

    if (accessError || !access) {
        console.error("Team access check error:", accessError);
        currentTeamAccess = null;
        return false;
    }

    currentTeamAccess = access;
    return !!access.is_active;

}


/* =========================
   تسجيل الدخول للإدارة
========================= */

// يسجّل دخول المدير بكلمة المرور ثم ينقله إلى اختيار المخزن.
async function login() {

    const password = adminCode.value.trim();
    const email = adminEmail.value.trim().toLowerCase();

    if (!email || !password) {

        loginMessage.textContent =
            "اكتب البريد الإلكتروني وكلمة المرور";

        loginMessage.style.color =
            "#e05265";

        return;

    }


    loginButton.disabled = true;

    loginButton.textContent =
        "جاري التحقق...";


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

// ينهي جلسة المدير الحالية ويمسح المخزن المختار من الذاكرة.
async function logout() {

    await supabaseClient.auth.signOut();

    if (warehouseNotificationsChannel) {
        await supabaseClient.removeChannel(warehouseNotificationsChannel);
        warehouseNotificationsChannel = null;
    }

    showLogin();

    selectedWarehouse = null;
    currentTeamAccess = null;

    adminEmail.value = "";
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

document.getElementById("enableWarehouseNotifications")?.addEventListener("click", enableWarehouseOrderNotifications);

// يتيح تسجيل الدخول من حقل البريد عند الضغط على Enter.
adminEmail?.addEventListener("keydown", function(event) {
    if (event.key === "Enter") login();
});

document.getElementById("addWarehouseButton")?.addEventListener("click", async () => {
    const nameInput = document.getElementById("newWarehouseName");
    const message = document.getElementById("warehouseAddMessage");
    const name = nameInput.value.trim();
    if (!name) { message.textContent = "اكتب اسم المخزن أولًا."; return; }
    message.textContent = "جاري إضافة المخزن وتجهيز أصنافه...";
    const { data, error } = await supabaseClient.rpc("add_warehouse", { p_name: name });
    if (error) { message.textContent = `تعذر إضافة المخزن: ${error.message}`; return; }
    nameInput.value = "";
    message.textContent = `تمت إضافة مخزن ${data?.name || name} بنجاح.`;
    await loadWarehouses();
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
const transferSearchResults = document.getElementById("transferSearchResults");
const transferSelectedProduct = document.getElementById("transferSelectedProduct");
const transferVariantModal = document.getElementById("transferVariantModal");
const transferVariantCode = document.getElementById("transferVariantCode");
const transferVariantName = document.getElementById("transferVariantName");
const transferVariantModel = document.getElementById("transferVariantModel");
const transferVariantColor = document.getElementById("transferVariantColor");
const transferVariantStock = document.getElementById("transferVariantStock");
const transferQuantity = document.getElementById("transferQuantity");
const transferNotes = document.getElementById("transferNotes");
const transferDraftItems = document.getElementById("transferDraftItems");
const transferFormMessage = document.getElementById("transferFormMessage");
const transfersList = document.getElementById("transfersList");
let transferSourceProducts = [];
let transferDraft = [];
let transferMode = "request";
let transfersCache = [];
let selectedTransferProductId = null;
let selectedTransferProductGroup = [];

const transferText = value => String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

// يعرض رسالة نجاح أو خطأ أسفل نموذج إنشاء التحويل.
function setTransferMessage(message, error = false) {
    if (!transferFormMessage) return;
    transferFormMessage.textContent = message;
    transferFormMessage.style.color = error ? "#c14359" : "#2e9d69";
}

// يعرض المنتجات والكميات التي أضيفت مؤقتًا إلى طلب التحويل قبل حفظه.
function renderTransferDraft() {
    if (!transferDraftItems) return;
    if (!transferDraft.length) {
        transferDraftItems.innerHTML = "<span>لم تتم إضافة منتجات بعد.</span>";
        return;
    }
    transferDraftItems.innerHTML = transferDraft.map((item, index) => `
        <div class="transfer-draft-item">
            <span>${transferText(item.name)} — <strong>${item.quantity} قطعة</strong><small> · المتاح في ${transferText(item.source_warehouse)}: ${item.source_quantity} · في ${transferText(item.destination_warehouse)}: ${item.destination_quantity}</small></span>
            <button type="button" onclick="removeTransferDraftItem(${index})">إزالة</button>
        </div>
    `).join("");
}

// يحذف منتجًا من قائمة التحويل المؤقتة بحسب ترتيبه في القائمة.
window.removeTransferDraftItem = function (index) {
    transferDraft.splice(index, 1);
    renderTransferDraft();
};

// يجلب أصناف المخزن المصدر ويقارن كمياتها بكميات المخزن الوجهة.
async function loadTransferSourceProducts() {
    if (!transferSourceWarehouse || !transferProductSelect) return;
    transferProductSelect.innerHTML = "<option value=\"\">جاري تحميل منتجات المخزن...</option>";
    const [{ data, error }, { data: destinationProducts, error: destinationError }] = await Promise.all([
        supabaseClient
        .from("products")
        .select("id, product_code, company, model, color, type, product_type, storage_location, quantity, inventory_key")
        .eq("warehouse", transferSourceWarehouse.value)
        .gt("quantity", 0)
        .order("model"),
        supabaseClient
        .from("products")
        .select("id, quantity, inventory_key")
        .eq("warehouse", transferDestinationWarehouse.value)
    ]);
    if (error || destinationError) {
        console.error("Load transfer source products error:", error);
        transferProductSelect.innerHTML = "<option value=\"\">تعذر تحميل المنتجات</option>";
        setTransferMessage((error || destinationError).message, true);
        return;
    }
    const destinationByInventoryKey = new Map((destinationProducts || []).map(product => [String(product.inventory_key), product]));
    transferSourceProducts = (data || []).map(product => {
        const counterpart = destinationByInventoryKey.get(String(product.inventory_key));
        return { ...product, destination_quantity: Number(counterpart?.quantity || 0) };
    });
    selectedTransferProductId = null;
    renderSelectedTransferProduct();
    renderTransferProductOptions();
}

// يفلتر أصناف المخزن المصدر ويجمع النسخ المتشابهة تحت نتيجة واحدة لكل كود منتج.
function renderTransferProductOptions() {
    const search = (transferProductSearch?.value || "").toLowerCase().trim();
    const products = transferSourceProducts.filter(product => {
        const values = [product.product_code, product.company, product.model, product.color, product.type, product.product_type].join(" ").toLowerCase();
        return !search || values.includes(search);
    });
    const groupedProducts = new Map();
    products.forEach(product => {
        const key = String(product.product_code || product.inventory_key || product.id);
        const current = groupedProducts.get(key) || [];
        current.push(product);
        groupedProducts.set(key, current);
    });
    transferProductSelect.innerHTML = '<option value="">اختر منتجًا للتحويل</option>' + products.map(product => `<option value="${product.id}"></option>`).join("");
    if (!search) {
        transferSearchResults.innerHTML = '<span class="message">اكتب اسم المنتج أو كود المنتج لتظهر النتائج فورًا.</span>';
        return;
    }
    if (!groupedProducts.size) {
        transferSearchResults.innerHTML = '<span class="message">لا توجد نتائج مطابقة في المخزن المصدر.</span>';
        return;
    }
    transferSearchResults.innerHTML = [...groupedProducts.entries()].map(([key, variants]) => {
        const product = variants[0];
        const name = [product.company, product.product_type, product.type].filter(Boolean).join(" ") || "منتج بدون اسم";
        const totalQuantity = variants.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const details = [product.product_code ? `الكود: ${product.product_code}` : "", `${variants.length} نسخة`].filter(Boolean).join(" · ");
        return `<button type="button" class="transfer-search-result" data-transfer-product-group="${transferText(key)}"><span><strong>${transferText(name)}</strong><small>${transferText(details)}</small></span><span class="transfer-search-stock">المتاح: ${totalQuantity}</span></button>`;
    }).join("");
    transferSearchResults.querySelectorAll("[data-transfer-product-group]").forEach(button => button.addEventListener("click", () => openTransferVariantModal(button.dataset.transferProductGroup)));
}

// يحدد نسخة المنتج النهائية بعد اختيار الموديل واللون ويجهزها للإضافة للتحويل.
function selectTransferProduct(id) {
    const product = selectedTransferProductGroup.find(item => String(item.id) === String(id)) || transferSourceProducts.find(item => String(item.id) === String(id));
    if (!product) return;
    selectedTransferProductId = product.id;
    transferProductSelect.value = String(product.id);
    renderTransferProductOptions();
    renderSelectedTransferProduct();
    transferQuantity.focus();
}

// يفتح نافذة اختيار الموديل واللون لنتيجة بحث مجمعة تحت كود منتج واحد.
function openTransferVariantModal(groupKey) {
    selectedTransferProductGroup = transferSourceProducts.filter(product => String(product.product_code || product.inventory_key || product.id) === String(groupKey));
    if (!selectedTransferProductGroup.length) return;
    const first = selectedTransferProductGroup[0];
    transferVariantCode.textContent = `كود المنتج: ${first.product_code || "—"}`;
    transferVariantName.textContent = [first.company, first.product_type, first.type].filter(Boolean).join(" · ") || "اختر النسخة المطلوبة";
    const models = [...new Set(selectedTransferProductGroup.map(product => product.model || "بدون موديل"))];
    transferVariantModel.innerHTML = models.map(model => `<option value="${transferText(model)}">${transferText(model)}</option>`).join("");
    updateTransferVariantColors();
    transferVariantModal.style.display = "grid";
}

// يحدّث قائمة الألوان لتشمل ألوان الموديل المختار فقط ثم يعرض الكمية المتاحة.
function updateTransferVariantColors() {
    const selectedModel = transferVariantModel.value;
    const variants = selectedTransferProductGroup.filter(product => (product.model || "بدون موديل") === selectedModel);
    const colors = [...new Set(variants.map(product => product.color || "بدون لون"))];
    transferVariantColor.innerHTML = colors.map(color => `<option value="${transferText(color)}">${transferText(color)}</option>`).join("");
    updateTransferVariantStock();
}

// يعرض كمية النسخة التي حُددت بالجمع بين الموديل واللون مع أسماء المخازن الفعلية.
function updateTransferVariantStock() {
    const product = selectedTransferProductGroup.find(item =>
        (item.model || "بدون موديل") === transferVariantModel.value &&
        (item.color || "بدون لون") === transferVariantColor.value
    );
    transferVariantStock.textContent = product
        ? `المتاح في مخزن ${transferSourceWarehouse.value}: ${product.quantity || 0} · الموجود في مخزن ${transferDestinationWarehouse.value}: ${product.destination_quantity || 0}`
        : "هذه النسخة غير متاحة.";
}

// يغلق نافذة اختيار نسخ المنتج ويعيدها إلى حالة غير ظاهرة.
function closeTransferVariantModal() {
    transferVariantModal.style.display = "none";
    selectedTransferProductGroup = [];
}

// يعرض بطاقة تفاصيل المنتج المحدد: الكود والاسم والنوع والموديل واللون والكميات.
function renderSelectedTransferProduct() {
    if (!transferSelectedProduct) return;
    const product = transferSourceProducts.find(item => String(item.id) === String(selectedTransferProductId));
    if (!product) {
        transferSelectedProduct.className = "transfer-selected-product";
        transferSelectedProduct.innerHTML = "<span>ابحث عن منتج ثم اختره لإظهار تفاصيله.</span>";
        return;
    }
    const name = [product.company, product.model].filter(Boolean).join(" ") || "منتج بدون اسم";
    transferSelectedProduct.className = "transfer-selected-product has-product";
    transferSelectedProduct.innerHTML = `<strong>${transferText(name)}</strong><span>الكود: <b>${transferText(product.product_code || "—")}</b></span><span>نوع المنتج: <b>${transferText(product.product_type || "—")}</b></span><span>النوع: <b>${transferText(product.type || "—")}</b></span><span>الموديل: <b>${transferText(product.model || "—")}</b></span><span>اللون: <b>${transferText(product.color || "—")}</b></span><span class="stock">كمية مخزن ${transferText(transferSourceWarehouse.value)}: ${product.quantity || 0}</span><span class="stock">كمية مخزن ${transferText(transferDestinationWarehouse.value)}: ${product.destination_quantity || 0}</span>`;
}

// يضبط مسار التحويل حسب الوضع: طلب بضاعة إلى مخزني أو إرسال بضاعة من مخزني.
function configureTransferMode() {
    if (!transferSourceWarehouse || !transferDestinationWarehouse) return;
    const otherWarehouse = warehouses.find(warehouse => warehouse.name !== selectedWarehouse)?.name;
    if (!otherWarehouse) { setTransferMessage("أضف مخزنًا آخر أولًا لتتمكن من إنشاء التحويلات.", true); return; }
    const requesting = transferMode === "request";
    transferSourceWarehouse.value = requesting ? otherWarehouse : selectedWarehouse;
    transferDestinationWarehouse.value = requesting ? selectedWarehouse : otherWarehouse;
    transferSourceWarehouse.disabled = !requesting;
    transferDestinationWarehouse.disabled = requesting;
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
    const product = transferSourceProducts.find(item => String(item.id) === String(selectedTransferProductId));
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
            destination_quantity: product.destination_quantity || 0,
            source_warehouse: transferSourceWarehouse.value,
            destination_warehouse: transferDestinationWarehouse.value
        });
    }
    transferQuantity.value = "";
    transferProductSelect.value = "";
    selectedTransferProductId = null;
    renderSelectedTransferProduct();
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

// يحول رمز حالة التحويل المخزن في قاعدة البيانات إلى نص عربي مفهوم.
function transferStatusLabel(status) {
    return ({ requested: "بانتظار موافقة المصدر", draft: "مسودة", in_transit: "قيد النقل", received: "تم الاستلام", cancelled: "ملغي" })[status] || status;
}

// يجلب التحويلات الواردة والصادرة للمخزن الحالي ويعرضها كبطاقات وفواتير.
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
        .select("id, transfer_id, product_name, product_code, company, model, color, product_type, type, image, price, quantity")
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
        const referenceTotal = transferItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
        const canEditQuantities = currentTeamAccess?.role === "owner" && transfer.status !== "cancelled";
        return `<article class="transfer-card">
            <div class="transfer-card-top"><div><h4>تحويل #${transfer.id}: ${transfer.source_warehouse} إلى ${transfer.destination_warehouse}</h4><p class="transfer-card-meta"><span class="transfer-direction">${direction}</span> ${new Date(transfer.created_at).toLocaleString("ar-SA")}${transfer.notes ? ` · ${transferText(transfer.notes)}` : ""}</p></div><span class="transfer-status ${transfer.status}">${transferStatusLabel(transfer.status)}</span></div>
            <div class="transfer-invoice-items">${transferItems.map(item => `<div class="transfer-invoice-item"><div class="transfer-invoice-image">${item.image ? `<img src="${transferText(item.image)}" alt="${transferText(item.product_name)}">` : "📦"}</div><div class="transfer-invoice-info"><strong>${transferText(item.model || item.product_name)}</strong><small>${[item.company, item.product_code].filter(Boolean).map(transferText).join(" · ")}</small><small>${[item.color, item.type, item.product_type].filter(Boolean).map(transferText).join(" · ") || "بدون تفاصيل إضافية"}</small><small class="transfer-invoice-quantity">الكمية: ${item.quantity} قطعة</small>${canEditQuantities ? `<button class="transfer-action" type="button" onclick="editTransferItemQuantity(${transfer.id}, ${item.id}, ${item.quantity})">✎ تعديل الكمية</button>` : ""}</div><div class="transfer-invoice-price">${Number(item.price || 0).toFixed(2)} ر.س</div></div>`).join("") || "لا توجد عناصر"}</div>
            <div class="transfer-total"><span>إجمالي القيمة المرجعية</span><strong>${referenceTotal.toFixed(2)} ر.س</strong></div>
            <div class="transfer-card-bottom"><span class="transfer-card-meta">${transfer.dispatched_at ? `تم الشحن: ${new Date(transfer.dispatched_at).toLocaleString("ar-SA")}` : "لم يتم الشحن"}</span><div class="transfer-actions">${canDispatch ? `<button class="transfer-action" onclick="changeTransferStatus(${transfer.id}, 'dispatch')">${transfer.status === "requested" ? "قبول وإرسال" : "شحن التحويل"}</button>` : ""}${canReceive ? `<button class="transfer-action receive" onclick="changeTransferStatus(${transfer.id}, 'receive')">تأكيد الاستلام</button>` : ""}${canCancel ? `<button class="transfer-action cancel" onclick="changeTransferStatus(${transfer.id}, 'cancel')">إلغاء</button>` : ""}<button class="transfer-action print" onclick="printTransfer(${transfer.id})">🖨️ طباعة</button></div></div>
        </article>`;
    }).join("");
}

// ينفذ شحن التحويل أو استلامه أو إلغاءه بعد طلب تأكيد من المدير.
window.changeTransferStatus = async function (transferId, action) {
    const descriptions = { dispatch: "شحن التحويل؟ سيتم خصم الكمية من المخزن المصدر.", receive: "تأكيد استلام التحويل؟ ستضاف الكمية إلى المخزن الوجهة.", cancel: "إلغاء التحويل؟ ستعاد الكميات للمصدر إذا كان التحويل قيد النقل." };
    if (!confirm(descriptions[action])) return;
    const { error } = await supabaseClient.rpc("process_warehouse_transfer", { p_transfer_id: transferId, p_action: action });
    if (error) { alert(`تعذر تنفيذ العملية: ${error.message}`); return; }
    await Promise.all([loadTransfers(), loadTransferSourceProducts(), loadDashboardData(), loadDashboardLatestOrders()]);
};

// يسمح للمدير العام فقط بتعديل كمية عنصر التحويل، ويترك تسوية مخزون الحالتين للدالة الآمنة في قاعدة البيانات.
window.editTransferItemQuantity = async function (transferId, transferItemId, currentQuantity) {
    if (currentTeamAccess?.role !== "owner") {
        alert("تعديل كميات التحويلات متاح للمدير العام فقط.");
        return;
    }
    const entered = prompt("أدخل الكمية الجديدة للتحويل:", String(currentQuantity));
    if (entered === null) return;
    const quantity = Number(entered);
    if (!Number.isInteger(quantity) || quantity < 1) {
        alert("أدخل كمية صحيحة أكبر من صفر.");
        return;
    }
    if (quantity === Number(currentQuantity)) return;
    const { error } = await supabaseClient.rpc("adjust_warehouse_transfer_item_quantity", {
        p_transfer_id: transferId,
        p_transfer_item_id: transferItemId,
        p_new_quantity: quantity
    });
    if (error) {
        alert(`تعذر تعديل الكمية: ${error.message}`);
        return;
    }
    alert("تم تعديل كمية التحويل وتسوية المخزون المرتبط بنجاح.");
    await Promise.all([loadTransfers(), loadTransferSourceProducts(), loadDashboardData(), loadDashboardLatestOrders()]);
};

// يطبع التحويل بالقالب والترتيب نفسيهما المستخدمين في كشف طباعة الطلبات.
window.printTransfer = async function (transferId) {
    const transfer = transfersCache.find(item => Number(item.id) === Number(transferId));
    if (!transfer) return;
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) { alert("السماح بالنوافذ المنبثقة مطلوب للطباعة."); return; }

    const { data: items, error } = await supabaseClient
        .from("warehouse_transfer_items")
        .select("id, product_name, product_code, company, model, color, product_type, type, price, quantity")
        .eq("transfer_id", transferId)
        .order("id", { ascending: true });
    if (error) {
        printWindow.close();
        alert(`تعذر تجهيز طباعة التحويل: ${error.message}`);
        return;
    }

    const safeItems = items || [];
    const referenceTotal = safeItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const codeStats = {};
    safeItems.forEach(item => {
        const code = String(item.product_code || "بدون كود").trim();
        codeStats[code] = (codeStats[code] || 0) + Number(item.quantity || 0);
    });
    const rowsHTML = safeItems.map((item, index) => {
        const quantity = Number(item.quantity || 0);
        const total = quantity * Number(item.price || 0);
        return `<tr><td>${index + 1}</td><td>${transferText(item.product_code || "-")}</td><td>${transferText(item.product_type || "-")}</td><td>${transferText(item.type || "-")}</td><td>${transferText(item.company || "-")}</td><td>${transferText(item.model || item.product_name || "-")}</td><td>${transferText(item.color || "-")}</td><td>${quantity}</td><td>${total.toFixed(2)} ر.س</td></tr>`;
    }).join("");
    const typeStatsHTML = Object.entries(codeStats).map(([code, quantity]) => `<span class="type-stat">${transferText(code)}: ${quantity} قطعة</span>`).join("");
    const date = new Date(transfer.created_at).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });

    printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تحويل #${transfer.id}</title><style>
*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;margin:0;padding:30px;background:#fff;color:#111}.print-page{width:100%;max-width:1200px;margin:auto}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:18px;margin-bottom:20px}.header h1{margin:0 0 8px;font-size:25px}.header p{margin:4px 0;font-size:13px}.document-number{font-size:22px;font-weight:bold}.document-info{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #111;margin-bottom:20px}.info-box{padding:12px;border-left:1px solid #111}.info-box:last-child{border-left:0}.info-label{display:block;font-size:11px;color:#555;margin-bottom:5px}.info-value{font-size:14px;font-weight:bold}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}th,td{border:1px solid #111;padding:9px 5px;text-align:center;vertical-align:middle;word-break:break-word}th{background:#eee;font-weight:bold}tbody tr:nth-child(even){background:#fafafa}.total-section{margin-top:20px;display:flex;justify-content:flex-end}.total-box{border:2px solid #111;min-width:280px;display:flex;justify-content:space-between;padding:14px 18px;font-size:17px;font-weight:bold}.type-stats{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.type-stat{border:1px solid #111;padding:5px 9px;font-size:11px}.notes{margin-top:18px;padding:12px;border:1px solid #111;font-size:12px}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #aaa;text-align:center;font-size:11px;color:#555}@media print{body{padding:10px}.print-page{max-width:none}@page{size:A4 portrait;margin:10mm}th{background:#eee!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="print-page">
<div class="header"><div><h1>تحويل مخزون</h1><p>رقم التحويل: <strong>#${transfer.id}</strong></p></div><div><div class="document-number">تحويل #${transfer.id}</div><p>${date}</p></div></div>
<div class="document-info"><div class="info-box"><span class="info-label">المخزن المصدر</span><span class="info-value">${transferText(transfer.source_warehouse)}</span></div><div class="info-box"><span class="info-label">المخزن الوجهة</span><span class="info-value">${transferText(transfer.destination_warehouse)}</span></div><div class="info-box"><span class="info-label">حالة التحويل</span><span class="info-value">${transferText(transferStatusLabel(transfer.status))}</span></div><div class="info-box"><span class="info-label">تاريخ الإنشاء</span><span class="info-value">${date}</span></div><div class="info-box"><span class="info-label">رقم التحويل</span><span class="info-value">#${transfer.id}</span></div></div>
<table><thead><tr><th>#</th><th>رقم المنتج</th><th>نوع المنتج</th><th>النوع</th><th>الشركة</th><th>الموديل</th><th>اللون</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${rowsHTML || '<tr><td colspan="9">لا توجد عناصر في التحويل</td></tr>'}</tbody></table>
<div class="total-section"><div><div class="total-box"><span>إجمالي التحويل</span><span>${referenceTotal.toFixed(2)} ر.س</span></div><div class="type-stats"><strong>إحصائيات الأنواع:</strong>${typeStatsHTML}</div></div></div>
${transfer.notes ? `<div class="notes"><strong>ملاحظات التحويل:</strong> ${transferText(transfer.notes)}</div>` : ""}
<div class="footer">تم إنشاء هذا الكشف من لوحة إدارة المتجر</div></div><script>window.onload=function(){window.print();};<\/script></body></html>`);
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
transferProductSearch?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        const firstResult = transferSearchResults?.querySelector("[data-transfer-product-group]");
        if (firstResult) openTransferVariantModal(firstResult.dataset.transferProductGroup);
    }
});
transferVariantModel?.addEventListener("change", updateTransferVariantColors);
transferVariantColor?.addEventListener("change", updateTransferVariantStock);
document.getElementById("closeTransferVariantModal")?.addEventListener("click", closeTransferVariantModal);
document.getElementById("confirmTransferVariant")?.addEventListener("click", () => {
    const product = selectedTransferProductGroup.find(item =>
        (item.model || "بدون موديل") === transferVariantModel.value &&
        (item.color || "بدون لون") === transferVariantColor.value
    );
    if (!product) { setTransferMessage("اختر موديلًا ولونًا صالحين.", true); return; }
    selectTransferProduct(product.id);
    closeTransferVariantModal();
});
transferVariantModal?.addEventListener("click", event => {
    if (event.target === transferVariantModal) closeTransferVariantModal();
});
transferSourceWarehouse?.addEventListener("change", () => { transferDraft = []; renderTransferDraft(); loadTransferSourceProducts(); });
transferDestinationWarehouse?.addEventListener("change", () => { transferDraft = []; renderTransferDraft(); loadTransferSourceProducts(); });
document.getElementById("refreshTransfersButton")?.addEventListener("click", loadTransfers);
["productsButton", "ordersButton", "categoriesButton", "dashboardButton"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
        if (transfersAdmin) transfersAdmin.style.display = "none";
    });
});

/* =========================================================
   إدارة الحسابات والصلاحيات
========================================================= */
const accountsButton = document.getElementById("accountsButton");
const accountsAdmin = document.getElementById("accountsAdmin");
const backFromAccounts = document.getElementById("backFromAccounts");
const accountsList = document.getElementById("accountsList");
const accountsAuditList = document.getElementById("accountsAuditList");
const accountsSummary = document.getElementById("accountsSummary");

// يحول رمز الدور إلى اسم عربي مفهوم داخل واجهة الحسابات.
function accountRoleLabel(role) {
    return ({ owner: "كامل الصلاحيات", warehouse_manager: "مدير مخزن", orders_staff: "موظف طلبات", viewer: "مشاهد" })[role] || "مستخدم";
}

// يعرض خانات اختيار المخازن التي يمكن منحها للحساب عند حفظ صلاحياته.
function renderAccountWarehousePermissions(selected = []) {
    const container = document.getElementById("accountWarehousePermissions");
    if (!container) return;
    container.innerHTML = warehouses.map(warehouse => `<label><input type="checkbox" value="${transferText(warehouse.name)}" ${selected.includes(warehouse.name) ? "checked" : ""}> مخزن ${transferText(warehouse.name)}</label>`).join("") || "لا توجد مخازن.";
}

// يقرأ الصلاحيات المحددة في نموذج الحساب ويرتبها قبل إرسالها لقاعدة البيانات.
function getAccountFormPermissions() {
    return {
        warehouses: [...document.querySelectorAll("#accountWarehousePermissions input:checked")].map(input => input.value),
        sections: [...document.querySelectorAll(".account-section-permissions input:checked")].map(input => input.value)
    };
}

// يعرض حسابات الفريق والصلاحيات الممنوحة لكل حساب.
async function loadAccounts() {
    if (!accountsList) return;
    accountsList.innerHTML = '<div class="message">جاري تحميل الحسابات...</div>';
    const { data, error } = await supabaseClient.rpc("list_team_accounts");
    if (error) {
        console.error("List team accounts error:", error);
        accountsList.innerHTML = `<div class="message error">تعذر تحميل الحسابات: ${transferText(error.message)}<br><small>إذا ظهر خطأ 400، شغّل ملف fix-accounts-permissions.sql في Supabase SQL Editor.</small></div>`;
        return;
    }
    const accounts = data || [];
    if (accountsSummary) {
        const active = accounts.filter(account => account.is_active).length;
        accountsSummary.innerHTML = `<span><strong>${accounts.length}</strong> حسابات فريق</span><span><strong>${active}</strong> حسابات فعالة</span><span><strong>${accounts.filter(account => account.role === "warehouse_manager").length}</strong> مديرو مخازن</span>`;
    }
    if (!accounts.length) { accountsList.innerHTML = '<div class="message">لا توجد حسابات فريق مضافة بعد.</div>'; return; }
    accountsList.innerHTML = accounts.map(account => {
        const permissions = account.permissions || {};
        const warehousesLabel = (permissions.warehouses || []).length ? permissions.warehouses.join("، ") : "جميع المخازن";
        const sectionsLabel = (permissions.sections || []).map(section => ({ dashboard: "الرئيسية", products: "المنتجات", orders: "الطلبات", sales: "المبيعات", offers: "عروض اليوم", drivers: "المناديب", transfers: "التحويلات", accounts: "الحسابات" })[section] || section).join("، ") || "كل الأقسام";
        return `<article class="account-card"><div class="account-card-top"><div><h4>${transferText(account.email)}</h4><p>تمت الإضافة: ${new Date(account.created_at).toLocaleString("ar-SA")}</p></div><span class="account-role ${account.is_active ? "" : "inactive"}">${account.is_active ? accountRoleLabel(account.role) : "موقوف"}</span></div><div class="account-card-bottom"><span class="account-access">المخازن: ${transferText(warehousesLabel)}<br>الأقسام: ${transferText(sectionsLabel)}</span><div>${account.is_active ? `<button class="account-action disable" onclick="toggleTeamAccount('${account.user_id}', false)">إيقاف الصلاحية</button>` : `<button class="account-action enable" onclick="toggleTeamAccount('${account.user_id}', true)">تفعيل الصلاحية</button>`}</div></div></article>`;
    }).join("");
}

// يعرض آخر عمليات تعديل الحسابات لتسهيل المراجعة والمتابعة.
async function loadAccountsAudit() {
    if (!accountsAuditList) return;
    const { data, error } = await supabaseClient.rpc("list_team_account_audit");
    if (error) { accountsAuditList.innerHTML = '<div class="message">تعذر تحميل سجل النشاط.</div>'; return; }
    accountsAuditList.innerHTML = (data || []).length ? data.map(item => `<div class="audit-card"><strong>${transferText(item.action)}</strong> — ${transferText(item.target_email || "حساب") }<br><small>${new Date(item.created_at).toLocaleString("ar-SA")}</small></div>`).join("") : '<div class="message">لا توجد عمليات مسجلة حتى الآن.</div>';
}

// يحفظ دور الحساب وصلاحياته بعد البحث عنه بالبريد الإلكتروني.
async function saveAccountPermissions() {
    const email = document.getElementById("accountEmail").value.trim();
    const role = document.getElementById("accountRole").value;
    const message = document.getElementById("accountPermissionsMessage");
    if (!email) { message.textContent = "اكتب البريد الإلكتروني للحساب."; return; }
    const permissions = getAccountFormPermissions();
    message.textContent = "جاري حفظ الصلاحيات...";
    const { error } = await supabaseClient.rpc("save_team_account", { p_email: email, p_role: role, p_permissions: permissions });
    if (error) { message.textContent = `تعذر الحفظ: ${error.message}`; return; }
    message.textContent = "تم حفظ صلاحيات الحساب بنجاح.";
    document.getElementById("accountEmail").value = "";
    renderAccountWarehousePermissions();
    await Promise.all([loadAccounts(), loadAccountsAudit()]);
}

// يفعّل أو يوقف صلاحية حساب فريق بدون حذف سجل الحساب.
window.toggleTeamAccount = async function (userId, isActive) {
    if (!confirm(isActive ? "تفعيل صلاحية هذا الحساب؟" : "إيقاف صلاحية هذا الحساب؟")) return;
    const { error } = await supabaseClient.rpc("toggle_team_account", { p_user_id: userId, p_is_active: isActive });
    if (error) { alert(`تعذر تعديل الحساب: ${error.message}`); return; }
    await Promise.all([loadAccounts(), loadAccountsAudit()]);
};

accountsButton?.addEventListener("click", async () => {
    document.getElementById("adminPage").style.display = "none";
    document.getElementById("productsAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    if (transfersAdmin) transfersAdmin.style.display = "none";
    if (driversAdmin) driversAdmin.style.display = "none";
    accountsAdmin.style.display = "block";
    await loadWarehouses();
    renderAccountWarehousePermissions();
    await Promise.all([loadAccounts(), loadAccountsAudit()]);
});
backFromAccounts?.addEventListener("click", () => { accountsAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
document.getElementById("saveAccountPermissionsButton")?.addEventListener("click", saveAccountPermissions);
document.getElementById("refreshAccountsButton")?.addEventListener("click", () => Promise.all([loadAccounts(), loadAccountsAudit()]));

/* =========================================================
   ربط حسابات المناديب
========================================================= */
const driversButton = document.getElementById("driversButton");
const driversAdmin = document.getElementById("driversAdmin");

// يعرض البريد ورقم المندوب واسم المندوب لكل رابط محفوظ.
async function loadDriverAccountLinks() {
    const container = document.getElementById("driverAccountsList");
    if (!container) return;
    container.innerHTML = '<div class="message">جاري تحميل المناديب...</div>';
    const { data, error } = await supabaseClient.rpc("list_driver_account_links");
    if (error) { container.innerHTML = `<div class="message error">تعذر تحميل المناديب: ${transferText(error.message)}</div>`; return; }
    const links = data || [];
    container.innerHTML = links.length ? links.map(link => `<article class="account-card"><div class="account-card-top"><div><h4>${transferText(link.driver_name || "مندوب")}</h4><p>رقم المندوب: ${transferText(link.driver_number)} · مخزن ${transferText(link.warehouse || "غير محدد")}</p></div><span class="account-role">مندوب مربوط</span></div><div class="account-card-bottom"><span class="account-access">${transferText(link.email)}<br><small>تم الربط: ${new Date(link.linked_at).toLocaleString("ar-SA")}</small></span></div></article>`).join("") : '<div class="message">لا توجد حسابات مناديب مربوطة بعد.</div>';
}

// يحفظ ربط البريد برقم مندوب موجود ليعمل تلقائياً في السلة ومنتجات المندوب.
async function linkDriverAccount() {
    const email = document.getElementById("driverAccountEmail").value.trim();
    const driverNumber = document.getElementById("driverAccountNumber").value.trim();
    const message = document.getElementById("driverAccountMessage");
    if (!email || !driverNumber) { message.textContent = "اكتب البريد ورقم المندوب."; return; }
    message.textContent = "جاري حفظ الربط...";
    const { data, error } = await supabaseClient.rpc("link_driver_account", { p_email: email, p_driver_number: driverNumber });
    if (error) { message.textContent = `تعذر الربط: ${error.message}`; return; }
    message.textContent = `تم ربط ${data?.driver_name || "المندوب"} بالحساب بنجاح.`;
    document.getElementById("driverAccountEmail").value = "";
    document.getElementById("driverAccountNumber").value = "";
    await loadDriverAccountLinks();
}

driversButton?.addEventListener("click", async () => {
    document.getElementById("adminPage").style.display = "none";
    document.getElementById("productsAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    if (transfersAdmin) transfersAdmin.style.display = "none";
    if (accountsAdmin) accountsAdmin.style.display = "none";
    if (salesAdmin) salesAdmin.style.display = "none";
    driversAdmin.style.display = "block";
    await loadDriverAccountLinks();
});
document.getElementById("backFromDrivers")?.addEventListener("click", () => { driversAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
document.getElementById("linkDriverAccountButton")?.addEventListener("click", linkDriverAccount);
document.getElementById("refreshDriverAccountsButton")?.addEventListener("click", loadDriverAccountLinks);
[
    "dashboardButton", "productsButton", "ordersButton", "categoriesButton",
    "transfersButton", "accountsButton", "salesButton"
].forEach(id => document.getElementById(id)?.addEventListener("click", () => {
    if (driversAdmin) driversAdmin.style.display = "none";
}));


/* =========================
   التحقق عند فتح الصفحة
========================= */
/* =========================
   التحقق من حساب الإدارة
========================= */

// يفحص الجلسة عند فتح الصفحة ويقرر عرض تسجيل الدخول أو اختيار المخزن.
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


    // لا يسمح بالدخول إلا للحسابات النشطة التي أضافها المالك في قسم الحسابات والصلاحيات.
    const admin = await isAdmin();

    if (!admin) {
        await supabaseClient.auth.signOut();
        showLogin();
        loginMessage.textContent = "هذا الحساب ليس لديه صلاحية دخول لوحة الإدارة";
        loginMessage.style.color = "#e05265";
        return;
    }

    showAdmin();

}


checkSession();

/* =========================================================
   بيانات لوحة التحكم الفعلية
========================================================= */
const formatAdminCurrency = value => `${Number(value || 0).toFixed(2)} ر.س`;
let dashboardOrdersCache = [];

// يجلب جميع منتجات المخزن على دفعات لتكون إحصاءات اللوحة صحيحة حتى مع أكثر من ألف منتج.
async function loadAllDashboardWarehouseProducts() {
    const allProducts = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabaseClient
            .from("products")
            .select("id, product_code, company, model, quantity, image")
            .eq("warehouse", selectedWarehouse)
            .order("id", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data?.length) break;

        allProducts.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    return allProducts;
}

// يجلب ويعرض إحصاءات لوحة التحكم الخاصة بالمخزن المختار فقط.
async function loadDashboardData() {
    const alerts = document.getElementById("dashboardOperationalAlerts");

    try {
        const [{ data: ordersResult, error: ordersError }, products] = await Promise.all([
            supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse }),
            loadAllDashboardWarehouseProducts()
        ]);

        if (ordersError) throw ordersError;

        // تأتي الطلبات عبر دالة تتحقق من صلاحية الحساب والمخزن حتى تظهر الإحصاءات للحسابات المقيّدة.
        const safeOrders = Array.isArray(ordersResult) ? ordersResult : [];
        dashboardOrdersCache = safeOrders;
        const safeProducts = Array.isArray(products) ? products : [];
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
        const followUpOrders = safeOrders.filter(order => !["تم التسليم", "تم استلام طلبك", "ملغي"].includes(order.status || "جديد"));
        if (alerts) {
            alerts.innerHTML = `
                <button type="button" class="dashboard-alert new-orders-alert" id="dashboardNewOrdersAlert">
                    <strong>${followUpOrders.length}</strong><span>طلبات تحتاج متابعة</span>
                </button>
                <button type="button" class="dashboard-alert stock-alert" id="dashboardLowStockAlert">
                    <strong>${lowStock.length}</strong><span>منتجات مخزونها 5 أو أقل</span>
                </button>
            `;
            document.getElementById("dashboardNewOrdersAlert")?.addEventListener("click", () => {
                ordersButton.click();
                setTimeout(() => { if (adminOrderStatusFilter) adminOrderStatusFilter.value = ""; renderAdminOrdersList(); }, 0);
            });
            document.getElementById("dashboardLowStockAlert")?.addEventListener("click", () => openLowStockInventory());
        }

        await loadDashboardBestProducts(safeOrders);
    } catch (error) {
        console.error("Dashboard data error:", error);
        if (alerts) alerts.innerHTML = '<div class="dashboard-alert-error">تعذر تحميل بعض بيانات لوحة التحكم.</div>';
    }
}

// يحسب المنتجات الأكثر مبيعًا اعتمادًا على طلبات المخزن المعروضة.
async function loadDashboardBestProducts(orders) {
    const container = document.getElementById("dashboardBestProducts");
    if (!container) return;

    const orderIds = orders.filter(order => order.status !== "ملغي").map(order => order.id);
    if (!orderIds.length) {
        container.innerHTML = '<div class="dashboard-empty">لا توجد مبيعات لعرض أفضل المنتجات.</div>';
        return;
    }

    // عناصر الطلبات تعود مع الطلب من الدالة المصرح بها، فلا يتعطل التقرير بسبب RLS.
    const items = orders
        .filter(order => order.status !== "ملغي")
        .flatMap(order => Array.isArray(order.items) ? order.items : []);

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

// ينشئ ملف CSV لتقرير مبيعات المخزن الحالي ويبدأ تنزيله.
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
   قسم المبيعات
========================================================= */
const salesButton = document.getElementById("salesButton");
const salesAdmin = document.getElementById("salesAdmin");
const salesDateFrom = document.getElementById("salesDateFrom");
const salesDateTo = document.getElementById("salesDateTo");
const salesDriverFilter = document.getElementById("salesDriverFilter");
let salesOrdersCache = [];

// يحدد أول يوم من الشهر وتاريخه الحالي كفترة مبدئية لتقرير المبيعات.
function setDefaultSalesDates() {
    if (!salesDateFrom?.value) {
        const now = new Date();
        salesDateFrom.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    }
    if (!salesDateTo?.value) salesDateTo.value = new Date().toISOString().slice(0, 10);
}

// يجلب ويعرض تقرير المبيعات للمخزن الحالي ضمن التاريخ والمندوب المختارين.
async function loadSalesReport() {
    if (!salesAdmin || !selectedWarehouse) return;
    setDefaultSalesDates();
    document.getElementById("salesWarehouseName").textContent = selectedWarehouse;
    const metrics = document.getElementById("salesMetrics");
    metrics.innerHTML = "جاري تحميل تقرير المبيعات...";

    const { data, error } = await supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse });
    if (error) {
        metrics.innerHTML = `<div class="message error">تعذر تحميل المبيعات: ${transferText(error.message)}</div>`;
        return;
    }

    const from = salesDateFrom.value ? new Date(`${salesDateFrom.value}T00:00:00`) : null;
    const to = salesDateTo.value ? new Date(`${salesDateTo.value}T23:59:59.999`) : null;
    // تعد المبيعات فقط بعد شحن الطلب أو تأكيد استلامه؛ الطلبات المعلقة لا تدخل في الإيراد.
    const allSales = (Array.isArray(data) ? data : []).filter(order => ["تم شحن الطلب", "تم التسليم", "تم استلام طلبك"].includes(order.status));
    const drivers = [...new Set(allSales.map(order => order.driver_name || order.driver_number).filter(Boolean))].sort();
    const selectedDriver = salesDriverFilter.value;
    salesDriverFilter.innerHTML = `<option value="">كل المناديب</option>${drivers.map(driver => `<option value="${transferText(driver)}" ${driver === selectedDriver ? "selected" : ""}>${transferText(driver)}</option>`).join("")}`;

    salesOrdersCache = allSales.filter(order => {
        const date = new Date(order.created_at);
        const driver = order.driver_name || order.driver_number || "";
        return (!from || date >= from) && (!to || date <= to) && (!salesDriverFilter.value || driver === salesDriverFilter.value);
    });

    const revenue = salesOrdersCache.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const average = salesOrdersCache.length ? revenue / salesOrdersCache.length : 0;
    const delivered = salesOrdersCache.filter(order => ["تم التسليم", "تم استلام طلبك"].includes(order.status)).length;
    metrics.innerHTML = `
        <div class="sales-metric"><span>إجمالي المبيعات</span><strong>${formatAdminCurrency(revenue)}</strong></div>
        <div class="sales-metric"><span>الطلبات المباعة</span><strong>${salesOrdersCache.length}</strong></div>
        <div class="sales-metric"><span>متوسط الطلب</span><strong>${formatAdminCurrency(average)}</strong></div>
        <div class="sales-metric"><span>طلبات مكتملة</span><strong>${delivered}</strong></div>`;

    const productTotals = new Map();
    const driverTotals = new Map();
    salesOrdersCache.forEach(order => {
        const driver = order.driver_name || order.driver_number || "بدون مندوب";
        const driverStat = driverTotals.get(driver) || { orders: 0, revenue: 0 };
        driverStat.orders += 1;
        driverStat.revenue += Number(order.total || 0);
        driverTotals.set(driver, driverStat);
        (order.items || []).forEach(item => {
            const key = item.product_code || `${item.company || ""} ${item.model || ""}`.trim() || "منتج بدون كود";
            const stat = productTotals.get(key) || { quantity: 0, revenue: 0 };
            stat.quantity += Number(item.quantity || 0);
            stat.revenue += Number(item.quantity || 0) * Number(item.price || 0);
            productTotals.set(key, stat);
        });
    });

    const renderRows = (entries, formatter, empty) => entries.length ? entries.map(formatter).join("") : `<div class="dashboard-empty">${empty}</div>`;
    document.getElementById("salesBestProducts").innerHTML = renderRows(
        [...productTotals.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 8),
        ([name, stat]) => `<div class="sales-report-row"><span>${transferText(name)}<br><small>${stat.quantity} قطعة</small></span><strong>${formatAdminCurrency(stat.revenue)}</strong></div>`,
        "لا توجد مبيعات ضمن الفترة المحددة."
    );
    document.getElementById("salesDrivers").innerHTML = renderRows(
        [...driverTotals.entries()].sort((a, b) => b[1].revenue - a[1].revenue),
        ([name, stat]) => `<div class="sales-report-row"><span>${transferText(name)}<br><small>${stat.orders} طلبات</small></span><strong>${formatAdminCurrency(stat.revenue)}</strong></div>`,
        "لا توجد مبيعات مرتبطة بمناديب."
    );
    document.getElementById("salesRecentOrders").innerHTML = renderRows(
        [...salesOrdersCache].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12),
        order => `<div class="sales-report-row"><span>طلب #${order.id} · ${transferText(order.driver_name || "بدون مندوب")}<br><small>${new Date(order.created_at).toLocaleString("ar-SA")} · ${transferText(order.status || "—")}</small></span><strong>${formatAdminCurrency(order.total)}</strong></div>`,
        "لا توجد مبيعات ضمن الفترة المحددة."
    );
}

// ينشئ ملف Excel من أوراق بيانات مسماة ثم ينزله للمستخدم.
function downloadExcelWorkbook(sheets, fileName) {
    if (!window.XLSX) {
        alert("تعذر تجهيز Excel. تحقق من اتصال الإنترنت ثم أعد المحاولة.");
        return;
    }

    const workbook = XLSX.utils.book_new();
    sheets.forEach(({ name, rows }) => {
        const sheet = XLSX.utils.json_to_sheet(rows);
        const headers = rows.length ? Object.keys(rows[0]) : [];
        sheet["!cols"] = headers.map(header => ({
            wch: Math.min(32, Math.max(12, String(header).length + 8))
        }));
        XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
    });
    XLSX.writeFile(workbook, fileName);
}

// يصدر المبيعات التي تظهر في التقرير الحالي بصيغة Excel مع ملخص وتفاصيل الطلبات.
function exportFilteredSalesReport() {
    if (!salesOrdersCache.length) {
        alert("لا توجد مبيعات لتصديرها ضمن الفترة المحددة.");
        return;
    }

    const revenue = salesOrdersCache.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const ordersRows = salesOrdersCache.map(order => ({
        "رقم الطلب": order.id,
        "التاريخ": new Date(order.created_at).toLocaleString("ar-SA"),
        "المندوب": order.driver_name || order.driver_number || "بدون مندوب",
        "رقم المندوب": order.driver_number || "",
        "الحالة": order.status || "",
        "الإجمالي (ر.س)": Number(order.total || 0)
    }));
    const itemsRows = salesOrdersCache.flatMap(order => (order.items || []).map(item => ({
        "رقم الطلب": order.id,
        "التاريخ": new Date(order.created_at).toLocaleString("ar-SA"),
        "المندوب": order.driver_name || order.driver_number || "بدون مندوب",
        "كود المنتج": item.product_code || "",
        "النوع": item.type || item.product_type || "",
        "الشركة": item.company || "",
        "الموديل": item.model || "",
        "اللون": item.color || "",
        "الكمية": Number(item.quantity || 0),
        "سعر الوحدة (ر.س)": Number(item.price || 0),
        "الإجمالي (ر.س)": Number(item.quantity || 0) * Number(item.price || 0)
    })));

    downloadExcelWorkbook([
        { name: "ملخص", rows: [{ "المخزن": selectedWarehouse, "من": salesDateFrom.value, "إلى": salesDateTo.value, "عدد الطلبات": salesOrdersCache.length, "إجمالي المبيعات (ر.س)": revenue }] },
        { name: "طلبات المبيعات", rows: ordersRows },
        { name: "تفاصيل المنتجات", rows: itemsRows.length ? itemsRows : [{ "لا توجد تفاصيل منتجات": "" }] }
    ], `مبيعات-${selectedWarehouse}-${salesDateFrom.value}-${salesDateTo.value}.xlsx`);
}

salesButton?.addEventListener("click", async () => {
    document.getElementById("adminPage").style.display = "none";
    document.getElementById("productsAdmin").style.display = "none";
    document.getElementById("ordersAdmin").style.display = "none";
    document.getElementById("categoriesAdmin").style.display = "none";
    if (transfersAdmin) transfersAdmin.style.display = "none";
    if (accountsAdmin) accountsAdmin.style.display = "none";
    salesAdmin.style.display = "block";
    await loadSalesReport();
});
document.getElementById("backFromSales")?.addEventListener("click", () => { salesAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
document.getElementById("applySalesFilters")?.addEventListener("click", loadSalesReport);
document.getElementById("exportSalesReportButton")?.addEventListener("click", exportFilteredSalesReport);
["productsButton", "ordersButton", "categoriesButton", "dashboardButton", "transfersButton", "accountsButton"].forEach(id => document.getElementById(id)?.addEventListener("click", () => { if (salesAdmin) salesAdmin.style.display = "none"; }));

/* =========================================================
   إدارة عروض اليوم
========================================================= */
const DAILY_OFFERS_BUCKET = "daily-offers";
const offersButton = document.getElementById("offersButton");
const offersAdmin = document.getElementById("offersAdmin");
const dailyOffersList = document.getElementById("dailyOffersList");
const dailyOfferImage = document.getElementById("dailyOfferImage");
const dailyOfferPreview = document.getElementById("dailyOfferPreview");
const dailyOfferMessage = document.getElementById("dailyOfferMessage");
let editingDailyOffer = null;

// يحول النص إلى HTML آمن قبل عرضه داخل بطاقات عروض الإدارة.
function escapeDailyOfferHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

// يرفع صورة العرض إلى مساحة التخزين ويعيد رابطها العام للعرض في الصفحة الرئيسية.
async function uploadDailyOfferImage(file) {
    if (!file) return null;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("اختر صورة PNG أو JPG أو WEBP فقط.");
    if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 5 MB.");
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error: uploadError } = await supabaseClient.storage.from(DAILY_OFFERS_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = supabaseClient.storage.from(DAILY_OFFERS_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("تعذر الحصول على رابط صورة العرض.");
    return data.publicUrl;
}

// يعرض معاينة محلية للصورة التي اختارها المدير قبل رفعها وحفظ العرض.
function previewDailyOfferImage(file) {
    if (!dailyOfferPreview) return;
    if (!file) { dailyOfferPreview.innerHTML = "<span>معاينة الصورة</span>"; return; }
    const reader = new FileReader();
    reader.onload = () => { dailyOfferPreview.innerHTML = `<img src="${reader.result}" alt="معاينة العرض">`; };
    reader.readAsDataURL(file);
}

// يجلب عروض اليوم من قاعدة البيانات ويجهز بطاقات التعديل والحذف والنشر.
async function loadDailyOffersAdmin() {
    if (!dailyOffersList) return;
    dailyOffersList.innerHTML = '<div class="message">جاري تحميل عروض اليوم...</div>';
    const { data, error } = await supabaseClient.from("daily_offers").select("*").order("display_order", { ascending: true });
    if (error) {
        dailyOffersList.innerHTML = `<div class="message error">تعذر تحميل عروض اليوم: ${escapeDailyOfferHtml(error.message)}<br><small>شغّل ملف daily-offers.sql في Supabase SQL Editor مرة واحدة.</small></div>`;
        return;
    }
    dailyOffersList.innerHTML = data?.length ? data.map(offer => `<article class="daily-offer-admin-card"><img src="${escapeDailyOfferHtml(offer.image_url)}" alt="${escapeDailyOfferHtml(offer.title)}"><div><h3>${escapeDailyOfferHtml(offer.title)}</h3><p>${escapeDailyOfferHtml(offer.subtitle || "بدون وصف")}</p><small>الترتيب: ${Number(offer.display_order || 0)} — ${offer.is_active ? "منشور" : "مخفي"}</small></div><div class="daily-offer-admin-actions"><button type="button" onclick="editDailyOffer('${offer.id}')">تعديل</button><button type="button" onclick="toggleDailyOffer('${offer.id}', ${!offer.is_active})">${offer.is_active ? "إخفاء" : "نشر"}</button><button type="button" class="delete-daily-offer" onclick="deleteDailyOffer('${offer.id}')">حذف</button></div></article>`).join("") : '<div class="message">لا توجد عروض بعد. أضف أول عرض من النموذج أعلاه.</div>';
    window.dailyOffersAdminCache = data || [];
}

// يعيد نموذج عروض اليوم إلى وضع الإضافة بعد الحفظ أو إلغاء التعديل.
function resetDailyOfferForm() {
    editingDailyOffer = null;
    ["dailyOfferTitle", "dailyOfferSubtitle"].forEach(id => { const input = document.getElementById(id); if (input) input.value = ""; });
    document.getElementById("dailyOfferLink").value = "products.html";
    document.getElementById("dailyOfferOrder").value = "1";
    if (dailyOfferImage) dailyOfferImage.value = "";
    if (dailyOfferPreview) dailyOfferPreview.innerHTML = "<span>معاينة الصورة</span>";
    document.getElementById("saveDailyOfferButton").textContent = "+ إضافة العرض";
    document.getElementById("cancelDailyOfferEdit").style.display = "none";
}

// يحفظ عرضاً جديداً أو تعديل العرض المحدد، مع الاحتفاظ بالصورة السابقة إن لم تتغير.
async function saveDailyOffer() {
    const title = document.getElementById("dailyOfferTitle").value.trim();
    const subtitle = document.getElementById("dailyOfferSubtitle").value.trim();
    const targetUrl = document.getElementById("dailyOfferLink").value.trim() || "products.html";
    const displayOrder = Math.max(1, Number(document.getElementById("dailyOfferOrder").value || 1));
    const file = dailyOfferImage?.files?.[0];
    if (!title) { dailyOfferMessage.textContent = "اكتب عنوان العرض."; return; }
    if (!editingDailyOffer && !file) { dailyOfferMessage.textContent = "اختر صورة للعرض."; return; }
    dailyOfferMessage.textContent = "جاري حفظ العرض ورفع الصورة...";
    try {
        const imageUrl = file ? await uploadDailyOfferImage(file) : editingDailyOffer.image_url;
        const payload = { title, subtitle, target_url: targetUrl, display_order: displayOrder, image_url: imageUrl };
        const request = editingDailyOffer ? supabaseClient.from("daily_offers").update(payload).eq("id", editingDailyOffer.id) : supabaseClient.from("daily_offers").insert({ ...payload, is_active: true });
        const { error } = await request;
        if (error) throw error;
        dailyOfferMessage.textContent = "تم حفظ العرض بنجاح.";
        resetDailyOfferForm();
        await loadDailyOffersAdmin();
    } catch (error) {
        console.error("Daily offer save error:", error);
        dailyOfferMessage.textContent = `تعذر حفظ العرض: ${error.message}`;
    }
}

// يملأ النموذج ببيانات العرض المحدد ليتم تعديله دون فقدان صورته الحالية.
window.editDailyOffer = function (id) {
    const offer = (window.dailyOffersAdminCache || []).find(item => item.id === id);
    if (!offer) return;
    editingDailyOffer = offer;
    document.getElementById("dailyOfferTitle").value = offer.title || "";
    document.getElementById("dailyOfferSubtitle").value = offer.subtitle || "";
    document.getElementById("dailyOfferLink").value = offer.target_url || "products.html";
    document.getElementById("dailyOfferOrder").value = offer.display_order || 1;
    dailyOfferPreview.innerHTML = `<img src="${escapeDailyOfferHtml(offer.image_url)}" alt="معاينة العرض">`;
    document.getElementById("saveDailyOfferButton").textContent = "حفظ التعديل";
    document.getElementById("cancelDailyOfferEdit").style.display = "";
    dailyOfferMessage.textContent = "يمكنك اختيار صورة جديدة، أو حفظ العرض بالإبقاء على الصورة الحالية.";
    window.scrollTo({ top: 0, behavior: "smooth" });
};

// يغير حالة نشر العرض حتى يمكن إخفاؤه مؤقتاً دون حذفه.
window.toggleDailyOffer = async function (id, isActive) {
    const { error } = await supabaseClient.from("daily_offers").update({ is_active: isActive }).eq("id", id);
    if (error) { alert(`تعذر تحديث العرض: ${error.message}`); return; }
    await loadDailyOffersAdmin();
};

// يحذف العرض من القائمة؛ تبقى الصورة في التخزين لتجنب حذف ملف مشترك بالخطأ.
window.deleteDailyOffer = async function (id) {
    if (!confirm("حذف هذا العرض من الصفحة الرئيسية؟")) return;
    const { error } = await supabaseClient.from("daily_offers").delete().eq("id", id);
    if (error) { alert(`تعذر حذف العرض: ${error.message}`); return; }
    if (editingDailyOffer?.id === id) resetDailyOfferForm();
    await loadDailyOffersAdmin();
};

// يفتح قسم عروض اليوم ويخفي أقسام الإدارة الأخرى لتبقى الشاشة واضحة.
offersButton?.addEventListener("click", async () => {
    ["adminPage", "productsAdmin", "ordersAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin"].forEach(id => { const page = document.getElementById(id); if (page) page.style.display = "none"; });
    offersAdmin.style.display = "block";
    await loadDailyOffersAdmin();
});
document.getElementById("backFromOffers")?.addEventListener("click", () => { offersAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
dailyOfferImage?.addEventListener("change", event => previewDailyOfferImage(event.target.files?.[0]));
document.getElementById("saveDailyOfferButton")?.addEventListener("click", saveDailyOffer);
document.getElementById("cancelDailyOfferEdit")?.addEventListener("click", resetDailyOfferForm);
document.getElementById("refreshDailyOffersButton")?.addEventListener("click", loadDailyOffersAdmin);
[
    "dashboardButton", "productsButton", "ordersButton", "categoriesButton",
    "transfersButton", "accountsButton", "driversButton", "salesButton"
].forEach(id => document.getElementById(id)?.addEventListener("click", () => {
    if (offersAdmin) offersAdmin.style.display = "none";
}));



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

// يصدر جميع منتجات المخزن المختار حالياً إلى ملف Excel منظم.
function exportSelectedWarehouseProducts() {
    const products = getProductsForSelectedWarehouse();
    if (!products.length) {
        alert("لا توجد منتجات في مخزن " + (selectedWarehouse || "المختار") + " لتصديرها.");
        return;
    }

    const rows = products.map(product => ({
        "المخزن": product.warehouse || selectedWarehouse || "",
        "كود المنتج": product.product_code || "",
        "التصنيف": product.category || "",
        "النوع": product.type || product.product_type || "",
        "الشركة": product.company || "",
        "الموديل": product.model || "",
        "اللون": product.color || "",
        "الكمية المتوفرة": Number(product.quantity || 0),
        "السعر (ر.س)": Number(product.price || 0),
        "موقع القطعة": product.storage_location || "غير محدد",
        "تاريخ الإضافة": product.created_at ? new Date(product.created_at).toLocaleString("ar-SA") : ""
    }));

    downloadExcelWorkbook([
        { name: "المنتجات", rows }
    ], `منتجات-${selectedWarehouse || "المخزن"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// يرجع المنتجات التابعة للمخزن الذي اختاره المدير فقط.
function getProductsForSelectedWarehouse() {
    return adminProductsData.filter(product =>
        product.warehouse === selectedWarehouse
    );
}

// يعرض قائمة منتجات المخزن الحالي في صفحة إدارة المنتجات.
function renderSelectedWarehouseProducts() {
    renderAdminProducts(getProductsForSelectedWarehouse());
}

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

document.getElementById("exportProductsExcelButton")?.addEventListener("click", exportSelectedWarehouseProducts);


/* الرجوع */
backToDashboard.addEventListener("click", function () {

    document.getElementById("productsAdmin").style.display = "none";

    document.getElementById("adminPage").style.display = "block";

});

/* تحميل المنتجات */
// يجلب جميع منتجات المخزن الحالي على دفعات لتجنب حد النتائج في قاعدة البيانات.
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


// يفتح المنتجات ويعرض فقط الأصناف التي وصلت كميتها إلى الحد المنخفض.
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

// يرسم بطاقات المنتجات التي تم تمريرها داخل صفحة الإدارة.
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

                <p class="admin-product-storage-location">
                    📍 الموقع: ${product.storage_location || "غير محدد"}
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
                 ${product.storage_location || ""}

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
    document.getElementById("productStorageLocation").value = "";
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
    document.getElementById("productStorageLocation").value = "";
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

    const storageLocation = document.getElementById("productStorageLocation").value.trim();

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

    storage_location: storageLocation || null,

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

    storage_location: storageLocation || null,

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
        product.warehouse || selectedWarehouse;

    document.getElementById("productStorageLocation").value =
        product.storage_location || "";

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

// يربط رقم مندوب بمخزن وينقل طلباته الحالية إلى المخزن نفسه.
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

// يفلتر ويرسم طلبات المخزن الحالي وفق البحث وحالة الطلب.
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

// يحسب ملخص عدد الطلبات والمبيعات والطلبات قيد المتابعة للمخزن الحالي.
function updateOrdersSummary() {
    if (!ordersSummary) return;
    const activeOrders = adminOrdersData.filter(order => !["تم التسليم", "تم استلام طلبك", "ملغي"].includes(order.status || "جديد"));
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

// يجلب طلبات المخزن الحالي وعناصرها ثم يجهزها للعرض في الإدارة.
async function loadAdminOrders() {

    adminOrders.innerHTML = `
        <div class="message">
            جاري تحميل الطلبات...
        </div>
    `;


    // نستخدم دالة مخصّصة لتفادي أن تمنع سياسة RLS الطلبات من الظهور للحساب المصرح له بالمخزن.
    const { data: ordersResult, error } = await supabaseClient.rpc("list_warehouse_orders", {
        p_warehouse: selectedWarehouse
    });
    const orders = Array.isArray(ordersResult) ? ordersResult : [];

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


    // الدالة تعيد عناصر كل طلب معه لتبقى بيانات الفاتورة متاحة دون طلب إضافي محجوب بالصلاحيات.
    adminOrdersData = orders.map(order => ({ ...order, items: order.items || [] }));
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

// يعرض أحدث طلبات المخزن الحالي في لوحة التحكم الرئيسية.
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
                        ${item.type || item.product_type || "بدون نوع"}
                    </h4>

                    <p>
                        كود المنتج: ${item.product_code || "بدون كود"}
                    </p>

                    <p>
                        ${[
                            item.company ? "الماركة: " + item.company : "",
                            item.model ? "الموديل: " + item.model : "",
                            item.color ? "اللون: " + item.color : ""
                        ].filter(Boolean).join(" • ") || "بدون تفاصيل إضافية"}
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
    🏠 عنوان الاستلام:
    <strong>
        ${escapeHtmlAttribute(order.customer_location || "لم يتم تسجيل العنوان")}
    </strong>
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
                    value="تم التسليم"
                    ${["تم التسليم", "تم استلام طلبك"].includes(order.status) ? "selected" : ""}
                >
                    تم التسليم
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
                ${warehouseOptionsHtml(order.warehouse)}
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

        const order = adminOrdersData.find(item => String(item.id) === String(orderId));
        if (!order) { alert("لم يتم العثور على الطلب ضمن مخزن حسابك."); return; }


        // =========================
        // 2 - إذا نفس الحالة
        // =========================

        if (order.status === newStatus) {

            return;

        }


        // =========================
        // 3 - تحديث حالة الطلب
        // =========================

        const { error: updateError } = await supabaseClient.rpc("update_warehouse_order_status", {
            p_order_id: orderId,
            p_status: newStatus
        });


        if (updateError) {

            console.error(updateError);

            alert(
                "حدث خطأ أثناء تحديث حالة الطلب:\n" +
                updateError.message
            );

            return;
        }

        // تنشئ دالة الحفظ إشعار العميل وتقيّد التحديث بالمخزن المصرح به.

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
        // الطلب مع عناصره محمّل مسبقًا بصلاحية المخزن؛ نستخدمه كي لا تحجب RLS عملية الطباعة.
        let order = adminOrdersData.find(item => String(item.id) === String(orderId));

        if (!order) {
            const { data, error } = await supabaseClient.rpc("list_warehouse_orders", {
                p_warehouse: selectedWarehouse
            });
            if (error) throw error;
            order = (Array.isArray(data) ? data : []).find(item => String(item.id) === String(orderId));
        }

        if (!order) {
            alert("لم يتم العثور على الطلب ضمن مخزن حسابك.");
            return;
        }

        const items = order.items || [];


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
                            ${item.storage_location || "غير محدد"}
                        </td>

                        <td>
                            ${quantity}
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
                    موقع القطعة
                </th>

                <th>
                    الكمية
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

        // نفتح الطلب من البيانات المحمّلة بصلاحية المخزن بدل استعلام مباشر قد تمنعه RLS.
        let order = adminOrdersData.find(item => String(item.id) === String(orderId));
        if (!order) {
            const { data, error } = await supabaseClient.rpc("list_warehouse_orders", {
                p_warehouse: selectedWarehouse
            });
            if (error) throw error;
            order = (Array.isArray(data) ? data : []).find(item => String(item.id) === String(orderId));
        }

        if (!order) {
            alert("لم يتم العثور على الطلب ضمن مخزن حسابك.");
            return;
        }

        const items = order.items || [];


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

        // يبقى الطلب داخل المخزن المفتوح للحساب؛ لا يجوز للمستخدم المقيّد نقله لمخزن آخر.
        const driverWarehouse = selectedWarehouse;


        /* =========================
           حساب الإجمالي
        ========================= */

        const total =
            calculateEditOrderTotal();

        // تحفظ الدالة الطلب وعناصره معًا وتتأكد من صلاحية الحساب على المخزن.
        const { error: saveError } = await supabaseClient.rpc("save_warehouse_order", {
            p_order_id: editingOrderId,
            p_order: {
                customer_name: customerName,
                customer_phone: customerPhone,
                driver_name: driverName,
                driver_number: driverNumber,
                warehouse: driverWarehouse,
                total
            },
            p_items: editingOrderItems.map(item => ({
                product_id: item.product_id || null,
                product_code: item.product_code || null,
                category: item.category || null,
                product_type: item.product_type || null,
                type: item.type || null,
                company: item.company || null,
                model: item.model || null,
                color: item.color || null,
                quantity: Math.max(1, Number(item.quantity) || 1),
                price: Math.max(0, Number(item.price) || 0),
                image: item.image || null
            }))
        });

        if (saveError) throw saveError;

        editOrderMessage.textContent = "تم حفظ تعديل الطلب بنجاح ✅";
        editOrderMessage.style.color = "#2e9d69";
        setTimeout(async function () {
            closeEditOrder();
            await loadAdminOrders();
        }, 700);
        return;


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

        let products = [];
        let from = 0;
        const pageSize = 1000;

        // يجلب كل منتجات المخزن على دفعات حتى لا يتوقف اختيار المنتج عند أول ألف نتيجة.
        while (true) {
            const { data, error } = await supabaseClient
                .from("products")
                .select("*")
                .eq("warehouse", selectedWarehouse)
                .order("id", { ascending: false })
                .range(from, from + pageSize - 1);

            if (error) {
                throw error;
            }

            if (!data?.length) {
                break;
            }

            products.push(...data);

            if (data.length < pageSize) {
                break;
            }

            from += pageSize;
        }

        if (!products.length) {

            alert("لم يتم العثور على منتجات في مخزن " + (selectedWarehouse || "المختار"));

            return;
        }

        console.log("منتجات الإضافة:", products.length);

        showOrderProductList(products);

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
