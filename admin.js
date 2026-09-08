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
        samplesButton: "products",
        ordersButton: "orders",
        returnsButton: "orders",
        customersButton: "customers",
        salesButton: "sales",
        analyticsButton: "analytics",
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
    const customersPage = document.getElementById("customersAdmin");
    if (customersPage) customersPage.style.display = "none";
    const returnsPage = document.getElementById("returnsAdmin");
    if (returnsPage) returnsPage.style.display = "none";
    const samplesPage = document.getElementById("samplesAdmin");
    if (samplesPage) samplesPage.style.display = "none";

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
            <span>${transferText(item.name)}<small> · المتاح في ${transferText(item.source_warehouse)}: ${item.source_quantity} · في ${transferText(item.destination_warehouse)}: ${item.destination_quantity}</small></span>
            <label class="transfer-draft-quantity">الكمية <input type="number" min="1" max="${Math.max(1, Number(item.source_quantity || 0))}" value="${item.quantity}" onchange="changeTransferDraftQuantity(${index}, this.value)"></label>
            <button type="button" onclick="removeTransferDraftItem(${index})">إزالة</button>
        </div>
    `).join("");
}

// يحذف منتجًا من قائمة التحويل المؤقتة بحسب ترتيبه في القائمة.
window.removeTransferDraftItem = function (index) {
    transferDraft.splice(index, 1);
    renderTransferDraft();
};

window.changeTransferDraftQuantity = function (index, value) {
    const item = transferDraft[index];
    if (!item) return;
    const available = Math.max(0, Number(item.source_quantity || 0));
    const requested = Math.max(1, Math.floor(Number(value) || 1));
    item.quantity = available ? Math.min(requested, available) : requested;
    renderTransferDraft();
    if (requested > available && available > 0) setTransferMessage(`تم ضبط الكمية على المتاح في المصدر: ${available} قطعة.`);
};

// يجلب كل منتجات مخزن التحويل على دفعات؛ Supabase يعيد ألف صف فقط افتراضياً.
async function loadAllTransferWarehouseProducts(warehouse, fields, onlyAvailable = false) {
    const pageSize = 1000;
    const products = [];
    for (let from = 0; ; from += pageSize) {
        let query = supabaseClient
            .from("products")
            .select(fields)
            .eq("warehouse", warehouse)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (onlyAvailable) query = query.gt("quantity", 0);
        const { data, error } = await query;
        if (error) throw error;
        products.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return products;
}

// يجلب أصناف المخزن المصدر ويقارن كمياتها بكميات المخزن الوجهة.
async function loadTransferSourceProducts() {
    if (!transferSourceWarehouse || !transferProductSelect) return;
    transferProductSelect.innerHTML = "<option value=\"\">جاري تحميل منتجات المخزن...</option>";
    try {
        const [sourceProducts, destinationProducts] = await Promise.all([
            loadAllTransferWarehouseProducts(transferSourceWarehouse.value, "id, product_code, company, model, color, type, product_type, storage_location, quantity, inventory_key", true),
            loadAllTransferWarehouseProducts(transferDestinationWarehouse.value, "id, quantity, inventory_key")
        ]);
        const destinationByInventoryKey = new Map((destinationProducts || []).map(product => [String(product.inventory_key), product]));
    transferSourceProducts = (sourceProducts || []).map(product => {
            const counterpart = destinationByInventoryKey.get(String(product.inventory_key));
            return { ...product, destination_quantity: Number(counterpart?.quantity || 0) };
        });
    } catch (error) {
        console.error("Load transfer source products error:", error);
        transferProductSelect.innerHTML = "<option value=\"\">تعذر تحميل المنتجات</option>";
        setTransferMessage(error.message, true);
        return;
    }
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
    // عند تغيير مخزن المصدر لا نمسح المسودة؛ نربط كل صنف بنسخته في المخزن الجديد إن وجدت.
    transferDraft.forEach(draft => {
        const replacement = transferSourceProducts.find(product =>
            String(product.product_code || "") === String(draft.product_code || "") &&
            String(product.company || "") === String(draft.company || "") &&
            String(product.model || "") === String(draft.model || "") &&
            String(product.color || "") === String(draft.color || "")
        );
        if (!replacement) return;
        draft.product_id = replacement.id;
        draft.source_quantity = Number(replacement.quantity || 0);
        draft.destination_quantity = Number(replacement.destination_quantity || 0);
        draft.source_warehouse = transferSourceWarehouse.value;
        draft.destination_warehouse = transferDestinationWarehouse.value;
    });
    renderTransferDraft();
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
            product_code: product.product_code,
            company: product.company,
            model: product.model,
            color: product.color,
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
    const shortageIds = [...new Set(transferDraft.flatMap(item => item.shortage_ids || [item.shortage_id]).filter(Boolean))];
    if (shortageIds.length) {
        const { error: shortagesError } = await supabaseClient.rpc("mark_shortages_requested", { p_shortage_ids: shortageIds, p_transfer_id: data });
        if (shortagesError) console.warn("تعذر تعليم النواقص كتم الطلب:", shortagesError);
    }
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
transferSourceWarehouse?.addEventListener("change", () => { loadTransferSourceProducts(); });
transferDestinationWarehouse?.addEventListener("change", () => { loadTransferSourceProducts(); });
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
        const sectionsLabel = (permissions.sections || []).map(section => ({ dashboard: "الرئيسية", products: "المنتجات", orders: "الطلبات", customers: "العملاء", sales: "المبيعات", analytics: "الإحصائيات والتحليلات", offers: "عروض اليوم", drivers: "المناديب", transfers: "التحويلات", accounts: "الحسابات" })[section] || section).join("، ") || "كل الأقسام";
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
const isCancelledOrder = order => String(order?.status || "").trim() === "ملغي";
const isSubmittedOrder = order => ["مقدم", "متقدم"].includes(String(order?.status || "").trim());
const needsOrderFollowUp = order => ["جديد", "مقدم", "متقدم"].includes(String(order?.status || "جديد").trim());
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
        const [{ data: ordersResult, error: ordersError }, products, returnsResult] = await Promise.all([
            supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse }),
            loadAllDashboardWarehouseProducts(),
            supabaseClient.rpc("list_warehouse_returns", { p_warehouse: selectedWarehouse })
        ]);

        if (ordersError) throw ordersError;

        // تأتي الطلبات عبر دالة تتحقق من صلاحية الحساب والمخزن حتى تظهر الإحصاءات للحسابات المقيّدة.
        const safeOrders = Array.isArray(ordersResult) ? ordersResult : [];
        const safeProducts = Array.isArray(products) ? products : [];
        const nonCancelled = safeOrders.filter(order => !isCancelledOrder(order));
        dashboardOrdersCache = nonCancelled;
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthOrders = nonCancelled.filter(order => new Date(order.created_at) >= monthStart);
        const monthSales = monthOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

        document.getElementById("dashboardCustomersCount").textContent = new Set(nonCancelled.map(order => order.user_id).filter(Boolean)).size;
        document.getElementById("dashboardSalesTotal").textContent = formatAdminCurrency(nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0));
        document.getElementById("dashboardProductsCount").textContent = safeProducts.length;
        document.getElementById("dashboardOrdersCount").textContent = nonCancelled.length;
        document.getElementById("dashboardSalesSummary").textContent = formatAdminCurrency(monthSales);

        const lowStock = safeProducts.filter(product => Number(product.quantity || 0) <= 5);
        const followUpOrders = nonCancelled.filter(needsOrderFollowUp);
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
                setTimeout(() => { if (adminOrderStatusFilter) adminOrderStatusFilter.value = "متابعة"; renderAdminOrdersList(); }, 0);
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

/* =========================================================
   الإحصائيات والتحليلات
========================================================= */
const analyticsButton = document.getElementById("analyticsButton");
const analyticsAdmin = document.getElementById("analyticsAdmin");
const analyticsPeriod = document.getElementById("analyticsPeriod");

function saudiDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function analyticsPeriodStart(period) {
    if (period === "all") return null;
    const start = new Date();
    start.setDate(start.getDate() - (Math.max(1, Number(period) || 30) - 1));
    start.setHours(0, 0, 0, 0);
    return start;
}

function analyticsRankRows(entries, emptyText, valueFormatter) {
    return entries.length ? entries.map((entry, index) => `<div class="analytics-ranking-row"><span class="analytics-rank">${index + 1}</span><strong>${transferText(entry.name)}</strong><b>${valueFormatter(entry)}</b></div>`).join("") : `<div class="analytics-empty">${emptyText}</div>`;
}

function renderAnalyticsBars(containerId, rows, valueKey, labelFormatter) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const max = Math.max(1, ...rows.map(row => Number(row[valueKey] || 0)));
    container.innerHTML = rows.map(row => {
        const value = Number(row[valueKey] || 0);
        const height = value ? Math.max(8, Math.round((value / max) * 100)) : 3;
        return `<div class="analytics-bar-item"><span class="analytics-bar-value">${valueKey === "sales" ? formatAdminCurrency(value) : value}</span><i style="height:${height}%"></i><small>${labelFormatter(row)}</small></div>`;
    }).join("");
}

async function loadAnalyticsData() {
    if (!analyticsAdmin) return;
    const kpis = document.getElementById("analyticsKpis");
    const period = analyticsPeriod?.value || "30";
    if (kpis) kpis.innerHTML = '<div class="message">جاري تحديث الإحصائيات...</div>';
    try {
        const [{ data: ordersResult, error: ordersError }, products] = await Promise.all([
            supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse }),
            loadAllDashboardWarehouseProducts()
        ]);
        if (ordersError) throw ordersError;

        const allOrders = (Array.isArray(ordersResult) ? ordersResult : []).filter(order => !isCancelledOrder(order));
        const start = analyticsPeriodStart(period);
        const orders = start ? allOrders.filter(order => new Date(order.created_at) >= start) : allOrders;
        const sourceOrdersById = new Map((Array.isArray(ordersResult) ? ordersResult : []).map(order => [String(order.id), order]));
        // لا نحسب إلا المرتجع التابع لتحضير موجود وحالته ليست «ملغي».
        const validReturns = returnsResult?.error ? [] : (Array.isArray(returnsResult?.data) ? returnsResult.data : []).filter(record => {
            const sourceOrder = sourceOrdersById.get(String(record.order_id));
            return sourceOrder && !isCancelledOrder(sourceOrder);
        });
        const periodReturns = start ? validReturns.filter(record => new Date(record.created_at) >= start) : validReturns;
        const nonCancelled = orders;
        // الإيرادات لا تُسجل إلا للفواتير التي تم شحنها أو تسليمها فعليًا.
        const salesStatuses = new Set(["تم الشحن", "تم التسليم"]);
        const salesOrders = allOrders.filter(order => salesStatuses.has(String(order.status || "").trim()));
        const periodSalesOrders = start ? salesOrders.filter(order => new Date(order.created_at) >= start) : salesOrders;
        const totalRevenue = periodSalesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const completed = nonCancelled.filter(order => ["تم التسليم", "تم استلام طلبك"].includes(order.status || "")).length;
        const active = nonCancelled.filter(order => !["تم التسليم", "تم استلام طلبك"].includes(order.status || "")).length;
        const soldItems = nonCancelled.flatMap(order => Array.isArray(order.items) ? order.items : []);
        const totalPieces = soldItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const average = periodSalesOrders.length ? totalRevenue / periodSalesOrders.length : 0;
        // عدد العملاء = الأسماء الفريدة فقط، حتى لا يتكرر العميل عند وجود عدة فواتير أو أرقام جوال مختلفة.
        const customers = new Set(nonCancelled
            .map(order => String(order.customer_name || "").trim().toLocaleLowerCase("ar-SA"))
            .filter(Boolean)).size;
        const lowStock = (products || []).filter(product => Number(product.quantity || 0) <= 5);

        const periodLabel = period === "all" ? "كل الفترة" : `آخر ${period} يوم`;
        const cards = [
            ["طلبات الفترة", nonCancelled.length, periodLabel],
            ["فواتير المبيعات", periodSalesOrders.length, "تم الشحن أو تم التسليم فقط"],
            ["مبيعات الفترة", formatAdminCurrency(totalRevenue), periodLabel],
            ["العملاء خلال الفترة", customers, "من الطلبات غير الملغاة"],
            ["متوسط قيمة الطلب", formatAdminCurrency(average), `${periodSalesOrders.length} تحضير مبيعات`],
            ["نسبة التسليم", `${nonCancelled.length ? Math.round((completed / nonCancelled.length) * 100) : 0}%`, `${completed} طلب مكتمل`],
            ["طلبات تحت المتابعة", nonCancelled.filter(needsOrderFollowUp).length, "الطلبات الجديدة والمقدمة"],
            ["القطع المطلوبة", totalPieces, `${customers} عميل خلال الفترة`]
        ];
        if (kpis) kpis.innerHTML = cards.map(([label, value, hint]) => `<article class="analytics-kpi"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join("");

        const selectedDays = period === "all" ? 30 : Math.max(1, Number(period) || 30);
        const chartDays = Math.min(selectedDays, 30);
        const dailyRows = Array.from({ length: chartDays }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (chartDays - 1 - index));
            const key = saudiDateKey(date);
            return { key, orders: orders.filter(order => saudiDateKey(order.created_at) === key).length };
        });
        renderAnalyticsBars("analyticsDailyChart", dailyRows, "orders", row => row.key.slice(5).replace("-", "/"));
        const chartOrders = dailyRows.reduce((sum, row) => sum + row.orders, 0);
        const weekElement = document.getElementById("analyticsWeekOrders");
        if (weekElement) weekElement.textContent = `${chartOrders} طلب`;
        const returnsElement = document.getElementById("analyticsWeekReturns");
        if (returnsElement) returnsElement.textContent = `${periodReturns.length} مرتجع`;
        const ordersChartTitle = document.getElementById("analyticsOrdersChartTitle");
        const ordersChartHint = document.getElementById("analyticsOrdersChartHint");
        if (ordersChartTitle) ordersChartTitle.textContent = `الطلبات خلال ${chartDays} يوم`;
        if (ordersChartHint) ordersChartHint.textContent = `طلبات غير ملغاة ضمن ${periodLabel} · المرتجعات لتحضيرات غير ملغاة`;

        const monthsToShow = period === "all" ? 6 : Math.max(1, Math.ceil((Number(period) || 30) / 30));
        const monthlyRows = Array.from({ length: monthsToShow }, (_, index) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (monthsToShow - 1 - index), 1);
            const key = saudiDateKey(date).slice(0, 7);
            return { key, sales: periodSalesOrders.filter(order => saudiDateKey(order.created_at).startsWith(key)).reduce((sum, order) => sum + Number(order.total || 0), 0) };
        });
        renderAnalyticsBars("analyticsMonthlyChart", monthlyRows, "sales", row => row.key.slice(5));
        const selectedPeriodSales = monthlyRows.reduce((sum, row) => sum + row.sales, 0);
        const sixMonthElement = document.getElementById("analyticsSixMonthSales");
        if (sixMonthElement) sixMonthElement.textContent = formatAdminCurrency(selectedPeriodSales);
        const salesChartTitle = document.getElementById("analyticsSalesChartTitle");
        const salesChartHint = document.getElementById("analyticsSalesChartHint");
        if (salesChartTitle) salesChartTitle.textContent = `المبيعات خلال ${period === "all" ? "آخر 6 أشهر" : periodLabel}`;
        if (salesChartHint) salesChartHint.textContent = "تم الشحن أو تم التسليم فقط";

        const statuses = new Map();
        orders.forEach(order => {
            const status = order.status || "جديد";
            statuses.set(status, (statuses.get(status) || 0) + 1);
        });
        const statusList = document.getElementById("analyticsStatusList");
        if (statusList) statusList.innerHTML = [...statuses.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => `<div><span>${transferText(status)}</span><b>${count} طلب</b></div>`).join("") || '<div class="analytics-empty">لا توجد طلبات في هذه الفترة.</div>';

        const stockList = document.getElementById("analyticsStockList");
        if (stockList) stockList.innerHTML = lowStock.length ? `<div class="analytics-stock-summary"><strong>${lowStock.length}</strong><span>منتج بكمية 5 أو أقل</span></div>${lowStock.slice(0, 5).map(product => `<div class="analytics-stock-row"><span>${transferText([product.company, product.model, product.product_code].filter(Boolean).join(" · ") || "منتج")}</span><b>${Number(product.quantity || 0)} قطعة</b></div>`).join("")}` : '<div class="analytics-empty">المخزون بحالة جيدة، لا توجد أصناف منخفضة.</div>';

        const salesItems = periodSalesOrders.flatMap(order => Array.isArray(order.items) ? order.items : []);
        const productTotals = new Map();
        const categoryTotals = new Map();
        salesItems.forEach(item => {
            const quantity = Number(item.quantity || 0);
            const productName = [item.company, item.model, item.type || item.product_type, item.product_code].filter(Boolean).join(" · ") || "منتج بدون اسم";
            productTotals.set(productName, (productTotals.get(productName) || 0) + quantity);
            const category = item.category || item.product_type || "غير مصنف";
            categoryTotals.set(category, (categoryTotals.get(category) || 0) + quantity);
        });
        const customerTotals = new Map();
        periodSalesOrders.forEach(order => {
            const name = order.customer_name || "عميل بدون اسم";
            customerTotals.set(name, (customerTotals.get(name) || 0) + Number(order.total || 0));
        });
        const toRank = map => [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
        const topProducts = document.getElementById("analyticsTopProducts");
        const topCategories = document.getElementById("analyticsTopCategories");
        const topCustomers = document.getElementById("analyticsTopCustomers");
        if (topProducts) topProducts.innerHTML = analyticsRankRows(toRank(productTotals), "لا توجد منتجات مطلوبة في هذه الفترة.", entry => `${entry.value} قطعة`);
        if (topCategories) topCategories.innerHTML = analyticsRankRows(toRank(categoryTotals), "لا توجد تصنيفات مطلوبة في هذه الفترة.", entry => `${entry.value} قطعة`);
        if (topCustomers) topCustomers.innerHTML = analyticsRankRows(toRank(customerTotals), "لا توجد مشتريات مسجلة في هذه الفترة.", entry => formatAdminCurrency(entry.value));

        const warehouseName = document.getElementById("analyticsWarehouseName");
        if (warehouseName) warehouseName.textContent = selectedWarehouse || "الحالي";
        const updatedAt = document.getElementById("analyticsUpdatedAt");
        if (updatedAt) updatedAt.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}`;
    } catch (error) {
        console.error("Analytics data error:", error);
        if (kpis) kpis.innerHTML = `<div class="message error">تعذر تحميل الإحصائيات: ${transferText(error.message)}</div>`;
    }
}

analyticsButton?.addEventListener("click", async () => {
    ["productsAdmin", "ordersAdmin", "customersAdmin", "shortagesAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin", "offersAdmin", "returnsAdmin"].forEach(id => {
        const page = document.getElementById(id);
        if (page) page.style.display = "none";
    });
    const adminPage = document.getElementById("adminPage");
    const dashboard = document.querySelector(".admin-dashboard-content");
    if (adminPage) adminPage.style.display = "block";
    if (dashboard) dashboard.style.display = "none";
    analyticsAdmin.style.display = "block";
    await loadAnalyticsData();
});
document.getElementById("backFromAnalytics")?.addEventListener("click", () => {
    if (analyticsAdmin) analyticsAdmin.style.display = "none";
    const page = document.getElementById("adminPage");
    const dashboard = document.querySelector(".admin-dashboard-content");
    if (page) page.style.display = "block";
    if (dashboard) dashboard.style.display = "block";
});
document.getElementById("refreshAnalyticsButton")?.addEventListener("click", loadAnalyticsData);
analyticsPeriod?.addEventListener("change", loadAnalyticsData);
["dashboardButton", "productsButton", "ordersButton", "customersButton", "shortagesButton", "categoriesButton", "transfersButton", "accountsButton", "driversButton", "salesButton", "offersButton", "returnsButton"].forEach(id => document.getElementById(id)?.addEventListener("click", () => {
    if (analyticsAdmin) analyticsAdmin.style.display = "none";
    const dashboard = document.querySelector(".admin-dashboard-content");
    if (dashboard) dashboard.style.display = "block";
}));

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
        order => `<div class="sales-report-row sales-order-row"><span>طلب #${order.id} · ${transferText(order.driver_name || "بدون مندوب")}<br><small>${new Date(order.created_at).toLocaleString("ar-SA", { timeZone:"Asia/Riyadh" })} · ${transferText(order.status || "—")}</small></span><div><strong>${formatAdminCurrency(order.total)}</strong><button type="button" class="open-invoice-button" onclick="openInvoice(${order.id})">فتح التحضير</button></div></div>`,
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
    ["adminPage", "productsAdmin", "ordersAdmin", "customersAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin"].forEach(id => { const page = document.getElementById(id); if (page) page.style.display = "none"; });
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

