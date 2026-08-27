const detailParams = new URLSearchParams(window.location.search);
let detailVariants = [];
let selectedCompany = "";
let selectedModel = "";

// يحمي بيانات المنتج قبل عرضها داخل صفحة التفاصيل.
function escapeDetailHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
}

// يحدد مخزن عرض المنتج للحساب العادي، ويمنع فتح هذه الصفحة لحساب المندوب.
async function resolveDetailWarehouse() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return localStorage.getItem("customer_warehouse") || "الرياض";

    const { data: identity } = await supabaseClient.rpc("get_my_driver_identity");
    if (identity?.is_driver) {
        window.location.replace("products.html");
        return null;
    }

    return localStorage.getItem("customer_warehouse") || "الرياض";
}

// يجلب المنتج وكل ألوانه وموديلاته من مخزن المنطقة الحالية.
async function loadProductDetails() {
    const container = document.getElementById("productDetail");
    const warehouse = await resolveDetailWarehouse();
    if (!warehouse) return;

    const code = detailParams.get("code");
    const id = detailParams.get("id");
    if (!code && !id) {
        container.className = "detail-error";
        container.textContent = "لم يتم تحديد المنتج.";
        return;
    }

    let query = supabaseClient.from("products").select("*").eq("warehouse", warehouse);
    query = code ? query.eq("product_code", code) : query.eq("id", id);
    const { data, error } = await query.order("id", { ascending: true });

    if (error || !data?.length) {
        container.className = "detail-error";
        container.textContent = "هذا المنتج غير متوفر حاليًا في مخزن منطقتك.";
        return;
    }

    detailVariants = data;
    renderProductDetails(warehouse);
}

// يرسم واجهة التفاصيل ويعرض خصائص المنتج المتاحة دون كشف منتجات مخزن آخر.
function renderProductDetails(warehouse) {
    const container = document.getElementById("productDetail");
    const product = detailVariants[0];
    const productName = product.model || product.type || product.product_type || "منتج";
    const images = [...new Set(detailVariants.map(item => item.image).filter(Boolean))];
    const companies = [...new Set(detailVariants.map(item => String(item.company || "").trim()).filter(Boolean))];
    const totalStock = detailVariants.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    const description = [product.type || product.product_type, product.company, product.category]
        .filter(Boolean).join(" · ") || "منتج متوفر في متجر وسام سمارت.";

    document.getElementById("breadcrumbProduct").textContent = productName;
    container.className = "product-detail-layout";
    container.innerHTML = `
        <section class="detail-gallery">
            <div class="detail-main-image" id="detailMainImage">
                ${images[0] ? `<img src="${escapeDetailHtml(images[0])}" alt="${escapeDetailHtml(productName)}">` : '<span class="fallback">📱</span>'}
            </div>
            ${images.length > 1 ? `<div class="detail-thumbnails">${images.map((image, index) => `<button class="detail-thumbnail ${index === 0 ? "active" : ""}" type="button" data-image="${escapeDetailHtml(image)}"><img src="${escapeDetailHtml(image)}" alt="صورة المنتج ${index + 1}"></button>`).join("")}</div>` : ""}
        </section>
        <section class="detail-info">
            <span class="detail-label">متوفر في مخزن ${escapeDetailHtml(warehouse)}</span>
            <h1 class="detail-title">${escapeDetailHtml(productName)}</h1>
            <div class="detail-code">كود المنتج: ${escapeDetailHtml(product.product_code || "غير محدد")}</div>
            <div class="detail-price">${Number(product.price || 0).toFixed(2)} <small>ر.س</small></div>
            <div class="detail-summary">${escapeDetailHtml(description)}<br>اختر الماركة والموديل المناسبين ثم انتقل لاختيار اللون والكمية.</div>
            <div class="detail-options">
                <h2>اختيار المواصفات</h2>
                ${companies.length ? `<span class="option-label">الماركة</span><div class="option-chips" id="detailCompanies">${companies.map(company => `<button type="button" class="option-chip" data-company="${escapeDetailHtml(company)}">${escapeDetailHtml(company)}</button>`).join("")}</div>` : ""}
                <span class="option-label">الموديل</span>
                <div class="option-chips" id="detailModels"><span class="detail-choice-hint">اختر الماركة أولًا لعرض موديلاتها.</span></div>
            </div>
            <div class="stock-line" id="detailStock">المتوفر في هذا المخزن: <strong>${totalStock} قطعة</strong></div>
            <button class="detail-action" id="detailChooseButton" type="button">اختر اللون والكمية وأضف للسلة</button>
            <div class="benefits"><div class="benefit"><strong>🚚 شحن سريع</strong>حسب المنطقة</div><div class="benefit"><strong>🛡️ ضمان</strong>لجودة المنتج</div><div class="benefit"><strong>🔒 دفع آمن</strong>عند إتمام الطلب</div></div>
        </section>`;

    setupDetailInteractions();

    if (companies.length === 1) {
        selectedCompany = companies[0];
        document.querySelector("[data-company]")?.classList.add("active");
        renderDetailModels();
        updateDetailStock();
    }
}

