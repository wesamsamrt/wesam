const detailParams = new URLSearchParams(window.location.search);
let detailVariants = [];
let selectedCompany = "";
let selectedModel = "";
let selectedColor = "";
let selectedQuantity = 1;
let detailWarehouse = "";

// يحمي بيانات المنتج قبل عرضها داخل صفحة التفاصيل.
function escapeDetailHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
}

// يعرض رقم المخزون فقط عندما يكون منخفضًا لحماية كمية المخزن الفعلية.
function formatDetailStock(quantity) {
    const safeQuantity = Math.max(0, Number(quantity || 0));
    return safeQuantity < 20 ? `المتبقي: ${safeQuantity} قطعة` : "المخزون متوفر";
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
    detailWarehouse = warehouse;

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
    const productName = product.type || product.product_type || product.model || "منتج";
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
            <div class="detail-summary">${escapeDetailHtml(description)}<br>اختر الماركة والموديل المناسبين، ثم اختر اللون وحدد الكمية.</div>
            <div class="detail-options">
                <h2>اختيار المواصفات</h2>
                ${companies.length ? `<span class="option-label">الماركة</span><div class="option-chips" id="detailCompanies">${companies.map(company => `<button type="button" class="option-chip" data-company="${escapeDetailHtml(company)}">${escapeDetailHtml(company)}</button>`).join("")}</div>` : ""}
                <span class="option-label">الموديل</span>
                <div class="option-chips" id="detailModels"><span class="detail-choice-hint">اختر الماركة أولًا لعرض موديلاتها.</span></div>
                <span class="option-label" id="detailColorLabel">اختر اللون</span>
                <div class="detail-colors" id="detailColors"><span class="detail-choice-hint">اختر الموديل أولًا لعرض الألوان المتوفرة.</span></div>
            </div>
        </section>
        <aside class="detail-purchase">
            <h2>إتمام الاختيار</h2>
            <p>حدد المواصفات والكمية المطلوبة، ثم أضف المنتج إلى سلتك.</p>
            <div class="stock-line" id="detailStock"><strong>${formatDetailStock(totalStock)}</strong></div>
            <div class="detail-cart-quantity" id="detailCartQuantity"><span>الكمية</span><span class="detail-choice-hint">اختر اللون أولًا</span></div>
            <button class="detail-action" id="detailChooseButton" type="button">🛒 أضف إلى السلة</button>
            <div class="benefits"><div class="benefit"><strong>🚚 شحن سريع</strong>حسب المنطقة</div><div class="benefit"><strong>🛡️ ضمان</strong>لجودة المنتج</div><div class="benefit"><strong>🔒 دفع آمن</strong>عند إتمام الطلب</div></div>
        </aside>`;

    setupDetailInteractions();

    if (companies.length === 1) {
        selectedCompany = companies[0];
        document.querySelector("[data-company]")?.classList.add("active");
        renderDetailModels();
        updateDetailStock();
    } else if (!companies.length) {
        renderDetailModels();
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
        selectedColor = "";
        selectedQuantity = 1;
        document.querySelectorAll("[data-company]").forEach(item => item.classList.toggle("active", item === button));
        renderDetailModels();
        updateDetailStock();
    }));

    document.getElementById("detailChooseButton")?.addEventListener("click", addDetailSelectionsToCart);
}

// يعرض موديلات الماركة المختارة فقط، بدل إظهار جميع الموديلات معًا.
function renderDetailModels() {
    const container = document.getElementById("detailModels");
    if (!container) return;

    const hasCompanies = detailVariants.some(item => String(item.company || "").trim());
    if (hasCompanies && !selectedCompany) {
        container.innerHTML = '<span class="detail-choice-hint">اختر الماركة أولًا لعرض موديلاتها.</span>';
        return;
    }

    const models = [...new Set(detailVariants
        .filter(item => !selectedCompany || String(item.company || "").trim() === selectedCompany)
        .map(item => String(item.model || "").trim())
        .filter(Boolean))];

    container.innerHTML = models.length
        ? models.map(model => `<button type="button" class="option-chip" data-model="${escapeDetailHtml(model)}">${escapeDetailHtml(model)}</button>`).join("")
        : '<span class="detail-choice-hint">لا توجد موديلات متعددة لهذا المنتج.</span>';

    if (!models.length) renderDetailColors();

    container.querySelectorAll("[data-model]").forEach(button => button.addEventListener("click", () => {
        selectedModel = button.dataset.model;
        selectedColor = "";
        selectedQuantity = 1;
        container.querySelectorAll("[data-model]").forEach(item => item.classList.toggle("active", item === button));
        renderDetailColors();
        updateDetailStock();
    }));
}

// يعرض الألوان المتاحة أفقيًا ويتيح للعميل اختيار لون واحد فقط لكل إضافة إلى السلة.
function renderDetailColors() {
    const container = document.getElementById("detailColors");
    const colorLabel = document.getElementById("detailColorLabel");
    if (!container) return;
    const hasModels = detailVariants.some(item => String(item.model || "").trim());
    if (hasModels && !selectedModel) {
        container.innerHTML = '<span class="detail-choice-hint">اختر الموديل أولًا لعرض الألوان المتوفرة.</span>';
        return;
    }

    const matching = detailVariants.filter(item =>
        (!selectedCompany || String(item.company || "").trim() === selectedCompany) &&
        (!selectedModel || String(item.model || "").trim() === selectedModel) && Number(item.quantity || 0) > 0
    );
    const colors = new Map();
    matching.forEach(product => {
        const key = String(product.color || "بدون لون").trim() || "بدون لون";
        const group = colors.get(key) || [];
        group.push(product);
        colors.set(key, group);
    });

    if (!colors.size) {
        container.innerHTML = '<span class="detail-choice-hint">لا توجد كمية متوفرة لهذا الاختيار.</span>';
        return;
    }

    const hasOnlyNoColor = colors.size === 1 && colors.has("بدون لون");
    if (hasOnlyNoColor) {
        const available = [...colors.values()][0].reduce((sum, product) => sum + Math.max(0, Number(product.quantity || 0)), 0);
        selectedColor = "بدون لون";
        selectedQuantity = Math.max(1, Math.min(available, selectedQuantity || 1));
        container.innerHTML = "";
        if (colorLabel) colorLabel.style.display = "none";
        renderDetailPurchaseQuantity(available);
        return;
    }

    if (colorLabel) colorLabel.style.display = "block";
    container.innerHTML = [...colors.entries()].map(([color, products]) => {
        const available = products.reduce((sum, product) => sum + Math.max(0, Number(product.quantity || 0)), 0);
        return `<button type="button" class="detail-color-choice ${color === selectedColor ? "active" : ""}" data-color="${escapeDetailHtml(color)}" data-available="${available}">
            <strong>${escapeDetailHtml(color)}</strong><small>${formatDetailStock(available)}</small>
        </button>`;
    }).join("");

    container.querySelectorAll(".detail-color-choice").forEach(button => {
        button.addEventListener("click", () => {
            selectedColor = button.dataset.color;
            selectedQuantity = 1;
            container.querySelectorAll(".detail-color-choice").forEach(item => item.classList.toggle("active", item === button));
            renderDetailPurchaseQuantity(Number(button.dataset.available || 0));
            updateDetailStock();
        });
    });

    renderDetailPurchaseQuantity(0);
}

// يرسم متحكم الكمية الواحد فوق زر الإضافة وفق اللون المختار والكمية المتوفرة له.
function renderDetailPurchaseQuantity(available) {
    const container = document.getElementById("detailCartQuantity");
    if (!container) return;
    const safeAvailable = Math.max(0, Number(available || 0));
    if (!selectedColor || !safeAvailable) {
        container.innerHTML = '<span>الكمية</span><span class="detail-choice-hint">اختر اللون أولًا</span>';
        return;
    }

    selectedQuantity = Math.max(1, Math.min(safeAvailable, Number(selectedQuantity || 1)));
    const quantityLabel = selectedColor === "بدون لون" ? "الكمية" : `الكمية (${escapeDetailHtml(selectedColor)})`;
    container.innerHTML = `<span>${quantityLabel}</span><div class="detail-quantity">
        <button type="button" data-detail-adjust="-1" aria-label="تقليل الكمية">−</button>
        <input id="detailSelectedQuantity" type="number" min="1" max="${safeAvailable}" value="${selectedQuantity}" inputmode="numeric" aria-label="الكمية">
        <button type="button" data-detail-adjust="1" aria-label="زيادة الكمية">+</button>
    </div>`;
    const input = container.querySelector("#detailSelectedQuantity");
    const setQuantity = value => {
        selectedQuantity = Math.max(1, Math.min(safeAvailable, Number(value || 1)));
        input.value = selectedQuantity;
    };
    container.querySelectorAll("[data-detail-adjust]").forEach(button => button.addEventListener("click", () => {
        setQuantity(selectedQuantity + Number(button.dataset.detailAdjust));
    }));
    input.addEventListener("input", () => setQuantity(input.value));
}

// يحسب الكمية المعروضة بناءً على الماركة والموديل لتبقى مطابقة لمخزن المنطقة.
function updateDetailStock() {
    const matching = detailVariants.filter(item =>
        (!selectedCompany || String(item.company || "").trim() === selectedCompany) &&
        (!selectedModel || String(item.model || "").trim() === selectedModel)
    );
    const quantity = matching.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    document.getElementById("detailStock").innerHTML = `<strong>${formatDetailStock(quantity)}</strong>`;
}

// يحدّث شارة السلة في رأس الصفحة بعد إضافة المنتج ويعرض عدد القطع الحالي.
function updateDetailCartBadge(quantity) {
    const badge = document.getElementById("detailCartCount");
    if (!badge) return;
    const count = Math.max(0, Number(quantity || 0));
    badge.textContent = count;
    badge.hidden = count === 0;
}

// يشغّل فيديو الكرتون فوق الصفحة دون حجبها، ثم يزيله تلقائيًا بعد انتهاء الحركة.
function playCartAddAnimation(cartQuantity) {
    updateDetailCartBadge(cartQuantity);
    document.getElementById("cartAddAnimation")?.remove();
    const video = document.createElement("video");
    video.id = "cartAddAnimation";
    video.className = "cart-add-animation";
    video.src = "cart-add-animation.mp4";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    const removeAnimation = () => video.remove();
    video.addEventListener("ended", removeAnimation, { once: true });
    video.addEventListener("error", removeAnimation, { once: true });
    document.body.appendChild(video);
    video.play().catch(removeAnimation);
    setTimeout(removeAnimation, 5000);
}

// يضيف اللون الواحد والكمية المحددة إلى سلة الحساب الحالي ويحفظ إجمالي الطلب المفتوح.
async function addDetailSelectionsToCart() {
    const button = document.getElementById("detailChooseButton");
    if (!selectedColor || !selectedQuantity) {
        alert("اختر اللون وحدد الكمية أولًا.");
        return;
    }

    const items = [];
    let remaining = selectedQuantity;
    detailVariants.filter(product =>
        (!selectedCompany || String(product.company || "").trim() === selectedCompany) &&
        (!selectedModel || String(product.model || "").trim() === selectedModel) &&
        (String(product.color || "بدون لون").trim() || "بدون لون") === selectedColor
    ).forEach(product => {
        const quantity = Math.min(remaining, Math.max(0, Number(product.quantity || 0)));
        if (quantity > 0) items.push({ product, quantity });
        remaining -= quantity;
    });

    if (!items.length) {
        alert("الكمية المختارة غير متوفرة حاليًا.");
        return;
    }

    button.disabled = true;
    button.textContent = "جاري الإضافة للسلة...";
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error("LOGIN_REQUIRED");

        const { data: existingOrders, error: ordersError } = await supabaseClient
            .from("orders").select("id, user_id").eq("user_id", user.id)
            .eq("status", "جديد").eq("warehouse", detailWarehouse)
            .order("id", { ascending: false }).limit(1);
        if (ordersError) throw ordersError;

        let order = existingOrders?.[0];
        if (!order) {
            const { data, error } = await supabaseClient.from("orders").insert({
                user_id: user.id,
                customer_name: user.user_metadata?.name || user.email || "عميل",
                customer_phone: user.user_metadata?.phone || "",
                status: "جديد",
                total: 0,
                warehouse: detailWarehouse
            }).select("id, user_id").single();
            if (error) throw error;
            order = data;
        }

        const productIds = items.map(item => item.product.id);
        const { data: existingItems, error: existingError } = await supabaseClient
            .from("order_items").select("id, product_id, quantity, price")
            .eq("order_id", order.id).in("product_id", productIds);
        if (existingError) throw existingError;

        const existingByProduct = new Map((existingItems || []).map(item => [String(item.product_id), item]));
        const inserts = [];
        const updates = [];
        items.forEach(({ product, quantity }) => {
            const existing = existingByProduct.get(String(product.id));
            if (existing) {
                updates.push(supabaseClient.from("order_items").update({
                    quantity: Number(existing.quantity || 0) + quantity,
                    price: Number(product.price || 0), product_code: product.product_code
                }).eq("id", existing.id));
            } else {
                inserts.push({ order_id: order.id, product_id: product.id, quantity, product_code: product.product_code,
                    category: product.category, product_type: product.product_type, type: product.type,
                    company: product.company, model: product.model, color: product.color,
                    price: Number(product.price || 0), image: product.image });
            }
        });
        if (inserts.length) {
            const { error } = await supabaseClient.from("order_items").insert(inserts);
            if (error) throw error;
        }
        const updateResults = await Promise.all(updates);
        const updateError = updateResults.find(result => result.error)?.error;
        if (updateError) throw updateError;

        const { data: cartItems, error: cartError } = await supabaseClient
            .from("order_items").select("quantity, price").eq("order_id", order.id);
        if (cartError) throw cartError;
        const total = (cartItems || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
        const { error: totalError } = await supabaseClient.from("orders").update({ total }).eq("id", order.id);
        if (totalError) throw totalError;

        const cartQuantity = (cartItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        playCartAddAnimation(cartQuantity);
        selectedQuantity = 1;
        const selectedColorButton = document.querySelector(`.detail-color-choice[data-color="${CSS.escape(selectedColor)}"]`);
        renderDetailPurchaseQuantity(Number(selectedColorButton?.dataset.available || 0));
    } catch (error) {
        console.error("Detail cart error:", error);
        if (error.message === "LOGIN_REQUIRED") {
            alert("يجب تسجيل الدخول أولًا لإضافة المنتج للسلة.");
            window.location.href = "login.html";
        } else {
            alert("تعذر إضافة المنتج للسلة: " + (error.message || "حاول مرة أخرى."));
        }
    } finally {
        button.disabled = false;
        button.textContent = "إضافة للسلة";
    }
}

loadProductDetails();