const adminProductCompanyFilter =
    document.getElementById("adminProductCompanyFilter");

const adminProductModelFilter =
    document.getElementById("adminProductModelFilter");

const adminProductColorFilter =
    document.getElementById("adminProductColorFilter");


let adminProductsData = [];
let selectedProductImage = null;
let selectedAdminProductStatIds = new Set();

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
    refreshAdminProductFilters();
    applyAdminProductFilters();
}

function adminProductFilterValue(product, field) {
    return String(product[field] || "").trim() || "__EMPTY__";
}

function adminProductFilterLabel(value) {
    return value === "__EMPTY__" ? "بدون تحديد" : value;
}

function fillAdminProductFilter(select, values, placeholder, selectedValue = "") {
    if (!select) return;
    select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = placeholder;
    select.appendChild(defaultOption);
    [...new Set(values)].sort((a, b) => adminProductFilterLabel(a).localeCompare(adminProductFilterLabel(b), "ar-SA"))
        .forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = adminProductFilterLabel(value);
            option.selected = value === selectedValue;
            select.appendChild(option);
        });
}

// تصفيات متدرجة: الماركة أولاً، ثم الموديل، ثم اللون.
function refreshAdminProductFilters() {
    if (!adminProductCompanyFilter || !adminProductModelFilter || !adminProductColorFilter) return;
    const products = getProductsForSelectedWarehouse();
    const currentCompany = adminProductCompanyFilter.value;
    fillAdminProductFilter(adminProductCompanyFilter, products.map(product => adminProductFilterValue(product, "company")), "كل الماركات", currentCompany);

    const company = adminProductCompanyFilter.value;
    const companyProducts = company ? products.filter(product => adminProductFilterValue(product, "company") === company) : [];
    const currentModel = adminProductModelFilter.value;
    fillAdminProductFilter(adminProductModelFilter, companyProducts.map(product => adminProductFilterValue(product, "model")), company ? "كل الموديلات" : "اختر الماركة أولاً", currentModel);
    adminProductModelFilter.disabled = !company;

    const model = adminProductModelFilter.value;
    const modelProducts = model ? companyProducts.filter(product => adminProductFilterValue(product, "model") === model) : [];
    const currentColor = adminProductColorFilter.value;
    fillAdminProductFilter(adminProductColorFilter, modelProducts.map(product => adminProductFilterValue(product, "color")), model ? "كل الألوان" : "اختر الموديل أولاً", currentColor);
    adminProductColorFilter.disabled = !model;
}

function applyAdminProductFilters() {
    const search = String(adminProductSearch?.value || "").toLowerCase().trim();
    const company = adminProductCompanyFilter?.value || "";
    const model = adminProductModelFilter?.value || "";
    const color = adminProductColorFilter?.value || "";
    const filtered = getProductsForSelectedWarehouse().filter(product => {
        const text = [product.product_code, product.model, product.company, product.color, product.category, product.product_type, product.type, product.storage_location]
            .filter(Boolean).join(" ").toLowerCase();
        return (!search || text.includes(search)) &&
            (!company || adminProductFilterValue(product, "company") === company) &&
            (!model || adminProductFilterValue(product, "model") === model) &&
            (!color || adminProductFilterValue(product, "color") === color);
    });
    renderAdminProducts(filtered);
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

            <label class="admin-product-select" title="حدد ثم اضغط F4 لعرض تحليل الصنف">
                <input type="checkbox" data-product-stats-id="${Number(product.id)}" ${selectedAdminProductStatIds.has(String(product.id)) ? "checked" : ""}>
                <span>تحديد</span>
            </label>

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

                <p class="admin-product-code">
                    كود المنتج: ${product.product_code || "بدون كود"}
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

        item.querySelector("[data-product-stats-id]")?.addEventListener("change", event => {
            const productId = String(event.target.dataset.productStatsId);
            if (event.target.checked) {
                // تقرير F4 يعالج صنفًا واحدًا؛ اختيار الجديد يلغي السابق مباشرة.
                selectedAdminProductStatIds.clear();
                selectedAdminProductStatIds.add(productId);
                adminProducts.querySelectorAll("[data-product-stats-id]").forEach(input => {
                    if (input !== event.target) input.checked = false;
                });
            } else {
                selectedAdminProductStatIds.delete(productId);
            }
        });

    });

}


/* البحث */

adminProductSearch.addEventListener("input", applyAdminProductFilters);
adminProductCompanyFilter?.addEventListener("change", () => {
    if (adminProductModelFilter) adminProductModelFilter.value = "";
    if (adminProductColorFilter) adminProductColorFilter.value = "";
    refreshAdminProductFilters();
    applyAdminProductFilters();
});
adminProductModelFilter?.addEventListener("change", () => {
    if (adminProductColorFilter) adminProductColorFilter.value = "";
    refreshAdminProductFilters();
    applyAdminProductFilters();
});
adminProductColorFilter?.addEventListener("change", applyAdminProductFilters);

/* =========================================================
   العينات — سجل مستقل لا يخصم من المخزون تلقائيًا
========================================================= */
const samplesButton = document.getElementById("samplesButton");
const samplesAdmin = document.getElementById("samplesAdmin");
const samplesList = document.getElementById("samplesList");
const sampleName = document.getElementById("sampleName");
const sampleProductCode = document.getElementById("sampleProductCode");
const sampleQuantity = document.getElementById("sampleQuantity");
const sampleRecipient = document.getElementById("sampleRecipient");
const sampleNotes = document.getElementById("sampleNotes");
const sampleFormMessage = document.getElementById("sampleFormMessage");
let samplesData = [];

function setSampleMessage(message = "", isError = false) {
    if (!sampleFormMessage) return;
    sampleFormMessage.textContent = message;
    sampleFormMessage.style.color = isError ? "#c3425a" : "#2e9d69";
}

function renderSamples() {
    if (!samplesList) return;
    if (!samplesData.length) {
        samplesList.innerHTML = '<div class="message">لا توجد عينات مسجلة في هذا المخزن.</div>';
        return;
    }
    samplesList.innerHTML = samplesData.map(sample => {
        const date = sample.created_at ? new Date(sample.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—";
        return `<article class="sample-record-card"><div><h4>${transferText(sample.name || "عينة")}</h4><p>${sample.notes ? transferText(sample.notes) : "بدون ملاحظات"}</p><div class="sample-record-meta"><span>الكود: <b>${transferText(sample.product_code || "—")}</b></span><span>المستلم: <b>${transferText(sample.recipient || "غير محدد")}</b></span><span>${transferText(date)}</span></div></div><div class="sample-record-side"><strong>${Number(sample.quantity || 0)} قطعة</strong><button type="button" data-delete-sample="${Number(sample.id)}">حذف</button></div></article>`;
    }).join("");
    samplesList.querySelectorAll("[data-delete-sample]").forEach(button => button.addEventListener("click", () => deleteSample(Number(button.dataset.deleteSample))));
}

async function loadSamples() {
    if (!samplesList) return;
    samplesList.innerHTML = '<div class="message">جاري تحميل العينات...</div>';
    const { data, error } = await supabaseClient.rpc("list_warehouse_samples", { p_warehouse: selectedWarehouse });
    if (error) {
        samplesList.innerHTML = `<div class="message error">تعذر تحميل العينات: ${transferText(error.message)}</div>`;
        return;
    }
    samplesData = Array.isArray(data) ? data : [];
    renderSamples();
}

async function saveSample() {
    const name = String(sampleName?.value || "").trim();
    const quantity = Math.max(0, Number.parseInt(sampleQuantity?.value, 10) || 0);
    if (!name || quantity < 1) {
        setSampleMessage("اكتب اسم العينة وكمية صحيحة.", true);
        return;
    }
    const saveButton = document.getElementById("saveSampleButton");
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "جاري الحفظ..."; }
    const { error } = await supabaseClient.rpc("save_warehouse_sample", {
        p_sample: {
            warehouse: selectedWarehouse,
            name,
            product_code: String(sampleProductCode?.value || "").trim() || null,
            quantity,
            recipient: String(sampleRecipient?.value || "").trim() || null,
            notes: String(sampleNotes?.value || "").trim() || null
        }
    });
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "حفظ العينة"; }
    if (error) {
        setSampleMessage(`تعذر حفظ العينة: ${error.message}`, true);
        return;
    }
    if (sampleName) sampleName.value = "";
    if (sampleProductCode) sampleProductCode.value = "";
    if (sampleQuantity) sampleQuantity.value = "1";
    if (sampleRecipient) sampleRecipient.value = "";
    if (sampleNotes) sampleNotes.value = "";
    setSampleMessage("تم حفظ العينة.");
    await loadSamples();
}

async function deleteSample(sampleId) {
    if (!sampleId || !confirm("هل تريد حذف هذه العينة من السجل؟")) return;
    const { error } = await supabaseClient.rpc("delete_warehouse_sample", { p_sample_id: sampleId });
    if (error) { alert(`تعذر حذف العينة: ${error.message}`); return; }
    await loadSamples();
}

samplesButton?.addEventListener("click", async () => {
    ["adminPage", "productsAdmin", "ordersAdmin", "customersAdmin", "shortagesAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin", "offersAdmin", "returnsAdmin"].forEach(id => {
        const page = document.getElementById(id);
        if (page) page.style.display = "none";
    });
    if (samplesAdmin) samplesAdmin.style.display = "block";
    setSampleMessage("");
    await loadSamples();
});
document.getElementById("backFromSamples")?.addEventListener("click", showAdmin);
document.getElementById("saveSampleButton")?.addEventListener("click", saveSample);
document.getElementById("refreshSamplesButton")?.addEventListener("click", loadSamples);
document.querySelectorAll(".admin-nav-item").forEach(button => {
    if (button.id !== "samplesButton") button.addEventListener("click", () => { if (samplesAdmin) samplesAdmin.style.display = "none"; });
});

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

// من صفحة المنتجات: اختر صنفًا واحدًا ثم F4 لفتح نفس تقرير النواقص.
document.addEventListener("keydown", event => {
    if (event.key !== "F4" || productsAdmin?.style.display === "none") return;
    event.preventDefault();
    const selectedProducts = getProductsForSelectedWarehouse()
        .filter(product => selectedAdminProductStatIds.has(String(product.id)));
    if (selectedProducts.length !== 1) {
        alert("حدد صنفًا واحدًا فقط من صفحة المنتجات ثم اضغط F4.");
        return;
    }
    openShortageProductStats(selectedProducts[0]);
});