// يحدّث الاختيارات وكمية المخزون المعروضة حسب الماركة والموديل المختارين.
function setupDetailInteractions() {
    document.querySelectorAll("[data-image]").forEach(button => button.addEventListener("click", () => {
        document.querySelectorAll(".detail-thumbnail").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        document.getElementById("detailMainImage").innerHTML = `<img src="${button.dataset.image}" alt="صورة المنتج">`;
    }));

    document.querySelectorAll("[data-company]").forEach(button => button.addEventListener("click", () => {
        selectedCompany = button.dataset.company;
        selectedModel = "";
        document.querySelectorAll("[data-company]").forEach(item => item.classList.toggle("active", item === button));
        renderDetailModels();
        updateDetailStock();
    }));

    document.getElementById("detailChooseButton")?.addEventListener("click", () => {
        const code = detailVariants[0]?.product_code;
        if (!code) {
            window.location.href = "products.html";
            return;
        }
        window.location.href = `products.html?openProductCode=${encodeURIComponent(code)}`;
    });
}

// يعرض موديلات الماركة المختارة فقط، بدل إظهار جميع الموديلات معًا.
function renderDetailModels() {
    const container = document.getElementById("detailModels");
    if (!container) return;

    if (!selectedCompany) {
        container.innerHTML = '<span class="detail-choice-hint">اختر الماركة أولًا لعرض موديلاتها.</span>';
        return;
    }

    const models = [...new Set(detailVariants
        .filter(item => String(item.company || "").trim() === selectedCompany)
        .map(item => String(item.model || "").trim())
        .filter(Boolean))];

    container.innerHTML = models.length
        ? models.map(model => `<button type="button" class="option-chip" data-model="${escapeDetailHtml(model)}">${escapeDetailHtml(model)}</button>`).join("")
        : '<span class="detail-choice-hint">لا توجد موديلات متعددة لهذا المنتج.</span>';

    container.querySelectorAll("[data-model]").forEach(button => button.addEventListener("click", () => {
        selectedModel = button.dataset.model;
        container.querySelectorAll("[data-model]").forEach(item => item.classList.toggle("active", item === button));
        updateDetailStock();
    }));
}

// يحسب الكمية المعروضة بناءً على الماركة والموديل لتبقى مطابقة لمخزن المنطقة.
function updateDetailStock() {
    const matching = detailVariants.filter(item =>
        (!selectedCompany || String(item.company || "").trim() === selectedCompany) &&
        (!selectedModel || String(item.model || "").trim() === selectedModel)
    );
    const quantity = matching.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    document.getElementById("detailStock").innerHTML = `المتوفر بحسب اختيارك: <strong>${quantity} قطعة</strong>`;
}

loadProductDetails();