// يفلتر ويرسم طلبات المخزن الحالي وفق البحث وحالة الطلب.
function renderAdminOrdersList() {
    const search = (adminOrderSearch?.value || "").trim().toLowerCase();
    const status = adminOrderStatusFilter?.value || "";
    const filteredOrders = adminOrdersData.filter(order => {
        const searchable = [order.id, order.customer_name, order.customer_phone, order.driver_name, order.driver_number]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        const statusMatches = !status
            || (status === "مقدم" && isSubmittedOrder(order))
            || (status === "متابعة" && needsOrderFollowUp(order))
            || order.status === status;
        return (!search || searchable.includes(search)) && statusMatches;
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
    const nonCancelled = adminOrdersData.filter(order => !isCancelledOrder(order));
    const activeOrders = nonCancelled.filter(needsOrderFollowUp);
    const total = nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0);
    ordersSummary.innerHTML = `<span><strong>${nonCancelled.length}</strong> إجمالي الطلبات</span><span><strong>${activeOrders.length}</strong> تحتاج متابعة</span><span><strong>${total.toFixed(2)}</strong> ر.س إجمالي المبيعات</span>`;
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


    // الدالة تعيد عناصر كل طلب معه لتبقى بيانات التحضير متاحة دون طلب إضافي محجوب بالصلاحيات.
    adminOrdersData = orders.map(order => ({ ...order, items: order.items || [] }));
    updateOrdersSummary();
    renderAdminOrdersList();

}

/* =========================================================
   المرتجعات — سجل مستقل عن التحضير الأصلي
========================================================= */
const returnsButton = document.getElementById("returnsButton");
const returnsAdmin = document.getElementById("returnsAdmin");
const returnInvoiceNumber = document.getElementById("returnInvoiceNumber");
const returnInvoiceMessage = document.getElementById("returnInvoiceMessage");
const returnInvoiceDetails = document.getElementById("returnInvoiceDetails");
const returnItems = document.getElementById("returnItems");
const returnNotes = document.getElementById("returnNotes");
const saveReturnButton = document.getElementById("saveReturnButton");
const returnsList = document.getElementById("returnsList");
let selectedReturnOrder = null;
let warehouseReturnsData = [];

function returnItemTitle(item) {
    return [item.company, item.type || item.product_type, item.model].filter(Boolean).join(" · ") || item.product_code || "منتج";
}

function setReturnInvoiceMessage(text = "", isError = false) {
    if (!returnInvoiceMessage) return;
    returnInvoiceMessage.textContent = text;
    returnInvoiceMessage.className = isError ? "return-message error" : "return-message";
}

function updateReturnSaveButton() {
    if (!saveReturnButton || !returnItems) return;
    const hasSelectedItem = [...returnItems.querySelectorAll("[data-return-choice]")].some(choice => {
        const quantity = returnItems.querySelector(`[data-return-quantity="${choice.dataset.returnChoice}"]`);
        return choice.checked && Number(quantity?.value || 0) > 0;
    });
    saveReturnButton.disabled = !selectedReturnOrder || !hasSelectedItem;
}

function renderReturnInvoice() {
    if (!selectedReturnOrder || !returnItems || !returnInvoiceDetails) return;
    const order = selectedReturnOrder;
    const orderDate = order.created_at ? new Date(order.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—";
    returnInvoiceDetails.innerHTML = `
        <button type="button" class="return-invoice-open" data-return-open-editor="${Number(order.id)}"><strong>التحضير #${transferText(order.id)}</strong><span>${transferText(order.customer_name || "عميل")}</span><small>اضغط لفتحه كتعديل مرتجع</small></button>
        <div><strong>الحالة</strong><span>${transferText(order.status || "جديد")}</span></div>
        <div><strong>التاريخ</strong><span>${transferText(orderDate)}</span></div>
        <div class="return-invoice-actions"><button type="button" data-return-open-editor="${Number(order.id)}">فتح / تعديل المرتجع</button><button type="button" data-return-print-invoice="${Number(order.id)}">🖨️ طباعة التحضير</button></div>`;

    returnInvoiceDetails.querySelectorAll("[data-return-open-editor]").forEach(button => {
        button.addEventListener("click", () => openReturnInvoiceEditor(Number(button.dataset.returnOpenEditor)));
    });
    returnInvoiceDetails.querySelectorAll("[data-return-print-invoice]").forEach(button => {
        button.addEventListener("click", () => printOrder(Number(button.dataset.returnPrintInvoice)));
    });

    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) {
        returnItems.innerHTML = `<div class="message">لا توجد منتجات في هذا التحضير.</div>`;
        updateReturnSaveButton();
        return;
    }
    returnItems.innerHTML = items.map(item => {
        const quantity = Math.max(0, Number(item.quantity || 0));
        return `<article class="return-item-card">
            <label class="return-item-select"><input type="checkbox" data-return-choice="${Number(item.id)}"><span>إرجاع المنتج</span></label>
            <div class="return-item-info"><strong>${transferText(returnItemTitle(item))}</strong><small>الكود: ${transferText(item.product_code || "—")} · اللون: ${transferText(item.color || "—")} · الكمية بالتحضير: ${quantity}</small></div>
            <label class="return-quantity-label">الكمية المرتجعة<input type="number" min="1" max="${quantity}" value="1" disabled data-return-quantity="${Number(item.id)}"></label>
        </article>`;
    }).join("");
    returnItems.querySelectorAll("[data-return-choice]").forEach(choice => choice.addEventListener("change", () => {
        const quantity = returnItems.querySelector(`[data-return-quantity="${choice.dataset.returnChoice}"]`);
        if (quantity) quantity.disabled = !choice.checked;
        updateReturnSaveButton();
    }));
    returnItems.querySelectorAll("[data-return-quantity]").forEach(input => input.addEventListener("input", updateReturnSaveButton));
    updateReturnSaveButton();
}

// نموذج تعديل خاص بالمرتجع: يعرض التحضير كمرجع فقط ولا يستدعي حفظ الطلب.
function openReturnInvoiceEditor(orderId) {
    const order = selectedReturnOrder && Number(selectedReturnOrder.id) === Number(orderId)
        ? selectedReturnOrder
        : adminOrdersData.find(item => Number(item.id) === Number(orderId));
    if (!order) return;
    document.getElementById("returnInvoiceEditorDialog")?.remove();
    const items = Array.isArray(order.items) ? order.items : [];
    const dialog = document.createElement("div");
    dialog.id = "returnInvoiceEditorDialog";
    dialog.className = "return-invoice-editor-dialog";
    dialog.innerHTML = `<section class="return-invoice-editor-box" role="dialog" aria-modal="true" aria-label="تعديل مرتجع"><button type="button" class="return-invoice-editor-close" data-close aria-label="إغلاق">×</button><h3>مرتجع من التحضير #${transferText(order.id)}</h3><p>حدّد المنتجات والكميات المرتجعة. الحفظ هنا يسجل مرتجعًا فقط ولا يعدّل التحضير الأصلي.</p><div class="return-invoice-editor-customer"><span>العميل: <b>${transferText(order.customer_name || "عميل")}</b></span><span>حالة التحضير: <b>${transferText(order.status || "جديد")}</b></span></div><div class="return-invoice-editor-table-wrap"><table><thead><tr><th>إرجاع</th><th>الكود</th><th>الشركة</th><th>الموديل</th><th>اللون</th><th>كمية التحضير</th><th>الكمية المرتجعة</th></tr></thead><tbody>${items.map(item => { const quantity = Math.max(0, Number(item.quantity || 0)); return `<tr><td><input type="checkbox" data-return-editor-choice="${Number(item.id)}"></td><td>${transferText(item.product_code || "—")}</td><td>${transferText(item.company || "—")}</td><td>${transferText(item.model || "—")}</td><td>${transferText(item.color || "—")}</td><td>${quantity}</td><td><input type="number" min="1" max="${quantity}" value="1" disabled data-return-editor-quantity="${Number(item.id)}"></td></tr>`; }).join("") || '<tr><td colspan="7">لا توجد منتجات في التحضير.</td></tr>'}</tbody></table></div><label class="return-invoice-editor-notes">ملاحظات المرتجع<textarea rows="3" placeholder="سبب الإرجاع أو ملاحظة (اختياري)"></textarea></label><div class="return-invoice-editor-actions"><button type="button" data-print>🖨️ طباعة التحضير</button><button type="button" class="save" data-save disabled>حفظ كمرتجع</button><button type="button" data-close>إلغاء</button></div></section>`;
    document.body.appendChild(dialog);
    const close = () => dialog.remove();
    const updateSave = () => {
        const canSave = [...dialog.querySelectorAll("[data-return-editor-choice]")].some(choice => {
            const input = dialog.querySelector(`[data-return-editor-quantity="${choice.dataset.returnEditorChoice}"]`);
            return choice.checked && Number(input?.value || 0) > 0;
        });
        const save = dialog.querySelector("[data-save]");
        if (save) save.disabled = !canSave;
    };
    dialog.querySelectorAll("[data-return-editor-choice]").forEach(choice => choice.addEventListener("change", () => {
        const input = dialog.querySelector(`[data-return-editor-quantity="${choice.dataset.returnEditorChoice}"]`);
        if (input) input.disabled = !choice.checked;
        updateSave();
    }));
    dialog.querySelectorAll("[data-return-editor-quantity]").forEach(input => input.addEventListener("input", updateSave));
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
    dialog.querySelector("[data-print]")?.addEventListener("click", () => printOrder(Number(order.id)));
    dialog.querySelector("[data-save]")?.addEventListener("click", async event => {
        const returnItemsData = [...dialog.querySelectorAll("[data-return-editor-choice]:checked")].map(choice => {
            const input = dialog.querySelector(`[data-return-editor-quantity="${choice.dataset.returnEditorChoice}"]`);
            return { order_item_id: Number(choice.dataset.returnEditorChoice), quantity: Number(input?.value || 0) };
        }).filter(item => item.order_item_id && item.quantity > 0);
        if (!returnItemsData.length) return;
        const save = event.currentTarget;
        save.disabled = true;
        save.textContent = "جاري الحفظ...";
        const { data, error } = await supabaseClient.rpc("create_order_return", {
            p_order_id: Number(order.id), p_items: returnItemsData,
            p_notes: dialog.querySelector("textarea")?.value || null
        });
        if (error) {
            alert(`تعذر حفظ المرتجع: ${error.message}`);
            save.disabled = false;
            save.textContent = "حفظ كمرتجع";
            return;
        }
        setReturnInvoiceMessage(`تم حفظ المرتجع #${data?.id || ""}. لم يتم تعديل التحضير الأصلي.`);
        close();
        await loadWarehouseReturns();
    });
}

async function loadReturnInvoice() {
    const orderId = Number(String(returnInvoiceNumber?.value || "").replace(/[^0-9]/g, ""));
    selectedReturnOrder = null;
    if (!orderId) {
        setReturnInvoiceMessage("اكتب رقم التحضير بشكل صحيح.", true);
        if (returnItems) returnItems.innerHTML = `<div class="message">اكتب رقم التحضير لعرض منتجاته.</div>`;
        if (returnInvoiceDetails) returnInvoiceDetails.innerHTML = "";
        updateReturnSaveButton();
        return;
    }
    setReturnInvoiceMessage("جاري البحث عن التحضير...");
    let order = adminOrdersData.find(entry => Number(entry.id) === orderId);
    if (!order) {
        const { data, error } = await supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse });
        if (error) {
            setReturnInvoiceMessage(`تعذر تحميل التحضير: ${error.message}`, true);
            return;
        }
        order = (Array.isArray(data) ? data : []).find(entry => Number(entry.id) === orderId);
    }
    if (!order) {
        setReturnInvoiceMessage("لم نجد تحضيرًا بهذا الرقم في المخزن الحالي.", true);
        if (returnItems) returnItems.innerHTML = `<div class="message">التحضير غير موجود.</div>`;
        if (returnInvoiceDetails) returnInvoiceDetails.innerHTML = "";
        return;
    }
    if (!(order.items || []).every(item => Number(item.id))) {
        setReturnInvoiceMessage("هذا التحضير لا يحتوي معرفات منتجات صالحة للمرتجع. حدّث الصفحة ثم حاول مجددًا.", true);
        return;
    }
    selectedReturnOrder = { ...order, items: order.items || [] };
    setReturnInvoiceMessage("تم تحميل التحضير. يمكنك فتحه أو تعديله أو طباعته، أو تحديد المنتجات وحفظها كمرتجع.");
    renderReturnInvoice();
}

function renderReturnsList(records) {
    if (!returnsList) return;
    if (!records.length) {
        returnsList.innerHTML = `<div class="message">لا توجد مرتجعات مسجلة لهذا المخزن.</div>`;
        return;
    }
    returnsList.innerHTML = records.map(record => {
        const date = record.created_at ? new Date(record.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—";
        const items = Array.isArray(record.items) ? record.items : [];
        const sourceOrder = adminOrdersData.find(order => String(order.id) === String(record.order_id));
        const driverName = record.driver_name || sourceOrder?.driver_name || "غير مسجل";
        const driverNumber = record.driver_number || sourceOrder?.driver_number || "";
        const orderLabel = record.order_id ? `رقم الطلب: #${transferText(record.order_id)}` : "مرتجع مباشر";
        return `<article class="return-record-card">
            <header><div><strong>مرتجع #${transferText(record.id)}</strong><span>${orderLabel}</span></div><time>${transferText(date)}</time></header>
            <div class="return-record-details"><span>العميل: <b>${transferText(record.customer_name || "عميل")}</b> · ${transferText(record.customer_phone || "بدون جوال")}</span><span>المندوب: <b>${transferText(driverName)}</b>${driverNumber ? ` · ${transferText(driverNumber)}` : ""}</span></div>
            <div class="return-record-items">${items.map(item => `<span>${transferText(returnItemTitle(item))} — ${Number(item.quantity || 0)} قطعة${item.color ? ` (${transferText(item.color)})` : ""}</span>`).join("")}</div>
            ${record.notes ? `<small>ملاحظة: ${transferText(record.notes)}</small>` : ""}
            <footer><span>إجمالي المرتجع: ${formatAdminCurrency(record.total || 0)}</span><div><button type="button" data-open-return-record="${transferText(record.return_key || `order-${record.id}`)}">فتح</button><button type="button" data-print-return-record="${transferText(record.return_key || `order-${record.id}`)}">🖨️ طباعة</button></div></footer>
        </article>`;
    }).join("");
    returnsList.querySelectorAll("[data-open-return-record]").forEach(button => button.addEventListener("click", () => openReturnRecordView(button.dataset.openReturnRecord)));
    returnsList.querySelectorAll("[data-print-return-record]").forEach(button => button.addEventListener("click", () => printReturnRecord(button.dataset.printReturnRecord)));
}

async function loadWarehouseReturns() {
    if (!returnsList) return;
    returnsList.innerHTML = `<div class="message">جاري تحميل المرتجعات...</div>`;
    const [{ data, error }, manualResult] = await Promise.all([
        supabaseClient.rpc("list_warehouse_returns", { p_warehouse: selectedWarehouse }),
        supabaseClient.rpc("list_warehouse_manual_returns", { p_warehouse: selectedWarehouse })
    ]);
    if (error) {
        returnsList.innerHTML = `<div class="message error">تعذر تحميل المرتجعات: ${transferText(error.message)}</div>`;
        return;
    }
    const manualReturns = manualResult?.error ? [] : (Array.isArray(manualResult?.data) ? manualResult.data : []);
    warehouseReturnsData = [...(Array.isArray(data) ? data : []), ...manualReturns]
        .map(record => ({ ...record, return_key: `${record.manual_return ? "manual" : "order"}-${record.id}` }))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderReturnsList(warehouseReturnsData);
}

function getReturnRecordWithOrder(returnId) {
    const record = warehouseReturnsData.find(item => String(item.return_key || `order-${item.id}`) === String(returnId));
    if (!record) return null;
    return { record, order: adminOrdersData.find(item => String(item.id) === String(record.order_id)) };
}

// فتح سجل مرتجع مستقل عن التحضير؛ للعرض والطباعة فقط.
function openReturnRecordView(returnId) {
    const result = getReturnRecordWithOrder(returnId);
    if (!result) return;
    const { record, order } = result;
    document.getElementById("warehouseReturnViewDialog")?.remove();
    const date = record.created_at ? new Date(record.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—";
    const driverName = record.driver_name || order?.driver_name || "غير مسجل";
    const driverNumber = record.driver_number || order?.driver_number || "";
    const items = Array.isArray(record.items) ? record.items : [];
    const dialog = document.createElement("div");
    dialog.id = "warehouseReturnViewDialog";
    dialog.className = "customer-return-view-dialog";
    dialog.innerHTML = `<section class="customer-return-view-box" role="dialog" aria-modal="true" aria-label="تفاصيل المرتجع"><button type="button" class="customer-return-view-close" data-close aria-label="إغلاق">×</button><h3>مرتجع #${transferText(record.id)}</h3><p>${record.order_id ? `رقم الطلب #${transferText(record.order_id)} · ` : "مرتجع مباشر · "}${transferText(date)}</p><div class="customer-return-view-meta"><span>العميل: <b>${transferText(record.customer_name || "عميل")}</b></span><span>المندوب: <b>${transferText(driverName)}${driverNumber ? ` (${transferText(driverNumber)})` : ""}</b></span><span>الإجمالي: <b>${formatAdminCurrency(record.total || 0)}</b></span></div><div class="customer-return-view-items">${items.map(item => `<article><strong>${transferText(returnItemTitle(item))}</strong><span>الكود: ${transferText(item.product_code || "—")} · اللون: ${transferText(item.color || "—")} · الكمية المرتجعة: ${Number(item.quantity || 0)}</span></article>`).join("") || '<p>لا توجد منتجات مسجلة.</p>'}</div>${record.notes ? `<div class="customer-return-view-notes">ملاحظات: ${transferText(record.notes)}</div>` : ""}<footer><button type="button" data-print>🖨️ طباعة المرتجع</button><button type="button" data-close>إغلاق</button></footer></section>`;
    document.body.appendChild(dialog);
    const close = () => dialog.remove();
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
    dialog.querySelector("[data-print]")?.addEventListener("click", () => printReturnRecord(returnId));
}

function printReturnRecord(returnId) {
    const result = getReturnRecordWithOrder(returnId);
    if (!result) return;
    const { record, order } = result;
    const date = record.created_at ? new Date(record.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—";
    const driverName = record.driver_name || order?.driver_name || "غير مسجل";
    const items = Array.isArray(record.items) ? record.items : [];
    const quantitiesByCode = new Map();
    items.forEach(item => {
        const code = String(item.product_code || "بدون كود").trim() || "بدون كود";
        quantitiesByCode.set(code, (quantitiesByCode.get(code) || 0) + Math.max(0, Number(item.quantity || 0)));
    });
    const totalPieces = [...quantitiesByCode.values()].reduce((sum, quantity) => sum + quantity, 0);
    const quantitySummary = [...quantitiesByCode.entries()].map(([code, quantity]) => `<span><b>${transferText(code)}</b> — ${quantity} قطعة</span>`).join("");
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { alert("اسمح بفتح نافذة الطباعة ثم حاول مرة أخرى."); return; }
    printWindow.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>مرتجع #${transferText(record.id)}</title><style>body{font-family:Arial,sans-serif;color:#20243a;padding:28px}h1{margin:0 0 8px;color:#3f36af}p{color:#60657a}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:22px 0}.meta div{padding:10px;border:1px solid #dfe1eb;border-radius:8px}.quantity-summary{margin:18px 0;padding:14px;border:1px solid #d8d4ff;border-radius:10px;background:#f7f6ff}.quantity-summary h2{margin:0 0 10px;color:#4037af;font-size:16px}.quantity-summary strong{display:block;margin-bottom:9px}.quantity-summary div{display:flex;flex-wrap:wrap;gap:8px}.quantity-summary span{padding:6px 9px;border-radius:7px;background:#fff;color:#4e4a73;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #cfd2df;padding:9px;text-align:right}th{background:#f0efff}footer{margin-top:20px;font-weight:bold;color:#2d8757}</style></head><body><h1>مستند مرتجع #${transferText(record.id)}</h1><p>التاريخ: ${transferText(date)}</p><div class="meta"><div>${record.order_id ? `رقم الطلب: <b>#${transferText(record.order_id)}</b>` : "مرتجع مباشر"}</div><div>العميل: <b>${transferText(record.customer_name || "عميل")}</b></div><div>المندوب: <b>${transferText(driverName)}</b></div><div>المخزن: <b>${transferText(record.warehouse || "—")}</b></div></div><section class="quantity-summary"><h2>إحصائيات القطع</h2><strong>إجمالي كمية القطع: ${totalPieces} قطعة</strong><div>${quantitySummary || '<span>لا توجد قطع</span>'}</div></section><table><thead><tr><th>#</th><th>الكود</th><th>الصنف</th><th>الموديل</th><th>اللون</th><th>الكمية المرتجعة</th><th>القيمة</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td>${transferText(item.product_code || "—")}</td><td>${transferText(returnItemTitle(item))}</td><td>${transferText(item.model || "—")}</td><td>${transferText(item.color || "—")}</td><td>${Number(item.quantity || 0)}</td><td>${(Number(item.quantity || 0) * Number(item.price || 0)).toFixed(2)} ر.س</td></tr>`).join("")}</tbody></table>${record.notes ? `<p>ملاحظات: ${transferText(record.notes)}</p>` : ""}<footer>إجمالي المرتجع: ${formatAdminCurrency(record.total || 0)}</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
}

/* مرتجع يدوي مستقل عن التحضيرات، مع اختيار عميل مسجل فقط. */
const manualReturnEditor = document.getElementById("manualReturnEditor");
const createManualReturnButton = document.getElementById("createManualReturnButton");
const manualReturnCustomerName = document.getElementById("manualReturnCustomerName");
const manualReturnCustomerPhone = document.getElementById("manualReturnCustomerPhone");
const manualReturnCustomers = document.getElementById("manualReturnCustomers");
const manualReturnCustomerHint = document.getElementById("manualReturnCustomerHint");
const manualReturnItems = document.getElementById("manualReturnItems");
const manualReturnTotal = document.getElementById("manualReturnTotal");
const manualReturnMessage = document.getElementById("manualReturnMessage");
let manualReturnCustomersData = [];
let manualReturnItemsData = [];
let manualReturnOrdersData = [];
let selectedManualReturnCustomerKey = "";

function manualReturnText(value) { return String(value ?? "").trim().toLocaleLowerCase("ar-SA"); }
function setManualReturnMessage(message = "", isError = false) {
    if (!manualReturnMessage) return;
    manualReturnMessage.textContent = message;
    manualReturnMessage.classList.toggle("error", isError);
}
function newManualReturnItem() {
    return { product_code: "", category: "", product_type: "", type: "", company: "", model: "", color: "", storage_location: "", quantity: 1, price: 0, prepared_quantity: 0, max_return_quantity: 0 };
}
function getManualReturnCustomer() {
    return manualReturnCustomersData.find(item => manualReturnText(item.name) === selectedManualReturnCustomerKey) || null;
}
function getManualReturnSourceItems() {
    return getManualReturnCustomer()?.items || [];
}
function productNameForManualReturn(item) {
    return String(item.type || item.product_type || item.category || item.product_code || "").trim();
}
function uniqueManualReturnValues(items, field) {
    return [...new Map(items.map(item => {
        const value = field === "product_name" ? productNameForManualReturn(item) : String(item[field] || "").trim();
        return [manualReturnText(value), value];
    }).filter(([key]) => key)).values()];
}
function getManualReturnCandidates(item) {
    let candidates = getManualReturnSourceItems();
    const code = manualReturnText(item.product_code);
    const name = manualReturnText(item.type);
    const model = manualReturnText(item.model);
    const color = manualReturnText(item.color);
    if (code) candidates = candidates.filter(entry => manualReturnText(entry.product_code) === code);
    else if (name) candidates = candidates.filter(entry => manualReturnText(productNameForManualReturn(entry)) === name);
    if (model) candidates = candidates.filter(entry => manualReturnText(entry.model) === model);
    if (color) candidates = candidates.filter(entry => manualReturnText(entry.color) === color);
    return candidates;
}
function sameManualReturnProduct(first, second) {
    return manualReturnText(first?.product_code) === manualReturnText(second?.product_code)
        && manualReturnText(first?.model) === manualReturnText(second?.model)
        && manualReturnText(first?.color) === manualReturnText(second?.color);
}
function getManualReturnQuantities(product) {
    const prepared = getManualReturnSourceItems()
        .filter(item => sameManualReturnProduct(item, product))
        .reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    const customerName = getManualReturnCustomer()?.name;
    const returned = warehouseReturnsData
        .filter(record => manualReturnText(record.customer_name) === manualReturnText(customerName))
        .flatMap(record => Array.isArray(record.items) ? record.items : [])
        .filter(item => sameManualReturnProduct(item, product))
        .reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    return { prepared, available: Math.max(0, prepared - returned) };
}
function copyManualReturnProduct(index, product) {
    if (!product || !manualReturnItemsData[index]) return;
    const current = manualReturnItemsData[index];
    const quantities = getManualReturnQuantities(product);
    manualReturnItemsData[index] = {
        ...current,
        product_code: product.product_code || "",
        category: product.category || "",
        product_type: product.product_type || "",
        type: productNameForManualReturn(product),
        company: product.company || "",
        model: product.model || "",
        color: product.color || "",
        storage_location: product.storage_location || "",
        price: Number(product.price || 0),
        prepared_quantity: quantities.prepared,
        max_return_quantity: quantities.available,
        quantity: quantities.available
    };
}
function updateManualReturnTotal() {
    const total = manualReturnItemsData.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.price || 0)), 0);
    if (manualReturnTotal) manualReturnTotal.textContent = formatAdminCurrency(total);
}
function renderManualReturnItems() {
    if (!manualReturnItems) return;
    if (!manualReturnItemsData.length) manualReturnItemsData.push(newManualReturnItem());
    manualReturnItems.innerHTML = manualReturnItemsData.map((item, index) => {
        const sourceItems = getManualReturnSourceItems();
        const sourceForCode = sourceItems;
        const sourceForModel = getManualReturnCandidates({ ...item, model: "", color: "" });
        const sourceForColor = getManualReturnCandidates({ ...item, color: "" });
        const choices = (id, values) => `<datalist id="${id}">${values.map(value => `<option value="${transferText(value)}"></option>`).join("")}</datalist>`;
        const text = (field, list = "", values = []) => `<input type="text" value="${transferText(item[field] || "")}" ${list ? `list="${list}"` : ""} data-manual-return-field="${field}" data-manual-return-index="${index}">${list ? choices(list, values) : ""}`;
        const number = field => `<input type="number" min="0" step="${field === "price" ? "0.01" : "1"}" value="${Number(item[field] || 0)}" data-manual-return-field="${field}" data-manual-return-index="${index}">`;
        const returnQuantity = `<input type="number" min="0" max="${Math.max(0, Number(item.max_return_quantity || 0))}" step="1" value="${Number(item.quantity || 0)}" ${Number(item.max_return_quantity || 0) > 0 ? "" : "disabled"} data-manual-return-field="quantity" data-manual-return-index="${index}"><small class="manual-return-available">المتاح للرجوع: ${Math.max(0, Number(item.max_return_quantity || 0))}</small>`;
        const total = Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.price || 0));
        return `<tr><td>${index + 1}</td><td>${text("product_code", `manual-return-codes-${index}`, uniqueManualReturnValues(sourceForCode, "product_code"))}</td><td>${text("category")}</td><td>${text("product_type")}</td><td>${text("type", `manual-return-products-${index}`, uniqueManualReturnValues(sourceItems, "product_name"))}</td><td>${text("company")}</td><td>${text("model", `manual-return-models-${index}`, uniqueManualReturnValues(sourceForModel, "model"))}</td><td>${text("color", `manual-return-colors-${index}`, uniqueManualReturnValues(sourceForColor, "color"))}</td><td>${text("storage_location")}</td><td><strong>${Number(item.prepared_quantity || 0)}</strong></td><td>${returnQuantity}</td><td>${number("price")}</td><td>${formatAdminCurrency(total)}</td><td><button type="button" class="manual-return-remove" data-manual-return-remove="${index}">حذف</button></td></tr>`;
    }).join("");
    updateManualReturnTotal();
    manualReturnItems.querySelectorAll("[data-manual-return-field]").forEach(input => input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.manualReturnIndex);
        const field = event.currentTarget.dataset.manualReturnField;
        const numericValue = Math.max(0, Number(event.currentTarget.value || 0));
        const allowed = field === "quantity" ? Math.max(0, Number(manualReturnItemsData[index].max_return_quantity || 0)) : numericValue;
        manualReturnItemsData[index][field] = ["quantity", "price"].includes(field) ? Math.min(numericValue, allowed) : event.currentTarget.value;
        if (field === "quantity" && numericValue > allowed) {
            event.currentTarget.value = allowed;
            setManualReturnMessage(`لا يمكن إرجاع أكثر من ${allowed} قطعة لهذا المنتج.`, true);
        }
        updateManualReturnTotal();
    }));
    manualReturnItems.querySelectorAll("[data-manual-return-field]").forEach(input => input.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.manualReturnIndex);
        const field = event.currentTarget.dataset.manualReturnField;
        const row = manualReturnItemsData[index];
        if (!["product_code", "type", "model", "color"].includes(field)) return;
        let candidates = getManualReturnCandidates(row);
        if (field === "product_code" || field === "type") {
            candidates = getManualReturnCandidates({ ...row, model: "", color: "" });
            const models = uniqueManualReturnValues(candidates, "model");
            if (models.length > 1) { row.model = ""; row.color = ""; renderManualReturnItems(); setTimeout(() => manualReturnItems.querySelector(`[data-manual-return-index="${index}"][data-manual-return-field="model"]`)?.focus(), 0); return; }
            if (models.length === 1) row.model = models[0];
            const colors = uniqueManualReturnValues(getManualReturnCandidates({ ...row, color: "" }), "color");
            if (colors.length > 1) { row.color = ""; renderManualReturnItems(); setTimeout(() => manualReturnItems.querySelector(`[data-manual-return-index="${index}"][data-manual-return-field="color"]`)?.focus(), 0); return; }
        }
        if (field === "model") {
            candidates = getManualReturnCandidates({ ...row, color: "" });
            const colors = uniqueManualReturnValues(candidates, "color");
            if (colors.length > 1) { row.color = ""; renderManualReturnItems(); setTimeout(() => manualReturnItems.querySelector(`[data-manual-return-index="${index}"][data-manual-return-field="color"]`)?.focus(), 0); return; }
        }
        candidates = getManualReturnCandidates(row);
        if (candidates.length === 1) copyManualReturnProduct(index, candidates[0]);
        renderManualReturnItems();
    }));
    manualReturnItems.querySelectorAll("[data-manual-return-remove]").forEach(button => button.addEventListener("click", () => {
        manualReturnItemsData.splice(Number(button.dataset.manualReturnRemove), 1);
        renderManualReturnItems();
    }));
}
async function loadManualReturnCustomers() {
    const { data, error } = await supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse });
    if (error) { setManualReturnMessage(`تعذر تحميل العملاء: ${error.message}`, true); return; }
    manualReturnOrdersData = (Array.isArray(data) ? data : []).filter(order => !isCancelledOrder(order));
    const unique = new Map();
    manualReturnOrdersData.filter(order => String(order.customer_name || "").trim()).forEach(order => {
        const key = manualReturnText(order.customer_name);
        if (!unique.has(key)) unique.set(key, { name: String(order.customer_name).trim(), phone: String(order.customer_phone || "").trim(), items: [] });
        const customer = unique.get(key);
        if (!customer.phone && order.customer_phone) customer.phone = String(order.customer_phone).trim();
        (Array.isArray(order.items) ? order.items : []).forEach(item => customer.items.push({ ...item, order_id: order.id }));
    });
    manualReturnCustomersData = [...unique.values()];
    if (manualReturnCustomers) manualReturnCustomers.innerHTML = manualReturnCustomersData.map(customer => `<option value="${transferText(customer.name)}"></option>`).join("");
}
function syncManualReturnCustomer() {
    const customer = manualReturnCustomersData.find(item => manualReturnText(item.name) === manualReturnText(manualReturnCustomerName?.value));
    if (manualReturnCustomerPhone) manualReturnCustomerPhone.value = customer?.phone || "";
    const nextKey = customer ? manualReturnText(customer.name) : "";
    if (customer && nextKey !== selectedManualReturnCustomerKey) {
        selectedManualReturnCustomerKey = nextKey;
        manualReturnItemsData = [newManualReturnItem()];
        renderManualReturnItems();
    }
    if (!customer) selectedManualReturnCustomerKey = "";
    if (manualReturnCustomerHint) manualReturnCustomerHint.textContent = customer ? `تم اختيار عميل مسجل. تظهر فقط المنتجات الموجودة في تحضيراته (${customer.items.length} سطر).` : "اكتب جزءًا من الاسم ثم اختر العميل المطابق من القائمة.";
}
function openManualReturnEditor() {
    returnsAdmin?.classList.add("manual-return-mode");
    document.querySelector(".return-create-card")?.style.setProperty("display", "none");
    document.querySelector(".returns-list-header")?.style.setProperty("display", "none");
    if (returnsList) returnsList.style.display = "none";
    if (createManualReturnButton) createManualReturnButton.style.display = "none";
    if (manualReturnEditor) manualReturnEditor.style.display = "block";
    manualReturnItemsData = [newManualReturnItem()];
    selectedManualReturnCustomerKey = "";
    if (manualReturnCustomerName) manualReturnCustomerName.value = "";
    if (manualReturnCustomerPhone) manualReturnCustomerPhone.value = "";
    const notes = document.getElementById("manualReturnNotes"); if (notes) notes.value = "";
    setManualReturnMessage(""); renderManualReturnItems(); loadManualReturnCustomers();
}
function closeManualReturnEditor() {
    returnsAdmin?.classList.remove("manual-return-mode");
    if (manualReturnEditor) manualReturnEditor.style.display = "none";
    document.querySelector(".return-create-card")?.style.removeProperty("display");
    document.querySelector(".returns-list-header")?.style.removeProperty("display");
    if (returnsList) returnsList.style.removeProperty("display");
    if (createManualReturnButton) createManualReturnButton.style.removeProperty("display");
}
async function saveManualReturn() {
    const customer = manualReturnCustomersData.find(item => manualReturnText(item.name) === manualReturnText(manualReturnCustomerName?.value));
    if (!customer) { setManualReturnMessage("اختر عميلًا مسجلًا من القائمة أولًا.", true); return; }
    const items = manualReturnItemsData.map(item => ({ ...item, product_code: String(item.product_code || "").trim(), quantity: Number(item.quantity || 0), price: Number(item.price || 0) })).filter(item => item.product_code && item.quantity > 0);
    if (!items.length) { setManualReturnMessage("أضف منتجًا واحدًا صحيحًا على الأقل مع الكمية.", true); return; }
    const requestedByProduct = new Map();
    items.forEach(item => {
        const key = [manualReturnText(item.product_code), manualReturnText(item.model), manualReturnText(item.color)].join("|");
        const current = requestedByProduct.get(key) || { quantity: 0, max: Number(item.max_return_quantity || 0) };
        current.quantity += Number(item.quantity || 0);
        current.max = Math.min(current.max, Number(item.max_return_quantity || 0));
        requestedByProduct.set(key, current);
    });
    const overLimit = [...requestedByProduct.values()].find(item => item.quantity > item.max);
    if (overLimit) { setManualReturnMessage(`لا يمكن أن تتجاوز كمية المرتجع كمية التحضير المتاحة (${overLimit.max} قطعة).`, true); return; }
    const saveButton = document.getElementById("saveManualReturnButton");
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "جاري الحفظ..."; }
    const { data, error } = await supabaseClient.rpc("create_manual_warehouse_return", { p_return: { warehouse: selectedWarehouse, customer_name: customer.name, customer_phone: customer.phone || null, notes: document.getElementById("manualReturnNotes")?.value || null, items } });
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "حفظ كمرتجع"; }
    if (error) { setManualReturnMessage(`تعذر حفظ المرتجع: ${error.message}`, true); return; }
    setManualReturnMessage(`تم حفظ المرتجع #${data?.id || ""} وإعادة كمياته للمخزون.`);
    await loadWarehouseReturns(); closeManualReturnEditor();
}
createManualReturnButton?.addEventListener("click", openManualReturnEditor);
document.getElementById("backFromManualReturn")?.addEventListener("click", closeManualReturnEditor);
document.getElementById("cancelManualReturnButton")?.addEventListener("click", closeManualReturnEditor);
document.getElementById("addManualReturnItem")?.addEventListener("click", () => { manualReturnItemsData.push(newManualReturnItem()); renderManualReturnItems(); });
manualReturnCustomerName?.addEventListener("input", syncManualReturnCustomer);
manualReturnCustomerName?.addEventListener("change", syncManualReturnCustomer);
document.getElementById("saveManualReturnButton")?.addEventListener("click", saveManualReturn);

async function saveOrderReturn() {
    if (!selectedReturnOrder || !returnItems) return;
    const items = [...returnItems.querySelectorAll("[data-return-choice]:checked")].map(choice => {
        const quantity = returnItems.querySelector(`[data-return-quantity="${choice.dataset.returnChoice}"]`);
        return { order_item_id: Number(choice.dataset.returnChoice), quantity: Number(quantity?.value || 0) };
    }).filter(item => item.order_item_id && item.quantity > 0);
    if (!items.length) {
        setReturnInvoiceMessage("حدّد منتجًا واحدًا وكمية صحيحة على الأقل.", true);
        return;
    }
    saveReturnButton.disabled = true;
    const { data, error } = await supabaseClient.rpc("create_order_return", {
        p_order_id: Number(selectedReturnOrder.id), p_items: items, p_notes: returnNotes?.value || null
    });
    if (error) {
        setReturnInvoiceMessage(`تعذر حفظ المرتجع: ${error.message}`, true);
        updateReturnSaveButton();
        return;
    }
    setReturnInvoiceMessage(`تم حفظ المرتجع #${data?.id || ""} وإرجاع كمياته إلى مخزون التحضير. لم يتم تعديل التحضير الأصلي.`);
    selectedReturnOrder = null;
    if (returnInvoiceNumber) returnInvoiceNumber.value = "";
    if (returnNotes) returnNotes.value = "";
    if (returnInvoiceDetails) returnInvoiceDetails.innerHTML = "";
    if (returnItems) returnItems.innerHTML = `<div class="message">اكتب رقم التحضير لعرض منتجاته.</div>`;
    updateReturnSaveButton();
    loadWarehouseReturns();
}

returnsButton?.addEventListener("click", async () => {
    ["adminPage", "productsAdmin", "ordersAdmin", "customersAdmin", "shortagesAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin", "offersAdmin"].forEach(id => {
        const page = document.getElementById(id);
        if (page) page.style.display = "none";
    });
    if (returnsAdmin) returnsAdmin.style.display = "block";
    await loadWarehouseReturns();
});
document.getElementById("backFromReturns")?.addEventListener("click", showAdmin);
document.getElementById("loadReturnInvoiceButton")?.addEventListener("click", loadReturnInvoice);
returnInvoiceNumber?.addEventListener("keydown", event => { if (event.key === "Enter") loadReturnInvoice(); });
document.getElementById("saveReturnButton")?.addEventListener("click", saveOrderReturn);
document.getElementById("refreshReturnsButton")?.addEventListener("click", loadWarehouseReturns);
["dashboardButton", "productsButton", "ordersButton", "customersButton", "shortagesButton", "categoriesButton", "transfersButton", "accountsButton", "driversButton", "salesButton", "offersButton", "analyticsButton"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
        if (returnsAdmin) returnsAdmin.style.display = "none";
    });
});

/* =========================================================
   العملاء — تُبنى ملفاتهم من بيانات التحضيرات نفسها
========================================================= */
const customersButton = document.getElementById("customersButton");
const shortagesButton = document.getElementById("shortagesButton");
const shortagesAdmin = document.getElementById("shortagesAdmin");
const shortagesList = document.getElementById("shortagesList");
let adminShortagesData = [];
let adminShortageGroups = [];
const customersAdmin = document.getElementById("customersAdmin");
const customersList = document.getElementById("customersList");
const customersSummary = document.getElementById("customersSummary");
const customerProfilePanel = document.getElementById("customerProfilePanel");
const adminCustomerSearch = document.getElementById("adminCustomerSearch");
let adminCustomersData = [];
let adminCustomerReturnsData = [];
let selectedAdminCustomerKey = "";

function customerKeyFromOrder(order) {
    const name = String(order.customer_name || "").trim().toLocaleLowerCase("ar-SA");
    const phone = String(order.customer_phone || "").replace(/\s+/g, "");
    return `${name}__${phone || "no-phone"}`;
}

function customerOrderDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function buildAdminCustomers(orders) {
    const groups = new Map();
    (orders || [])
        // التحضير قد ينشئه العميل أو المندوب؛ اسم العميل فيه هو المرجع في الحالتين.
        .filter(order => order.status !== "جديد" && !isCancelledOrder(order) && String(order.customer_name || "").trim())
        .forEach(order => {
            const key = customerKeyFromOrder(order);
            const customer = groups.get(key) || {
                key,
                name: String(order.customer_name || "عميل").trim(),
                phone: String(order.customer_phone || "").trim(),
                orders: [],
                total: 0,
                latestOrder: order,
                address: order.customer_location || "",
                warehouse: order.warehouse || selectedWarehouse || "—"
            };
            customer.orders.push(order);
            customer.total += Number(order.total || 0);
            if (new Date(order.created_at) > new Date(customer.latestOrder.created_at)) customer.latestOrder = order;
            if (order.customer_location) customer.address = order.customer_location;
            groups.set(key, customer);
        });
    return [...groups.values()]
        .map(customer => {
            const orderIds = new Set(customer.orders.map(order => String(order.id)));
            const returns = adminCustomerReturnsData.filter(record => {
                const sameOrder = orderIds.has(String(record.order_id));
                const sameCustomer = customerKeyFromOrder(record) === customer.key;
                const sameCustomerName = manualReturnText(record.customer_name) === manualReturnText(customer.name);
                return sameOrder || sameCustomer || sameCustomerName;
            });
            return {
                ...customer,
                total: Math.round(customer.total * 100) / 100,
                returns,
                returnsTotal: returns.reduce((sum, record) => sum + Number(record.total || 0), 0)
            };
        })
        .sort((a, b) => new Date(b.latestOrder.created_at) - new Date(a.latestOrder.created_at));
}

function renderCustomerProfile(customer) {
    if (!customerProfilePanel) return;
    if (!customer) {
        customerProfilePanel.innerHTML = '<div class="customer-profile-empty">اختر عميلًا لعرض ملفه وسجل طلباته.</div>';
        return;
    }
    const activeOrders = customer.orders.filter(order => !["تم التسليم", "تم استلام طلبك", "ملغي"].includes(order.status || "جديد")).length;
    const history = [...customer.orders]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(order => `<button type="button" class="customer-history-row customer-order-view" data-customer-order-view="${Number(order.id)}"><div><strong>طلب #${transferText(order.id)}</strong><span>${transferText(order.status || "جديد")} · ${customerOrderDate(order.created_at)} · اضغط لعرض التحضير</span></div><b>${Number(order.total || 0).toFixed(2)} ر.س</b></button>`)
        .join("");
    const returnHistory = [...(customer.returns || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(record => `<button type="button" class="customer-history-row customer-return-row customer-return-view" data-customer-return-view="${transferText(record.return_key || `order-${record.id}`)}"><div><strong>مرتجع #${transferText(record.id)} ${record.order_id ? `من التحضير #${transferText(record.order_id)}` : "مباشر"}</strong><span>${customerOrderDate(record.created_at)} · ${(record.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} قطعة · اضغط لعرض المرتجع</span></div><b>${Number(record.total || 0).toFixed(2)} ر.س</b></button>`)
        .join("");
    customerProfilePanel.innerHTML = `
        <div class="customer-profile-head"><h3>${transferText(customer.name)}</h3><p>${transferText(customer.phone || "لم يسجل رقم جوال")}</p></div>
        <div class="customer-profile-body">
            <div class="customer-profile-grid">
                <div class="customer-profile-field">إجمالي الطلبات<strong>${customer.orders.length} طلب</strong></div>
                <div class="customer-profile-field">إجمالي المشتريات<strong>${customer.total.toFixed(2)} ر.س</strong></div>
                <div class="customer-profile-field">طلبات قيد المتابعة<strong>${activeOrders} طلب</strong></div>
                <div class="customer-profile-field">المخزن<strong>${transferText(customer.warehouse)}</strong></div>
                <div class="customer-profile-field">المرتجعات<strong>${(customer.returns || []).length} مرتجع</strong></div>
                <div class="customer-profile-field">قيمة المرتجعات<strong>${Number(customer.returnsTotal || 0).toFixed(2)} ر.س</strong></div>
                <div class="customer-profile-field" style="grid-column:1/-1;">عنوان الاستلام<strong>${transferText(customer.address || "لم يتم تسجيل عنوان")}</strong></div>
            </div>
            <div class="customer-order-history"><h4>سجل الطلبات</h4>${history || '<div class="customer-profile-empty">لا توجد طلبات مكتملة.</div>'}</div>
            <div class="customer-order-history customer-returns-history"><h4>سجل المرتجعات</h4>${returnHistory || '<div class="customer-profile-empty">لا توجد مرتجعات لهذا العميل.</div>'}</div>
        </div>`;
    customerProfilePanel.querySelectorAll("[data-customer-order-view]").forEach(button => button.addEventListener("click", () => {
        openCustomerOrderView(Number(button.dataset.customerOrderView));
    }));
    customerProfilePanel.querySelectorAll("[data-customer-return-view]").forEach(button => button.addEventListener("click", () => {
        openCustomerReturnView(button.dataset.customerReturnView);
    }));
}

// يعرض تفاصيل المرتجع من سجل العميل، مع رابط مباشر للفواتير الأصلية عند الحاجة.
window.openCustomerReturnView = function (returnId) {
    const record = adminCustomerReturnsData.find(item => String(item.return_key || `order-${item.id}`) === String(returnId));
    if (!record) return;
    document.getElementById("customerReturnViewDialog")?.remove();
    const date = customerOrderDate(record.created_at);
    const items = Array.isArray(record.items) ? record.items : [];
    const dialog = document.createElement("div");
    dialog.id = "customerReturnViewDialog";
    dialog.className = "customer-return-view-dialog";
    dialog.innerHTML = `<section class="customer-return-view-box" role="dialog" aria-modal="true" aria-label="تفاصيل المرتجع"><button type="button" class="customer-return-view-close" data-close aria-label="إغلاق">×</button><h3>مرتجع #${transferText(record.id)}</h3><p>${record.order_id ? `من التحضير #${transferText(record.order_id)} · ` : "مرتجع مباشر · "}${transferText(date)}</p><div class="customer-return-view-meta"><span>العميل: <b>${transferText(record.customer_name || "عميل")}</b></span><span>إجمالي المرتجع: <b>${Number(record.total || 0).toFixed(2)} ر.س</b></span></div><div class="customer-return-view-items">${items.map(item => `<article><strong>${transferText(returnItemTitle(item))}</strong><span>الكود: ${transferText(item.product_code || "—")} · اللون: ${transferText(item.color || "—")} · الكمية المرتجعة: ${Number(item.quantity || 0)}</span></article>`).join("") || '<p>لا توجد منتجات مسجلة.</p>'}</div>${record.notes ? `<div class="customer-return-view-notes">ملاحظات: ${transferText(record.notes)}</div>` : ""}<footer>${record.order_id ? '<button type="button" data-open-order>فتح التحضير الأصلي</button>' : ""}<button type="button" data-close>إغلاق</button></footer></section>`;
    document.body.appendChild(dialog);
    const close = () => dialog.remove();
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
    dialog.querySelector("[data-open-order]")?.addEventListener("click", () => {
        close();
        openCustomerOrderView(Number(record.order_id));
    });
};

function renderAdminCustomers() {
    if (!customersList) return;
    const search = String(adminCustomerSearch?.value || "").trim().toLocaleLowerCase("ar-SA");
    const customers = adminCustomersData.filter(customer => !search || [customer.name, customer.phone, customer.address, customer.warehouse]
        .filter(Boolean).join(" ").toLocaleLowerCase("ar-SA").includes(search));
    customersList.innerHTML = customers.length ? customers.map(customer => `
        <button type="button" class="customer-admin-card ${customer.key === selectedAdminCustomerKey ? "active" : ""}" data-customer-key="${transferText(customer.key)}">
            <div class="customer-admin-card-top"><div><h3>${transferText(customer.name)}</h3><p>${transferText(customer.phone || "بدون رقم جوال")} · آخر طلب: ${customerOrderDate(customer.latestOrder.created_at)}</p></div><span class="customer-orders-count">${customer.orders.length} طلب</span></div>
            <div class="customer-admin-card-bottom"><span>${transferText(customer.address || "لا يوجد عنوان مسجل")}</span><strong>${customer.total.toFixed(2)} ر.س</strong></div>
        </button>`).join("") : '<div class="message">لا يوجد عملاء مطابقون في فواتير هذا المخزن.</div>';
    customersList.querySelectorAll("[data-customer-key]").forEach(button => button.addEventListener("click", () => {
        selectedAdminCustomerKey = button.dataset.customerKey;
        renderAdminCustomers();
        renderCustomerProfile(adminCustomersData.find(customer => customer.key === selectedAdminCustomerKey));
    }));
    renderCustomerProfile(adminCustomersData.find(customer => customer.key === selectedAdminCustomerKey));
}

async function loadAdminCustomers() {
    if (!customersList) return;
    customersList.innerHTML = '<div class="message">جاري تحميل العملاء...</div>';
    const { data, error } = await supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse });
    if (error) {
        console.error("Customers load error:", error);
        customersList.innerHTML = `<div class="message error">تعذر تحميل العملاء: ${transferText(error.message)}</div>`;
        return;
    }
    // سجل المرتجعات مستقل؛ تعذر تحميله لا يمنع ظهور العملاء أو فواتيرهم.
    const [{ data: returnsData, error: returnsError }, manualReturnsResult] = await Promise.all([
        supabaseClient.rpc("list_warehouse_returns", { p_warehouse: selectedWarehouse }),
        supabaseClient.rpc("list_warehouse_manual_returns", { p_warehouse: selectedWarehouse })
    ]);
    if (returnsError) console.warn("Customers returns load error:", returnsError);
    if (manualReturnsResult?.error) console.warn("Customers manual returns load error:", manualReturnsResult.error);
    adminCustomerReturnsData = [
        ...(returnsError ? [] : (Array.isArray(returnsData) ? returnsData : [])),
        ...(manualReturnsResult?.error ? [] : (Array.isArray(manualReturnsResult?.data) ? manualReturnsResult.data : []))
    ].map(record => ({ ...record, return_key: `${record.manual_return ? "manual" : "order"}-${record.id}` }));
    adminCustomersData = buildAdminCustomers(data || []);
    const totalOrders = adminCustomersData.reduce((sum, customer) => sum + customer.orders.length, 0);
    const totalSales = adminCustomersData.reduce((sum, customer) => sum + customer.total, 0);
    if (customersSummary) customersSummary.innerHTML = `<span><strong>${adminCustomersData.length}</strong> عميل مسجل من التحضيرات</span><span><strong>${totalOrders}</strong> إجمالي الطلبات</span><span><strong>${totalSales.toFixed(2)} ر.س</strong> إجمالي مشتريات العملاء</span>`;
    if (!adminCustomersData.some(customer => customer.key === selectedAdminCustomerKey)) selectedAdminCustomerKey = "";
    renderAdminCustomers();
}

customersButton?.addEventListener("click", async () => {
    ["adminPage", "productsAdmin", "ordersAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin", "offersAdmin"].forEach(id => { const page = document.getElementById(id); if (page) page.style.display = "none"; });
    customersAdmin.style.display = "block";
    await loadAdminCustomers();
});

async function loadAdminShortages() {
    if (!shortagesList) return;
    shortagesList.innerHTML = '<div class="message">جاري تحميل النواقص...</div>';
    const { data, error } = await supabaseClient.rpc("list_warehouse_shortages", { p_warehouse: selectedWarehouse });
    if (error) { shortagesList.innerHTML = `<div class="message error">تعذر تحميل النواقص: ${transferText(error.message)}</div>`; return; }
    adminShortagesData = [...(data || [])].sort((first, second) => {
        const key = item => [item.category, item.product_type, item.type, item.company, item.model, item.color, item.product_code]
            .filter(Boolean).join(" ").toLocaleLowerCase("ar-SA");
        return key(first).localeCompare(key(second), "ar-SA");
    });

    // السجلات المتطابقة تعرض كسطر واحد، وتُجمع كمياتها حتى لا تتكرر
    // نفس القطعة عدة مرات في قائمة النواقص.
    const grouped = new Map();
    adminShortagesData.forEach(item => {
        const key = [item.product_code, item.category, item.product_type, item.type, item.company, item.model, item.color, item.storage_location]
            .map(value => String(value || "").trim().toLocaleLowerCase("ar-SA")).join("\u001f");
        const group = grouped.get(key) || {
            ...item,
            items: [],
            shortage_ids: [],
            quantity: 0,
            total: 0
        };
        const quantity = Math.max(0, Number(item.quantity || 0));
        group.items.push(item);
        group.shortage_ids.push(item.id);
        group.quantity += quantity;
        group.total += quantity * Number(item.price || 0);
        grouped.set(key, group);
    });
    adminShortageGroups = [...grouped.values()].map(group => ({
        ...group,
        price: group.quantity ? group.total / group.quantity : 0,
        status: group.items.every(item => item.status === "تم الطلب") ? "تم الطلب" : "جديد",
        transfer_id: group.items.every(item => String(item.transfer_id || "") === String(group.items[0].transfer_id || "")) ? group.items[0].transfer_id : null
    }));

    shortagesList.innerHTML = adminShortageGroups.length ? `<div class="edit-invoice-table-wrap shortages-invoice-table-wrap"><table class="edit-invoice-table shortages-invoice-table"><thead><tr>
        <th>تحديد</th><th>#</th><th>رقم المنتج</th><th>التصنيف</th><th>نوع المنتج</th><th>النوع</th><th>الشركة</th><th>الموديل</th><th>اللون</th><th>الألوان</th><th>موقع القطعة</th><th>الكمية المطلوبة</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الحالة</th><th>التحويل</th>
    </tr></thead><tbody>${adminShortageGroups.map((item, index) => {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const isRequested = item.status === "تم الطلب";
        return `<tr><td><label class="shortage-select"><input type="checkbox" data-shortage-group="${index}" ${isRequested ? "disabled" : ""}><span>${isRequested ? "تم الطلب" : "تحديد"}</span></label></td>
            <td>${index + 1}</td><td>${transferText(item.product_code || "—")}</td><td>${transferText(item.category || "—")}</td><td>${transferText(item.product_type || "—")}</td><td>${transferText(item.type || "—")}</td>
            <td>${transferText(item.company || "—")}</td><td>${transferText(item.model || "—")}</td><td>${transferText(item.color || "—")}</td><td>—</td><td>—</td><td>${quantity}</td><td>${price.toFixed(2)} ر.س</td><td>${(quantity * price).toFixed(2)} ر.س</td>
            <td><span class="shortage-status ${isRequested ? "requested" : "new"}">${transferText(item.status || "جديد")}</span></td><td>${item.transfer_id ? `#${transferText(item.transfer_id)}` : "—"}</td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="message">لا توجد أصناف مسجلة في النواقص.</div>';
    // F4 يعرض تقرير صنف واحد؛ تحديد صنف جديد يلغي السابق تلقائيًا.
    shortagesList.querySelectorAll("[data-shortage-group]").forEach(input => input.addEventListener("change", event => {
        if (!event.target.checked) return;
        shortagesList.querySelectorAll("[data-shortage-group]").forEach(other => {
            if (other !== event.target) other.checked = false;
        });
    }));
}

function shortageItemName(item) {
    return [item.company, item.type || item.product_type, item.model, item.color]
        .filter(Boolean).join(" · ") || item.product_code || "الصنف المحدد";
}

function shortageItemMatches(first, second) {
    if (first.product_id && second.product_id) return String(first.product_id) === String(second.product_id);
    const fields = ["product_code", "category", "product_type", "type", "company", "model", "color"];
    return fields.every(field => !first[field] || !second[field] || String(first[field]).trim() === String(second[field]).trim());
}

function shortageStatsMetric(label, value, hint = "") {
    return `<div class="shortage-stat-metric"><span>${transferText(label)}</span><strong>${transferText(value)}</strong>${hint ? `<small>${transferText(hint)}</small>` : ""}</div>`;
}

// F4 يفتح تقريرًا سريعًا للصنف المحدد في صفحة النواقص.
async function openShortageProductStats(selectedProduct = null) {
    const isShortageView = !selectedProduct;
    let shortage = selectedProduct;
    if (!shortage) {
        const selectedGroupIndexes = [...document.querySelectorAll("[data-shortage-group]:checked")].map(input => Number(input.dataset.shortageGroup));
        const selectedItems = adminShortageGroups.filter((item, index) => selectedGroupIndexes.includes(index));
        if (selectedItems.length !== 1) {
            alert("حدد صنفًا واحدًا فقط من صفحة النواقص ثم اضغط F4.");
            return;
        }
        shortage = selectedItems[0];
    }
    document.getElementById("shortageProductStatsModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "shortageProductStatsModal";
    modal.className = "shortage-product-stats-modal";
    modal.innerHTML = `<div class="shortage-product-stats-box"><button type="button" class="shortage-stats-close" data-close>×</button><div class="shortage-stats-loading">جاري تجهيز بيانات الصنف...</div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector("[data-close]")?.addEventListener("click", close);
    modal.addEventListener("click", event => { if (event.target === modal) close(); });

    try {
        const { data: products, error: productsError } = await supabaseClient
            .from("products")
            .select("id, product_code, category, product_type, type, company, model, color, quantity")
            .eq("warehouse", selectedWarehouse)
            .eq("product_code", shortage.product_code || "");
        if (productsError) throw productsError;
        const matchedProducts = (products || []).filter(product => shortageItemMatches(shortage, product));
        const stockQuantity = matchedProducts.reduce((sum, product) => sum + Number(product.quantity || 0), 0);

        const { data: ordersData, error: ordersError } = await supabaseClient.rpc("list_warehouse_orders", { p_warehouse: selectedWarehouse });
        if (ordersError) throw ordersError;
        const matchingOrderItems = (Array.isArray(ordersData) ? ordersData : [])
            .filter(order => !isCancelledOrder(order))
            .flatMap(order => (order.items || []).filter(item => shortageItemMatches(shortage, item)).map(item => ({ order, item })));
        // كل أرقام المبيعات مبنية على فواتير خرجت فعليًا: تم الشحن أو تم التسليم.
        const completedSalesStatuses = new Set(["تم الشحن", "تم التسليم"]);
        const salesOrderItems = matchingOrderItems.filter(entry => completedSalesStatuses.has(String(entry.order.status || "").trim()));
        const totalUnits = salesOrderItems.reduce((sum, entry) => sum + Number(entry.item.quantity || 0), 0);
        const invoiceCount = new Set(salesOrderItems.map(entry => String(entry.order.id))).size;
        const activeStatuses = new Set(["جديد", "مقدم", "قيد التجهيز", "تم الشحن"]);
        const pendingUnits = matchingOrderItems.filter(entry => activeStatuses.has(String(entry.order.status || "جديد").trim()))
            .reduce((sum, entry) => sum + Number(entry.item.quantity || 0), 0);
        const now = new Date();
        // نحسب حدود اليوم/الأسبوع/الشهر من تقويم السعودية نفسه، لا من منطقة جهاز الموظف.
        const saudiParts = value => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" })
            .formatToParts(new Date(value)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
        const saudiDayNumber = value => {
            const parts = saudiParts(value);
            return Date.UTC(parts.year, parts.month - 1, parts.day);
        };
        const todaySaudi = saudiDayNumber(now);
        const saudiWeekday = new Date(todaySaudi).getUTCDay();
        const startOfWeek = todaySaudi - (((saudiWeekday + 6) % 7) * 86400000); // يبدأ الأسبوع يوم الإثنين
        const nowSaudiParts = saudiParts(now);
        const startOfMonth = Date.UTC(nowSaudiParts.year, nowSaudiParts.month - 1, 1);
        const quantitySince = start => salesOrderItems.filter(entry => saudiDayNumber(entry.order.created_at) >= start)
            .reduce((sum, entry) => sum + Number(entry.item.quantity || 0), 0);
        const todaySales = salesOrderItems
            .filter(entry => saudiDayNumber(entry.order.created_at) === todaySaudi)
            .reduce((sum, entry) => sum + Number(entry.item.quantity || 0), 0);
        const weekSales = quantitySince(startOfWeek);
        const monthSales = quantitySince(startOfMonth);
        // نتنبأ من اليوم والأسبوع والشهر معًا، ونأخذ أعلى معدل طلب
        // حتى تتجاوب التوصية مع الارتفاع السريع في المبيعات.
        const todayDailyRate = todaySales;
        const weekDailyRate = weekSales / 7;
        const monthDailyRate = monthSales / Math.max(1, nowSaudiParts.day);
        const dailyDemand = Math.max(todayDailyRate, weekDailyRate, monthDailyRate);
        const stockCoverageDays = dailyDemand > 0 ? stockQuantity / dailyDemand : null;
        const targetStockFor30Days = Math.ceil(dailyDemand * 30);
        const recommendedOrderQuantity = Math.max(targetStockFor30Days - stockQuantity, 0);
        const latestDate = salesOrderItems.map(entry => new Date(entry.order.created_at)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a)[0];
        const daysSinceLatest = latestDate ? Math.max(0, Math.floor((now - latestDate) / 86400000)) : null;
        const { data: shortagesData, error: shortagesError } = await supabaseClient.rpc("list_warehouse_shortages", { p_warehouse: selectedWarehouse });
        if (shortagesError) console.warn("تعذر تحميل الطلبات المهدرة:", shortagesError);
        const wastedRequests = (Array.isArray(shortagesData) ? shortagesData : []).filter(item => shortageItemMatches(shortage, item));
        const box = modal.querySelector(".shortage-product-stats-box");
        if (!box) return;
        box.innerHTML = `<button type="button" class="shortage-stats-close" data-close>×</button>
            <header class="shortage-stats-head"><div><span>تفاصيل الصنف · F4</span><h2>${transferText(shortageItemName(shortage))}</h2><p class="shortage-last-movement">آخر حركة: <b>${latestDate ? customerOrderDate(latestDate) : "لا توجد"}</b>${daysSinceLatest === null ? "" : ` · منذ ${daysSinceLatest} يوم`}</p><p>رقم الصنف: <b>${transferText(shortage.product_code || "—")}</b> · مخزن ${transferText(selectedWarehouse || "—")}</p></div><div class="shortage-stats-stock"><span>كمية المخزون</span><strong>${stockQuantity}</strong></div></header>
            <div class="shortage-stats-grid">
                ${shortageStatsMetric("المتاح بالمخزون", `${stockQuantity} قطعة`, matchedProducts.length ? `${matchedProducts.length} نسخة مطابقة` : "لم نجد نسخة مطابقة")}
                ${shortageStatsMetric("طلبات قيد المتابعة", `${pendingUnits} قطعة`, "جديد، مقدم، قيد التجهيز أو تم الشحن")}
                ${shortageStatsMetric("عدد التحضيرات", `${invoiceCount}`, "تم الشحن أو تم التسليم")}
                ${shortageStatsMetric("إجمالي المبيعات", `${totalUnits} قطعة`, "من التحضيرات المشحونة أو المسلّمة")}
                ${shortageStatsMetric("مبيعات اليوم", `${todaySales} قطعة`)}
                ${shortageStatsMetric("مبيعات الأسبوع", `${weekSales} قطعة`)}
                ${shortageStatsMetric("مبيعات الشهر", `${monthSales} قطعة`)}
                ${shortageStatsMetric("الطلبات المهدرة", `${wastedRequests.length} مرة`, "عدد مرات الضغط على غير متوفر")}
            </div>
            <section class="shortage-forecast"><div><span>تحليل طلب الشراء</span><h3>${stockCoverageDays === null ? "لا توجد مبيعات كافية لحساب مدة التغطية" : `المخزون يكفي تقريبًا ${stockCoverageDays.toFixed(1)} يوم`}</h3><p>معدل التوقع اليومي: <b>${dailyDemand.toFixed(2)} قطعة</b> — أعلى معدل بين اليوم (${todayDailyRate.toFixed(2)}) والأسبوع (${weekDailyRate.toFixed(2)}) والشهر (${monthDailyRate.toFixed(2)}). هدف التغطية: 30 يومًا.</p></div><div class="shortage-forecast-order"><span>${recommendedOrderQuantity ? "كمية الطلب المقترحة" : "لا تحتاج طلب الآن"}</span><strong>${recommendedOrderQuantity}</strong><small>قطعة</small></div></section>
            <footer class="shortage-stats-footer">${isShortageView ? `الكمية المطلوبة في النواقص: <strong>${Number(shortage.quantity || 0)} قطعة</strong>` : "تم فتح التحليل من صفحة المنتجات."}</footer>`;
        box.querySelector("[data-close]")?.addEventListener("click", close);
    } catch (error) {
        console.error("Shortage product stats error:", error);
        const target = modal.querySelector(".shortage-product-stats-box");
        if (target) target.innerHTML = `<button type="button" class="shortage-stats-close" data-close>×</button><div class="message error">تعذر تحميل تفاصيل الصنف: ${transferText(error.message)}</div>`;
        target?.querySelector("[data-close]")?.addEventListener("click", close);
    }
}

document.addEventListener("keydown", event => {
    if (event.key !== "F4" || shortagesAdmin?.style.display === "none") return;
    event.preventDefault();
    openShortageProductStats();
});

document.getElementById("requestShortagesTransfer")?.addEventListener("click", async () => {
    const selectedGroupIndexes = [...document.querySelectorAll("[data-shortage-group]:checked")].map(input => Number(input.dataset.shortageGroup));
    const selectedItems = adminShortageGroups.filter((item, index) => selectedGroupIndexes.includes(index));
    if (!selectedItems.length) { alert("حدد صنفًا واحدًا على الأقل من النواقص."); return; }
    // نختار تلقائياً المخزن الذي يملك أكبر مجموع من كميات الأصناف المحددة.
    const productCodes = [...new Set(selectedItems.map(item => item.product_code).filter(Boolean))];
    const { data: candidates, error: candidatesError } = productCodes.length
        ? await supabaseClient.from("products").select("warehouse, product_code, company, model, color, quantity").in("product_code", productCodes).gt("quantity", 0)
        : { data: [], error: null };
    if (candidatesError) { alert(`تعذر تحديد المخزن الأنسب: ${candidatesError.message}`); return; }
    const warehouseScores = new Map();
    (candidates || []).forEach(product => {
        if (product.warehouse === selectedWarehouse) return;
        const shortage = selectedItems.find(item => String(item.product_code || "") === String(product.product_code || "") && String(item.company || "") === String(product.company || "") && String(item.model || "") === String(product.model || "") && String(item.color || "") === String(product.color || ""));
        if (shortage) warehouseScores.set(product.warehouse, (warehouseScores.get(product.warehouse) || 0) + Number(product.quantity || 0));
    });
    const bestSourceWarehouse = [...warehouseScores.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || "";
    transfersButton?.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    if (bestSourceWarehouse && transferSourceWarehouse) {
        transferSourceWarehouse.value = bestSourceWarehouse;
        await loadTransferSourceProducts();
    }
    transferDraft = [];
    selectedItems.forEach(shortage => {
        const product = transferSourceProducts.find(item => String(item.product_code || "") === String(shortage.product_code || "") && String(item.company || "") === String(shortage.company || "") && String(item.model || "") === String(shortage.model || "") && String(item.color || "") === String(shortage.color || ""));
        if (!product) return;
        transferDraft.push({ product_id: product.id, shortage_id: shortage.shortage_ids?.[0] || shortage.id, shortage_ids: shortage.shortage_ids || [shortage.id], product_code: product.product_code, company: product.company, model: product.model, color: product.color, name: [product.company, product.type || product.product_type, product.model, product.color].filter(Boolean).join(" · "), quantity: Math.min(Number(shortage.quantity || 1), Number(product.quantity || 0)), source_warehouse: transferSourceWarehouse.value, destination_warehouse: transferDestinationWarehouse.value, source_quantity: Number(product.quantity || 0), destination_quantity: Number(product.destination_quantity || 0) });
    });
    renderTransferDraft();
    setTransferMessage(transferDraft.length ? "تمت إضافة النواقص المتوفرة إلى مسودة التحويل. عدّل الكميات ثم أرسل الطلب." : "لم نجد هذه الأصناف في المخزن المصدر المختار. اختر مخزن مصدر آخر.", !transferDraft.length);
});

shortagesButton?.addEventListener("click", async () => {
    ["adminPage", "productsAdmin", "ordersAdmin", "customersAdmin", "categoriesAdmin", "transfersAdmin", "accountsAdmin", "driversAdmin", "salesAdmin", "offersAdmin"].forEach(id => { const page = document.getElementById(id); if (page) page.style.display = "none"; });
    shortagesAdmin.style.display = "block";
    await loadAdminShortages();
});
document.getElementById("backFromShortages")?.addEventListener("click", () => { shortagesAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
["dashboardButton", "productsButton", "ordersButton", "customersButton", "categoriesButton", "transfersButton", "accountsButton", "driversButton", "salesButton", "offersButton"].forEach(id => document.getElementById(id)?.addEventListener("click", () => {
    if (shortagesAdmin) shortagesAdmin.style.display = "none";
}));
document.getElementById("backFromCustomers")?.addEventListener("click", () => { customersAdmin.style.display = "none"; document.getElementById("adminPage").style.display = "block"; });
adminCustomerSearch?.addEventListener("input", renderAdminCustomers);
document.getElementById("refreshAdminCustomers")?.addEventListener("click", loadAdminCustomers);
[
    "dashboardButton", "productsButton", "ordersButton", "categoriesButton", "transfersButton", "accountsButton", "driversButton", "salesButton", "offersButton"
].forEach(id => document.getElementById(id)?.addEventListener("click", () => { if (customersAdmin) customersAdmin.style.display = "none"; }));


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

function toggleAdminOrderItems(orderId) {
    const items = document.getElementById(`admin-order-items-${orderId}`);
    const button = document.querySelector(`[data-order-toggle="${orderId}"]`);
    if (!items || !button) return;
    const willShow = items.hidden;
    items.hidden = !willShow;
    button.setAttribute("aria-expanded", String(willShow));
    const count = items.querySelectorAll(".admin-order-item").length;
    button.textContent = willShow ? "إخفاء المنتجات" : `عرض المنتجات (${count})`;
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
                timeZone: "Asia/Riyadh",
                dateStyle: "medium",
                timeStyle: "short"
            });


    let productsHTML = "";

    const totalPieces = (items || []).reduce(
        (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
        0
    );


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
        class="open-invoice-button"
        onclick="openInvoice(${order.id})"
    >
        👁 فتح التحضير
    </button>

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
                    value="مقدم"
                    ${isSubmittedOrder(order) ? "selected" : ""}
                >
                    مقدم
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


        <button type="button" class="admin-order-items-toggle" onclick="toggleAdminOrderItems(${order.id})" aria-expanded="false" data-order-toggle="${order.id}">
            عرض المنتجات (${items.length})
        </button>

        <div class="admin-order-items" id="admin-order-items-${order.id}" hidden>

            ${productsHTML}

        </div>


        <div class="admin-order-bottom">

            <div class="admin-order-total-summary">
                <strong>الإجمالي</strong>
                <small>إجمالي كمية القطع: ${totalPieces} قطعة</small>
            </div>

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
        const printProductKey = item => [item.product_code, item.company, item.model, item.product_type, item.type]
            .map(value => String(value ?? "").trim()).join("\u001f");
        const hasDifferentColorItems = items.some(item => String(item.color || "").trim() === "ألوان مختلفة");
        const availableColorsByProduct = new Map();
        const preparedQuantityByProductId = new Map();
        const specialItemCountByProduct = new Map();
        items.filter(item => String(item.color || "").trim() === "ألوان مختلفة").forEach(item => {
            const productId = String(item.product_id || "");
            if (productId) preparedQuantityByProductId.set(productId, (preparedQuantityByProductId.get(productId) || 0) + Number(item.quantity || 0));
            const productKey = printProductKey(item);
            specialItemCountByProduct.set(productKey, (specialItemCountByProduct.get(productKey) || 0) + 1);
        });

        // ألوان «ألوان مختلفة» لا تُخزن داخل التحضير، لذا نجلب الألوان المتوفرة
        // حاليًا في مخزن الطلب لتظهر للمحضّر كقائمة تجهيز.
        if (hasDifferentColorItems) {
            const productCodes = [...new Set(items
                .filter(item => String(item.color || "").trim() === "ألوان مختلفة")
                .map(item => String(item.product_code || "").trim()).filter(Boolean))];
            if (productCodes.length) {
                const { data: variants, error: variantsError } = await supabaseClient
                    .from("products")
                    .select("id, product_code, company, model, product_type, type, color, quantity")
                    .eq("warehouse", order.warehouse)
                    .in("product_code", productCodes);
                if (variantsError) console.warn("تعذر جلب ألوان التحضير:", variantsError);
                (variants || []).forEach(product => {
                    const color = String(product.color || "").trim();
                    if (!color) return;
                    const key = printProductKey(product);
                    const colors = availableColorsByProduct.get(key) || [];
                    const preparedQuantity = specialItemCountByProduct.get(key) === 1
                        ? 0
                        : Number(preparedQuantityByProductId.get(String(product.id)) || 0);
                    // يظهر اللون إن كان متاحًا أو جرى تحضيره حتى لو أصبح رصيده صفرًا بعد الخصم.
                    if (Number(product.quantity || 0) <= 0 && preparedQuantity <= 0) return;
                    const existingColor = colors.find(item => item.color === color);
                    if (existingColor) existingColor.preparedQuantity += preparedQuantity;
                    else colors.push({ color, preparedQuantity });
                    availableColorsByProduct.set(key, colors);
                });
            }
        }
        // ترتيب الطباعة: الشركة ثم النوع ثم الموديل ثم اللون، ليأتي كل موديل متشابه متتابعًا.
        const printItems = [...items].sort((first, second) => {
            const firstKey = [first.company, first.product_type, first.type, first.model, first.color].filter(Boolean).join(" ");
            const secondKey = [second.company, second.product_type, second.type, second.model, second.color].filter(Boolean).join(" ");
            return firstKey.localeCompare(secondKey, "ar-SA", { numeric: true, sensitivity: "base" });
        });
        // للطباعة فقط: ندمج السطور المتطابقة في كل شيء عدا اللون. بهذا تبقى
        // حركة المخزون منفصلة حسب اللون، لكن التحضير لا يكرر نفس المنتج عشرات المرات.
        const groupedPrintMap = new Map();
        printItems.forEach(item => {
            const groupKey = [
                item.product_code, item.category, item.product_type, item.type,
                item.company, item.model, item.storage_location, Number(item.price || 0),
                // اللون المحدد يبقى في صف مستقل؛ فقط «ألوان مختلفة» تُدمج للطباعة.
                String(item.color || "").trim() === "ألوان مختلفة" ? "ألوان مختلفة" : String(item.color || "").trim()
            ].map(value => String(value ?? "")).join("\u001f");
            const group = groupedPrintMap.get(groupKey) || {
                ...item,
                quantity: 0,
                colors: [],
                hasDifferentColors: false,
                availableColors: availableColorsByProduct.get(printProductKey(item)) || []
            };
            group.quantity += Number(item.quantity || 1);
            const color = String(item.color || "").trim();
            if (color && !group.colors.includes(color)) group.colors.push(color);
            if (color === "ألوان مختلفة") group.hasDifferentColors = true;
            groupedPrintMap.set(groupKey, group);
        });
        const groupedPrintItems = [...groupedPrintMap.values()].map(item => ({
            ...item,
            color: item.colors.length ? item.colors.join("، ") : "-"
        }));
        // عمود التحضير مخصص لخيار «ألوان مختلفة» فقط.
        const shouldShowColorChecklist = hasDifferentColorItems;


        const date =
            new Date(order.created_at)
                .toLocaleString(
                    "ar-SA",
                    {
                        timeZone: "Asia/Riyadh",
                        dateStyle: "medium",
                        timeStyle: "short"
                    }
                );


        let rowsHTML = "";


        const typeCodes = {};

(groupedPrintItems || []).forEach(item => {

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


        (groupedPrintItems || []).forEach(
            (item, index) => {

                const quantity =
                    Number(item.quantity || 1);


                const price =
                    Number(item.price || 0);


                const total =
                    quantity * price;

                const checklistColors = item.hasDifferentColors ? item.availableColors : [];
                const preparationColors = checklistColors.length
                    ? `<div class="preparation-colors">${checklistColors.map(item => `<span class="preparation-color"><b>${item.color}</b><i>${item.preparedQuantity > 0 ? item.preparedQuantity : ""}</i></span>`).join("")}</div>`
                    : (item.hasDifferentColors ? '<span class="preparation-no-colors">لا توجد ألوان متوفرة</span>' : "-");


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

                        ${shouldShowColorChecklist ? `<td class="preparation-colors-cell">${preparationColors}</td>` : ""}

                        <td>
                            ${item.storage_location || "غير محدد"}
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

        .preparation-colors-cell {
            width: 170px;
            padding: 5px !important;
        }

        .preparation-colors {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            justify-content: center;
        }

        .preparation-color {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 3px 4px;
            border: 1px solid #bbb;
            border-radius: 3px;
            font-size: 9px;
            white-space: nowrap;
        }

        .preparation-color b { font-weight: normal; }

        .preparation-color i {
            display: inline-block;
            width: 15px;
            height: 15px;
            border: 1px solid #111;
            background: #fff;
        }

        .preparation-no-colors { color: #666; font-size: 9px; }


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

                ${shouldShowColorChecklist ? '<th class="preparation-colors-cell">الألوان</th>' : ""}

                <th>
                    موقع القطعة
                </th>

                <th>
                    الكمية
                </th>

                <th>
                    سعر الوحدة
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

// يفتح نموذج التحضير الموحد من قائمة الطلبات أو تقرير المبيعات.
window.openInvoice = function (orderId) {
    editOrder(orderId);
};

window.printEditingOrder = function () {
    if (!editingOrderId) return;
    printOrder(editingOrderId);
};
let editingOrderItems = [];
let editingDifferentColorGroups = [];

function editDifferentColorGroupKey(item) {
    return [item.product_code, item.company, item.model, item.product_type, item.type]
        .map(value => String(value ?? "").trim()).join("\u001f");
}

// يبني ألوان التحضير لخيار «ألوان مختلفة» من مخزون نفس الطلب.
async function loadEditDifferentColorGroups(order) {
    const specialItems = editingOrderItems.filter(item => String(item.color || "").trim() === "ألوان مختلفة");
    editingDifferentColorGroups = [];
    if (!specialItems.length) return;

    const codes = [...new Set(specialItems.map(item => String(item.product_code || "").trim()).filter(Boolean))];
    const { data: products, error } = codes.length
        ? await supabaseClient.from("products")
            .select("id, product_code, category, product_type, type, company, model, color, quantity, price, image")
            .eq("warehouse", order.warehouse).in("product_code", codes)
        : { data: [], error: null };
    if (error) console.warn("تعذر جلب ألوان التحضير للتعديل:", error);

    const groups = new Map();
    specialItems.forEach(item => {
        const key = editDifferentColorGroupKey(item);
        const group = groups.get(key) || { key, template: item, quantities: new Map(), variants: [], sourceItems: [] };
        group.quantities.set(String(item.product_id), (group.quantities.get(String(item.product_id)) || 0) + Number(item.quantity || 0));
        group.sourceItems.push(item);
        groups.set(key, group);
    });
    (products || []).forEach(product => {
        const group = groups.get(editDifferentColorGroupKey(product));
        if (group && String(product.color || "").trim()) group.variants.push(product);
    });
    editingDifferentColorGroups = [...groups.values()].map(group => {
        // السطر الواحد يعني أن المندوب لم يوزع الألوان بعد؛ نعرض المربعات فارغة.
        group.isPendingDistribution = group.sourceItems.length === 1;
        group.targetQuantity = group.sourceItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        if (group.isPendingDistribution) group.quantities = new Map();
        return group;
    });
}

function setEditPreparedColorQuantity(group, product, value) {
    if (!group || !product) return;
    if (group.isPendingDistribution) {
        editingOrderItems = editingOrderItems.filter(item => !(
            String(item.color || "").trim() === "ألوان مختلفة" &&
            editDifferentColorGroupKey(item) === group.key
        ));
        group.quantities = new Map();
        group.isPendingDistribution = false;
    }
    const quantity = Math.max(0, Number.parseInt(value, 10) || 0);
    const itemIndex = editingOrderItems.findIndex(item =>
        editDifferentColorGroupKey(item) === group.key &&
        String(item.product_id) === String(product.id)
    );
    if (quantity === 0) {
        if (itemIndex >= 0) editingOrderItems.splice(itemIndex, 1);
        group.quantities.delete(String(product.id));
    } else if (itemIndex >= 0) {
        editingOrderItems[itemIndex].quantity = quantity;
        group.quantities.set(String(product.id), quantity);
    } else {
        editingOrderItems.push({
            ...group.template,
            id: null,
            product_id: product.id,
            product_code: product.product_code,
            category: product.category,
            product_type: product.product_type,
            type: product.type,
            company: product.company,
            model: product.model,
            // بعد أن يحدد المحضّر الكمية، يصبح هذا صف اللون الحقيقي في التحضير.
            color: product.color,
            quantity,
            price: Number(product.price ?? group.template.price ?? 0),
            image: product.image || group.template.image || null
        });
        group.quantities.set(String(product.id), quantity);
    }
}

window.changeEditPreparedColorQuantity = function (groupIndex, productId, value) {
    const group = editingDifferentColorGroups[groupIndex];
    const product = group?.variants.find(item => String(item.id) === String(productId));
    setEditPreparedColorQuantity(group, product, value);
    renderEditOrderItems();
};

// الكمية الإجمالية لصنف «ألوان مختلفة» قابلة للتعديل أيضاً، وليست مقصورة
// على مربعات الألوان. إن كان الصنف لم يُوزّع بعد نحدّث السطر مباشرة؛ وبعد
// التوزيع تبقى الكمية المطلوبة مرجعاً ويُطلب من المحضّر تعديل الألوان حتى
// يساوي مجموعها هذه الكمية.
window.changeEditDifferentColorGroupQuantity = function (groupIndex, value) {
    const group = editingDifferentColorGroups[groupIndex];
    if (!group) return;

    const quantity = Math.max(1, Number.parseInt(value, 10) || 1);
    group.targetQuantity = quantity;

    if (group.isPendingDistribution) {
        const sourceItem = editingOrderItems.find(item =>
            String(item.color || "").trim() === "ألوان مختلفة" &&
            editDifferentColorGroupKey(item) === group.key
        );
        if (sourceItem) sourceItem.quantity = quantity;
    }

    renderEditOrderItems();
};

window.removeEditDifferentColorGroup = function (groupIndex) {
    const group = editingDifferentColorGroups[groupIndex];
    if (!group) return;
    if (!confirm("هل تريد حذف هذا الصنف من التحضير؟")) return;
    editingOrderItems = editingOrderItems.filter(item => !(
        String(item.color || "").trim() === "ألوان مختلفة" &&
        editDifferentColorGroupKey(item) === group.key
    ));
    editingDifferentColorGroups.splice(groupIndex, 1);
    renderEditOrderItems();
};

window.markEditDifferentColorGroupUnavailable = async function (groupIndex) {
    const group = editingDifferentColorGroups[groupIndex];
    if (!group || !editingOrderId) return;
    if (!confirm("سيُنقل الصنف إلى صفحة النواقص ويُحذف من التحضير. متابعة؟")) return;
    const quantity = group.isPendingDistribution
        ? Number(group.targetQuantity || 0)
        : [...group.quantities.values()].reduce((sum, value) => sum + Number(value || 0), 0);
    const { error } = await supabaseClient.rpc("report_order_shortage", {
        p_order_id: editingOrderId,
        p_item: { ...group.template, quantity: Math.max(1, quantity) }
    });
    if (error) { alert(`تعذر تسجيل النقص: ${error.message}`); return; }
    editingOrderItems = editingOrderItems.filter(item => !(
        String(item.color || "").trim() === "ألوان مختلفة" &&
        editDifferentColorGroupKey(item) === group.key
    ));
    editingDifferentColorGroups.splice(groupIndex, 1);
    renderEditOrderItems();
    editOrderMessage.textContent = "تم نقل الصنف إلى النواقص. احفظ التعديلات لتحديث التحضير.";
    editOrderMessage.style.color = "#2e9d69";
};


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

function setEditOrderViewMode(viewOnly) {
    if (!editOrderModal) return;
    editOrderModal.classList.toggle("invoice-view-only", viewOnly);
    const title = editOrderModal.querySelector(".edit-order-header h2");
    if (title) title.textContent = viewOnly ? "عرض التحضير" : "تعديل الطلب";
    if (addOrderItemButton) addOrderItemButton.style.display = viewOnly ? "none" : "";
    if (saveOrderEditButton) saveOrderEditButton.style.display = viewOnly ? "none" : "";
    if (cancelOrderEditButton) cancelOrderEditButton.textContent = viewOnly ? "إغلاق" : "إلغاء";
    editOrderModal.querySelectorAll(".edit-order-field input, #editOrderItems input").forEach(input => {
        input.readOnly = viewOnly || input.hasAttribute("readonly");
        input.disabled = false;
    });
    editOrderModal.querySelectorAll("#editOrderItems button").forEach(button => {
        button.style.display = viewOnly ? "none" : "";
    });
}

// من سجل العميل: نفس شاشة تعديل التحضير، لكنها مقفلة بالكامل للعرض والطباعة فقط.
async function openCustomerOrderView(orderId) {
    await editOrder(orderId);
    if (editOrderModal?.style.display === "flex") setEditOrderViewMode(true);
}


/* =========================================================
   فتح تعديل الطلب
========================================================= */

async function editOrder(orderId) {

    try {

        editOrderMessage.textContent = "";
        setEditOrderViewMode(false);

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

        await loadEditDifferentColorGroups(order);


        renderEditOrderItems();


        /* =========================
           فتح النافذة
        ========================= */

        editOrderModal.style.display =
            "flex";

        // تبدو شاشة التعديل كصفحة مستقلة كاملة، مع عنوان قابل للرجوع في المتصفح.
        editOrderModal.classList.add("edit-order-page");
        if (!new URLSearchParams(window.location.search).get("editOrder")) {
            const url = new URL(window.location.href);
            url.searchParams.set("editOrder", String(order.id));
            window.history.pushState({ editOrder: order.id }, "", url);
        }


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

    // نفس ترتيب الطباعة حتى يرى الموظف التحضير بالطريقة نفسها قبل حفظه:
    // الشركة، نوع المنتج، النوع، الموديل، ثم اللون.
    editingOrderItems.sort((first, second) => {
        const firstKey = [first.company, first.product_type, first.type, first.model, first.color]
            .filter(Boolean).join(" ");
        const secondKey = [second.company, second.product_type, second.type, second.model, second.color]
            .filter(Boolean).join(" ");
        return firstKey.localeCompare(secondKey, "ar-SA", { numeric: true, sensitivity: "base" });
    });


    if (!editingOrderItems.length && !editingDifferentColorGroups.length) {

        editOrderItems.innerHTML = `

            <div class="message">

                لا توجد منتجات في الطلب

            </div>

        `;

        calculateEditOrderTotal();

        return;

    }


    const visibleItems = editingOrderItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => String(item.color || "").trim() !== "ألوان مختلفة");

    visibleItems.forEach(
        ({ item, index }) => {

            const row =
                document.createElement("div");

            row.className =
                "edit-order-item";


            row.innerHTML = `

                <div class="edit-order-item-grid">

                    <div class="edit-order-item-field">
                        <label>كود المنتج</label>
                        <input type="text" value="${escapeHtmlAttribute(item.product_code || "")}" readonly>
                    </div>

                    <div class="edit-order-item-field">
                        <label>التصنيف</label>
                        <input type="text" value="${escapeHtmlAttribute(item.category || "")}" readonly>
                    </div>

                    <div class="edit-order-item-field">
                        <label>نوع المنتج</label>
                        <input type="text" value="${escapeHtmlAttribute(item.product_type || "")}" readonly>
                    </div>

                    <div class="edit-order-item-field">
                        <label>النوع</label>
                        <input type="text" value="${escapeHtmlAttribute(item.type || "")}" readonly>
                    </div>

                    <div class="edit-order-item-field">
                        <label>الماركة</label>
                        <input type="text" value="${escapeHtmlAttribute(item.company || "")}" readonly>
                    </div>

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
                            سعر الوحدة
                        </label>

                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value="${Number(item.price || 0)}"
                            onchange="changeEditOrderItem(${index}, 'price', this.value)"
                        >

                    </div>

                    <div class="edit-order-item-field">
                        <label>الإجمالي</label>
                        <input id="editOrderItemTotal-${index}" type="text" value="${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)} ر.س" readonly>
                    </div>


                    <button
                        type="button"
                        class="remove-order-item"
                        onclick="removeEditOrderItem(${index})"
                    >
                        🗑️
                    </button>

                    <button type="button" class="mark-unavailable-item" onclick="markEditOrderItemUnavailable(${index})">غير متوفر</button>

                </div>

            `;


            editOrderItems.appendChild(row);

        }
    );

    // لا نكرر عناصر «ألوان مختلفة» كسطور كثيرة؛ تظهر كجدول تجهيز واضح
    // فيه لون كل نسخة وخانة كمية مستقلة لها.
    editingDifferentColorGroups.forEach((group, groupIndex) => {
        const section = document.createElement("section");
        section.className = "edit-preparation-colors";
        const title = [group.template.company, group.template.model, group.template.type || group.template.product_type]
            .filter(Boolean).join(" · ");
        section.innerHTML = `<div class="edit-preparation-colors-title"><strong>ألوان مختلفة — ${escapeHtmlAttribute(title || group.template.product_code || "منتج")}</strong><span>اكتب الكمية التي تم تجهيزها من كل لون</span></div>
            <div class="edit-preparation-colors-grid">${group.variants.length
                ? group.variants.map(product => `<label><span>${escapeHtmlAttribute(product.color)}</span><input type="number" min="0" inputmode="numeric" value="${Number(group.quantities.get(String(product.id)) || 0)}" onchange="changeEditPreparedColorQuantity(${groupIndex}, ${Number(product.id)}, this.value)"><small>المتاح الآن: ${Number(product.quantity || 0)}</small></label>`).join("")
                : '<p>لا توجد ألوان متاحة لهذا الصنف في المخزون.</p>'}</div>`;
        editOrderItems.appendChild(section);
    });


    calculateEditOrderTotal();

}

// عرض التحضير في جدول أعمدة واضح داخل صفحة التعديل بدل بطاقات ضيقة.
renderEditOrderItems = function () {
    const normalItems = editingOrderItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => String(item.color || "").trim() !== "ألوان مختلفة");

    const invoiceSortKey = item => [item.company, item.product_type, item.type, item.model, item.color]
        .filter(Boolean).join(" ");
    const tableRows = normalItems.map(({ item, index }) => `
        <tr data-edit-sort="${escapeHtmlAttribute(invoiceSortKey(item))}">
            <td>${index + 1}</td><td>${escapeHtmlAttribute(item.product_code || "-")}</td><td><input value="${escapeHtmlAttribute(item.category || "")}" onchange="changeEditOrderItem(${index}, 'category', this.value)"></td>
            <td><input value="${escapeHtmlAttribute(item.product_type || "")}" onchange="changeEditOrderItem(${index}, 'product_type', this.value)"></td><td><input value="${escapeHtmlAttribute(item.type || "")}" onchange="changeEditOrderItem(${index}, 'type', this.value)"></td>
            <td><input value="${escapeHtmlAttribute(item.company || "")}" onchange="changeEditOrderItem(${index}, 'company', this.value)"></td>
            <td><input value="${escapeHtmlAttribute(item.model || "")}" onchange="changeEditOrderItem(${index}, 'model', this.value)"></td>
            <td><input value="${escapeHtmlAttribute(item.color || "")}" onchange="changeEditOrderItem(${index}, 'color', this.value)"></td>
            <td>—</td><td>${escapeHtmlAttribute(item.storage_location || "غير محدد")}</td>
            <td><input type="number" min="1" value="${Number(item.quantity || 1)}" onchange="changeEditOrderItem(${index}, 'quantity', this.value)"></td>
            <td><input type="number" min="0" step="0.01" value="${Number(item.price || 0)}" onchange="changeEditOrderItem(${index}, 'price', this.value)"></td>
            <td>${(Number(item.quantity || 1) * Number(item.price || 0)).toFixed(2)} ر.س</td>
            <td class="invoice-edit-actions"><button type="button" onclick="removeEditOrderItem(${index})">حذف</button><button type="button" onclick="markEditOrderItemUnavailable(${index})">غير متوفر</button></td>
        </tr>`).join("");

    const specialRows = editingDifferentColorGroups.map((group, groupIndex) => {
        const item = group.template;
        const title = [item.company, item.model, item.type || item.product_type].filter(Boolean).join(" · ");
        const selectedTotal = group.isPendingDistribution
            ? Number(group.targetQuantity || 0)
            : [...group.quantities.values()].reduce((sum, quantity) => sum + Number(quantity || 0), 0);
        const colors = group.variants.map(product => escapeHtmlAttribute(product.color)).join("، ") || "لا توجد ألوان";
        return `<tr class="different-colors-invoice-row" data-edit-sort="${escapeHtmlAttribute(invoiceSortKey(item))}"><td>—</td><td>${escapeHtmlAttribute(item.product_code || "-")}</td><td>${escapeHtmlAttribute(item.category || "-")}</td>
            <td>${escapeHtmlAttribute(item.product_type || "-")}</td><td>${escapeHtmlAttribute(item.type || "-")}</td><td>${escapeHtmlAttribute(item.company || "-")}</td>
            <td>${escapeHtmlAttribute(item.model || "-")}</td><td><strong>ألوان مختلفة</strong></td>
            <td><span class="prepared-colors-preview">${colors}</span><button type="button" class="edit-prepared-colors-button" onclick="openEditPreparedColors(${groupIndex})">تعديل</button></td>
            <td>${escapeHtmlAttribute(item.storage_location || "غير محدد")}</td><td><input type="number" min="1" value="${Number(group.targetQuantity || selectedTotal || 1)}" onchange="changeEditDifferentColorGroupQuantity(${groupIndex}, this.value)" title="الكمية الإجمالية المطلوبة"></td><td>${Number(item.price || 0).toFixed(2)} ر.س</td>
            <td>${(Number(group.targetQuantity || selectedTotal) * Number(item.price || 0)).toFixed(2)} ر.س</td>
            <td class="invoice-edit-actions"><button type="button" onclick="removeEditDifferentColorGroup(${groupIndex})">حذف</button><button type="button" onclick="markEditDifferentColorGroupUnavailable(${groupIndex})">غير متوفر</button></td></tr>`;
    }).join("");

    editOrderItems.innerHTML = `<div class="edit-invoice-table-wrap"><table class="edit-invoice-table"><thead><tr>
        <th>#</th><th>رقم المنتج</th><th>التصنيف</th><th>نوع المنتج</th><th>النوع</th><th>الشركة</th><th>الموديل</th><th>اللون</th><th>الألوان</th><th>موقع القطعة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>إجراءات</th>
    </tr></thead><tbody>${tableRows}${specialRows || ""}${!tableRows && !specialRows ? '<tr><td colspan="14">لا توجد منتجات في الطلب.</td></tr>' : ""}</tbody></table></div>`;
    const invoiceBody = editOrderItems.querySelector("tbody");
    if (invoiceBody) {
        [...invoiceBody.querySelectorAll("tr[data-edit-sort]")]
            .sort((first, second) => String(first.dataset.editSort || "").localeCompare(String(second.dataset.editSort || ""), "ar-SA", { numeric: true, sensitivity: "base" }))
            .forEach(row => invoiceBody.appendChild(row));
    }
    calculateEditOrderTotal();
};

window.openEditPreparedColors = function (groupIndex) {
    const group = editingDifferentColorGroups[groupIndex];
    if (!group) return;
    document.getElementById("editPreparedColorsDialog")?.remove();
    const title = [group.template.company, group.template.model, group.template.type || group.template.product_type].filter(Boolean).join(" · ");
    const dialog = document.createElement("div");
    dialog.id = "editPreparedColorsDialog";
    dialog.className = "edit-prepared-colors-dialog";
    dialog.innerHTML = `<div class="edit-prepared-colors-dialog-box"><button type="button" class="edit-prepared-colors-close" data-close>×</button><h3>ألوان مختلفة — ${escapeHtmlAttribute(title || group.template.product_code)}</h3><p>وزّع الكمية المطلوبة (${Number(group.targetQuantity || 0)} قطعة) على الألوان التالية.</p><div class="edit-prepared-colors-dialog-grid">${group.variants.map(product => `<label><span>${escapeHtmlAttribute(product.color)}</span><input data-product-id="${Number(product.id)}" type="number" min="0" inputmode="numeric" value="${Number(group.quantities.get(String(product.id)) || 0)}"><small>المتاح الآن: ${Number(product.quantity || 0)}</small></label>`).join("") || '<p>لا توجد ألوان لهذا الصنف.</p>'}</div><div class="edit-prepared-colors-dialog-actions"><button type="button" data-close>إلغاء</button><button type="button" class="save" data-save>حفظ كميات الألوان</button></div></div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.remove();
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
    dialog.querySelector("[data-save]")?.addEventListener("click", () => {
        const preparedTotal = [...dialog.querySelectorAll("[data-product-id]")]
            .reduce((sum, input) => sum + Math.max(0, Number(input.value || 0)), 0);
        if (preparedTotal !== Number(group.targetQuantity || 0)) {
            alert(`يجب أن يساوي مجموع الألوان الكمية المطلوبة: ${Number(group.targetQuantity || 0)} قطعة.`);
            return;
        }
        dialog.querySelectorAll("[data-product-id]").forEach(input => {
            const product = group.variants.find(item => String(item.id) === String(input.dataset.productId));
            if (product) setEditPreparedColorQuantity(group, product, input.value);
        });
        // بعد توزيع الكمية لا نُبقي صف «ألوان مختلفة»؛ تصبح الألوان صفوفاً مستقلة.
        editingDifferentColorGroups.splice(groupIndex, 1);
        renderEditOrderItems();
        close();
    });
};


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


    const itemTotalInput = document.getElementById(`editOrderItemTotal-${index}`);
    if (itemTotalInput) {
        const currentItem = editingOrderItems[index];
        itemTotalInput.value = `${(Number(currentItem.price || 0) * Number(currentItem.quantity || 1)).toFixed(2)} ر.س`;
    }


    calculateEditOrderTotal();
    renderEditOrderItems();

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

window.markEditOrderItemUnavailable = async function (index) {
    const item = editingOrderItems[index];
    if (!item || !editingOrderId) return;
    if (!confirm("سيُنقل الصنف إلى صفحة النواقص ويُحذف من التحضير. متابعة؟")) return;
    const { error } = await supabaseClient.rpc("report_order_shortage", { p_order_id: editingOrderId, p_item: item });
    if (error) { alert(`تعذر تسجيل النقص: ${error.message}`); return; }
    editingOrderItems.splice(index, 1);
    renderEditOrderItems();
    editOrderMessage.textContent = "تم نقل الصنف إلى النواقص. احفظ التعديلات لتحديث التحضير.";
    editOrderMessage.style.color = "#2e9d69";
};


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
            p_items: editingOrderItems.filter(item => Number(item.quantity || 0) > 0).map(item => ({
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

    editOrderModal.classList.remove("edit-order-page");

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has("editOrder")) {
        currentUrl.searchParams.delete("editOrder");
        window.history.replaceState({}, "", currentUrl);
    }

    const unmatchedColorDistribution = editingDifferentColorGroups.find(group => {
        if (group.isPendingDistribution) return false;
        const preparedTotal = [...group.quantities.values()]
            .reduce((sum, quantity) => sum + Number(quantity || 0), 0);
        return preparedTotal !== Number(group.targetQuantity || 0);
    });
    if (unmatchedColorDistribution) {
        alert(`مجموع كميات الألوان يجب أن يساوي الكمية الإجمالية المطلوبة (${Number(unmatchedColorDistribution.targetQuantity || 0)} قطعة). اضغط «تعديل» أمام الألوان لتوزيع الكمية.`);
        return;
    }

    document.body.style.overflow =
        "";

    editingOrderId = null;

    editingOrderItems = [];
    editingDifferentColorGroups = [];

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

            <div id="orderProductFilters" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:15px;">
                <select id="orderProductCompanyFilter" aria-label="تصفية حسب الماركة" style="min-width:0;padding:11px;border:1px solid #ddd;border-radius:10px;background:#fff;font-family:inherit;"></select>
                <select id="orderProductModelFilter" aria-label="تصفية حسب الموديل" disabled style="min-width:0;padding:11px;border:1px solid #ddd;border-radius:10px;background:#fff;font-family:inherit;"></select>
                <select id="orderProductColorFilter" aria-label="تصفية حسب اللون" disabled style="min-width:0;padding:11px;border:1px solid #ddd;border-radius:10px;background:#fff;font-family:inherit;"></select>
            </div>


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

    const searchInput = document.getElementById("orderProductSearch");
    const companyFilter = document.getElementById("orderProductCompanyFilter");
    const modelFilter = document.getElementById("orderProductModelFilter");
    const colorFilter = document.getElementById("orderProductColorFilter");
    const filterValue = (product, field) => String(product[field] || "").trim() || "__EMPTY__";
    const filterLabel = value => value === "__EMPTY__" ? "بدون تحديد" : value;
    const fillFilter = (select, values, placeholder, selectedValue = "") => {
        select.innerHTML = "";
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = placeholder;
        select.appendChild(defaultOption);
        [...new Set(values)].sort((a, b) => filterLabel(a).localeCompare(filterLabel(b), "ar-SA")).forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = filterLabel(value);
            option.selected = value === selectedValue;
            select.appendChild(option);
        });
    };
    const matchesSearch = product => {
        const search = String(searchInput.value || "").trim().toLowerCase();
        if (!search) return true;
        return [product.model, product.company, product.color, product.product_code, product.category, product.product_type, product.type]
            .filter(Boolean).join(" ").toLowerCase().includes(search);
    };
    const applyFilters = () => {
        const company = companyFilter.value;
        const model = modelFilter.value;
        const color = colorFilter.value;
        renderOrderProductList(products.filter(product =>
            (!company || filterValue(product, "company") === company) &&
            (!model || filterValue(product, "model") === model) &&
            (!color || filterValue(product, "color") === color) &&
            matchesSearch(product)
        ));
    };
    const refreshDependentFilters = () => {
        const company = companyFilter.value;
        const companyProducts = company ? products.filter(product => filterValue(product, "company") === company) : [];
        fillFilter(modelFilter, companyProducts.map(product => filterValue(product, "model")), company ? "كل الموديلات" : "اختر الماركة أولاً", modelFilter.value);
        modelFilter.disabled = !company;
        const model = modelFilter.value;
        const modelProducts = model ? companyProducts.filter(product => filterValue(product, "model") === model) : [];
        fillFilter(colorFilter, modelProducts.map(product => filterValue(product, "color")), model ? "كل الألوان" : "اختر الموديل أولاً", colorFilter.value);
        colorFilter.disabled = !model;
    };

    fillFilter(companyFilter, products.map(product => filterValue(product, "company")), "كل الماركات");
    refreshDependentFilters();
    applyFilters();

    companyFilter.addEventListener("change", () => {
        modelFilter.value = "";
        colorFilter.value = "";
        refreshDependentFilters();
        applyFilters();
    });
    modelFilter.addEventListener("change", () => {
        colorFilter.value = "";
        refreshDependentFilters();
        applyFilters();
    });
    colorFilter.addEventListener("change", applyFilters);
    searchInput.addEventListener("input", applyFilters);

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
