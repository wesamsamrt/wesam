let allProducts = [];
let customerWarehouse = localStorage.getItem("customer_warehouse") || "";
const productPageParams = new URLSearchParams(window.location.search);
let isGuestShopping = false;
let customerWarehouseResolved = false;
let isLinkedDriverShopping = false;

// يحدد ما إذا كان المنتج مناسبًا للجهاز المختار في قسم «تسوق حسب جهازك».
function isProductCompatibleWithDevice(product, selectedDevice) {
    const aliases = {
        iphone: ["iphone", "ايفون", "آيفون", "apple"],
        samsung: ["samsung", "سامسونج"],
        ipad: ["ipad", "ايباد", "آيباد", "apple"],
        laptop: ["laptop", "لابتوب", "كمبيوتر", "macbook", "ماك بوك"],
        playstation: ["playstation", "بلايستيشن", "ps4", "ps5"]
    };
    const terms = aliases[selectedDevice] || [selectedDevice];
    const searchable = [
        product.company,
        product.model,
        product.type,
        product.product_type,
        ...(Array.isArray(product.compatible_devices) ? product.compatible_devices : [])
    ].filter(Boolean).join(" ").toLowerCase();

    return product.compatibility_type === "general" || terms.some(term => searchable.includes(term.toLowerCase()));
}

// يعطّل طبقة التصميم الداكنة فقط للحساب المرتبط بمندوب، فيبقى على واجهته الكلاسيكية.
async function applyProductsPageTheme(user, driverIdentity = null) {
    const darkThemeStyles = document.getElementById("productsDarkThemeStyles");
    if (!darkThemeStyles || !user) return;

    if (!driverIdentity) {
        const { data } = await supabaseClient.rpc("get_my_driver_identity");
        driverIdentity = data;
    }
    document.body.classList.toggle("driver-classic-theme", Boolean(driverIdentity?.is_driver));
}

// يمسح المنطقة المحفوظة عند فتح الصفحة من زر تغيير المنطقة.
if (productPageParams.get("changeRegion") === "1") {
    customerWarehouse = "";
    localStorage.removeItem("customer_warehouse");
}

// يثبت مخزن الرياض تلقائياً للزائر غير المسجل ويُبقي اختيار المنطقة للحسابات المسجلة فقط.
async function resolveCustomerWarehouseAccess() {
    if (customerWarehouseResolved) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    isGuestShopping = !user;

    const { data: driverIdentity } = user
        ? await supabaseClient.rpc("get_my_driver_identity")
        : { data: null };
    isLinkedDriverShopping = Boolean(driverIdentity?.is_driver && driverIdentity?.warehouse);

    await applyProductsPageTheme(user, driverIdentity);

    // يفرض مخزن المندوب المرتبط حتى يرى كميات مخزنه فقط ولا يعتمد على منطقة محفوظة سابقًا.
    if (isLinkedDriverShopping) {
        customerWarehouse = driverIdentity.warehouse;
        localStorage.setItem("customer_warehouse", customerWarehouse);
        const changeButton = document.getElementById("changeCustomerWarehouse");
        if (changeButton) changeButton.style.display = "none";
        const modal = document.getElementById("customerWarehouseModal");
        if (modal) modal.style.display = "none";
    }

    if (isGuestShopping) {
        customerWarehouse = "الرياض";
        localStorage.setItem("customer_warehouse", customerWarehouse);
        const changeButton = document.getElementById("changeCustomerWarehouse");
        if (changeButton) changeButton.style.display = "none";
        const modal = document.getElementById("customerWarehouseModal");
        if (modal) modal.style.display = "none";
    }

    customerWarehouseResolved = true;
}

// يعرض شاشة اختيار منطقة العميل ويحمل المخازن المتاحة للاختيار اليدوي.
async function showCustomerWarehouseSelection() {
    await resolveCustomerWarehouseAccess();
    if (isGuestShopping || isLinkedDriverShopping) return;

    const modal = document.getElementById("customerWarehouseModal");
    const options = document.getElementById("customerWarehouseOptions");
    if (!modal || !options) return;
    modal.style.display = "grid";
    const { data, error } = await supabaseClient.from("warehouses").select("name").order("name");
    if (error) {
        options.innerHTML = "تعذر تحميل المناطق. حاول تحديث الصفحة.";
        return;
    }
    options.innerHTML = (data || []).map(warehouse => `
        <button type="button" class="customer-warehouse-option" data-customer-warehouse="${escapeCustomerWarehouseHtml(warehouse.name)}">
            <strong>مخزن ${escapeCustomerWarehouseHtml(warehouse.name)}</strong><span>عرض المنتجات المتوفرة في هذه المنطقة</span>
        </button>
    `).join("") || "لا توجد مناطق متاحة حاليًا.";
    options.querySelectorAll("[data-customer-warehouse]").forEach(button => {
        button.addEventListener("click", () => chooseCustomerWarehouse(button.dataset.customerWarehouse));
    });
}

// يحمي أسماء المخازن عند استخدامها داخل عناصر HTML.
function escapeCustomerWarehouseHtml(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

// يحفظ مخزن التسوق للعميل ثم يعيد تحميل المنتجات الخاصة به فقط.
function chooseCustomerWarehouse(warehouse) {
    if (isGuestShopping || isLinkedDriverShopping) return;

    customerWarehouse = warehouse;
    localStorage.setItem("customer_warehouse", warehouse);
    document.getElementById("customerWarehouseModal").style.display = "none";
    cachedOpenOrder = null;
    loadProducts();
}

// يحسب المسافة التقريبية بين موقع العميل وموقع كل مدينة بالكيلومتر.
function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    const toRadians = value => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// يطلب موقع العميل من المتصفح ثم يختار أقرب مخزن مدعوم تلقائيًا.
function detectCustomerWarehouse() {
    const message = document.getElementById("customerWarehouseMessage");
    if (!navigator.geolocation) { message.textContent = "جهازك لا يدعم تحديد الموقع؛ اختر المنطقة يدويًا."; return; }
    message.textContent = "جاري تحديد موقعك...";
    navigator.geolocation.getCurrentPosition(position => {
        const cities = [
            { warehouse: "الرياض", lat: 24.7136, lng: 46.6753 },
            { warehouse: "جدة", lat: 21.4858, lng: 39.1925 }
        ];
        const nearest = cities.map(city => ({ ...city, distance: calculateDistanceKm(position.coords.latitude, position.coords.longitude, city.lat, city.lng) }))
            .sort((a, b) => a.distance - b.distance)[0];
        const availableWarehouse = [...document.querySelectorAll("[data-customer-warehouse]")]
            .find(button => button.dataset.customerWarehouse === nearest.warehouse);
        if (!availableWarehouse || nearest.distance > 150) {
            message.textContent = "لم نتمكن من مطابقة موقعك مع منطقة خدمة قريبة؛ اختر المنطقة يدويًا.";
            return;
        }
        chooseCustomerWarehouse(nearest.warehouse);
    }, () => {
        message.textContent = "لم تسمح بمشاركة الموقع؛ اختر المنطقة يدويًا.";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
}

// نحتفظ بالمستخدم والطلب المفتوح طوال الجلسة بدلاً من طلبهما من الخادم
// مع كل ضغطة على زر الإضافة.
let cachedCartUser = null;
let cachedOpenOrder = null;

async function getCartUser() {
    if (cachedCartUser) {
        return cachedCartUser;
    }

    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
        throw new Error("LOGIN_REQUIRED");
    }

    cachedCartUser = user;
    return user;
}

async function getOpenOrder(user) {
    if (cachedOpenOrder && cachedOpenOrder.user_id === user.id) {
        return cachedOpenOrder;
    }

    const { data: orders, error } = await supabaseClient
        .from("orders")
        .select("id, user_id")
        .eq("user_id", user.id)
        .eq("status", "جديد")
        .eq("warehouse", customerWarehouse)
        .order("id", { ascending: false })
        .limit(1);

    if (error) {
        throw error;
    }

    if (orders && orders.length) {
        cachedOpenOrder = orders[0];
        return cachedOpenOrder;
    }

    const { data: order, error: createError } = await supabaseClient
        .from("orders")
        .insert({
            user_id: user.id,
            customer_name: user.user_metadata?.name || user.email || "عميل",
            customer_phone: user.user_metadata?.phone || "",
            status: "جديد",
            total: 0,
            warehouse: customerWarehouse
        })
        .select("id, user_id")
        .single();

    if (createError) {
        throw createError;
    }

    cachedOpenOrder = order;
    return cachedOpenOrder;
}


/* =========================================================
   تحميل المنتجات
========================================================= */

async function loadProducts() {

    const container = document.getElementById("products");

    if (!container) return;

    await resolveCustomerWarehouseAccess();

    if (!customerWarehouse) {
        container.innerHTML = '<div class="loading">اختر منطقتك لعرض المنتجات المتاحة.</div>';
        showCustomerWarehouseSelection();
        return;
    }

    container.innerHTML = `
        <div class="loading">
            جاري تحميل المنتجات...
        </div>
    `;

    const params = new URLSearchParams(window.location.search);

    const category = params.get("category");
    const productType = params.get("type");
    const selectedDevice = params.get("device");

    let query = supabaseClient
        .from("products")
        .select("*")
        .eq("warehouse", customerWarehouse);

    if (category) {
        query = query.eq("category", category);
    }

    if (productType) {
        query = query.eq("product_type", productType);
    }

   let allData = [];
let from = 0;
const pageSize = 1000;

while (true) {

    const { data, error } = await query
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);

    if (error) {

        console.error("Supabase Error:", error);

        container.innerHTML = `
            <div class="message error">
                حدث خطأ في تحميل المنتجات
            </div>
        `;

        return;
    }

    if (!data || data.length === 0) {
        break;
    }

    allData.push(...data);

    if (data.length < pageSize) {
        break;
    }

    from += pageSize;
}

allProducts = selectedDevice
    ? allData.filter(product => isProductCompatibleWithDevice(product, selectedDevice))
    : allData;

console.log("عدد المنتجات المحملة كامل:", allProducts.length);

renderProducts(allProducts);
setupFilters();

    // يعيد فتح نافذة الاختيار عند الرجوع من صفحة تفاصيل المنتج لإكمال الإضافة للسلة.
    const productCodeToOpen = params.get("openProductCode");
    if (productCodeToOpen) {
        const variantsToOpen = Object.values(groupProductsByCode(allProducts)).find(group =>
            String(group[0]?.product_code || "") === productCodeToOpen
        );
        if (variantsToOpen?.length) openProductModal(variantsToOpen);
    }
}


/* =========================================================
   تجميع المنتجات حسب TYPE
========================================================= */
function groupProductsByCode(products) {

    const groups = {};

    products.forEach(product => {

        const code =
            (product.product_code || "").trim();

        const groupKey =
            code || `product_${product.id}`;

        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }

        groups[groupKey].push(product);
    });

    return groups;
}


/* =========================================================
   عرض المنتجات
========================================================= */
/* =========================================================
   نص توافق المنتج
========================================================= */

function getProductCompatibilityText(product) {

    const type =
        product.compatibility_type || "device";


    /* المنتج العام */

    if (type === "general") {

        return `
            <span class="product-compatibility general">
                متوافق مع جميع الأجهزة
            </span>
        `;

    }


    /* عدة أجهزة */

    if (type === "multi") {

        const devices =
            Array.isArray(product.compatible_devices)
                ? product.compatible_devices
                : [];


        if (!devices.length) {

            return `
                <span class="product-compatibility">
                    متوافق مع عدة أجهزة
                </span>
            `;

        }


        return `
            <span class="product-compatibility">
                ${devices.map(device => escapeHtml(device)).join(" • ")}
            </span>
        `;

    }


    /* جهاز محدد */

    const company =
        String(product.company || "").trim();

    const model =
        String(product.model || "").trim();


    return `
        <span class="product-compatibility">
            ${escapeHtml(company)}
            ${
                company && model
                    ? " • "
                    : ""
            }
            ${escapeHtml(model)}
        </span>
    `;
}
function renderProducts(products) {

    const container = document.getElementById("products");

    if (!container) return;

    container.innerHTML = "";

    if (!products || products.length === 0) {

        container.innerHTML = `
            <div class="message">
                لا توجد منتجات بهذا النوع
            </div>
        `;

        return;
    }


    /*
       هنا التجميع المهم:
       كل المنتجات التي لها نفس TYPE
       تصبح بطاقة واحدة
    */

    const groups = groupProductsByCode(products);

Object.keys(groups).forEach(groupKey => {

    const variants = groups[groupKey];

    const firstProduct = variants[0];

    const productCode =
        (firstProduct.product_code || "").trim();

    const type =
        (firstProduct.type || "منتج").trim();

        const compatibilityText =
    getProductCompatibilityText(firstProduct);

        const card = document.createElement("div");

        card.className = "product-card";


        
      


        // عدد الموديلات المختلفة
        const uniqueModels = [
            ...new Set(
                variants
                    .map(p => (p.model || "").trim())
                    .filter(Boolean)
            )
        ];


        card.innerHTML = `

            <div class="product-image">

                ${
                    firstProduct.image
                    ?
                    `<img
                        src="${firstProduct.image}"
                        alt="${type}"
                    >`
                    :
                    "📱"
                }

            </div>


            <div class="product-type">
    ${type}
</div>

<h3>
    ${type}
</h3>

${
    productCode
    ?
    `<div style="
        margin-top:6px;
        font-size:14px;
        font-weight:bold;
        color:#4935b5;
    ">
        كود المنتج: ${escapeHtml(productCode)}
    </div>`
    :
    ""
}


           <div class="product-compatibility-wrapper">
    ${compatibilityText}
</div>


            <div class="product-bottom">

                <span class="price">
                    ${
                        firstProduct.price != null
                        ? " " + firstProduct.price + " ر.س"
                        : ""
                    }
                </span>


                <button
                    class="add-button product-select-button"
                    type="button"
                >
                    +
                </button>

            </div>
        `;


        /*
           الضغط على البطاقة
        */

        card.addEventListener("click", function(e) {

            // إذا ضغط على الزر + لا نفتح المودال مرتين
            if (
                e.target.classList.contains("add-button")
            ) {
                e.stopPropagation();
            }

            openProductExperience(variants);
        });


        /*
           زر +
        */

        const addButton =
            card.querySelector(".add-button");

        addButton.addEventListener("click", function(e) {

            e.stopPropagation();

            openProductExperience(variants);
        });


        container.appendChild(card);

    });

}


/* =========================================================
   البحث
========================================================= */
// يفتح صفحة التفاصيل للحسابات العادية، ويُبقي نافذة اختيار الكمية للحساب المرتبط بمندوب.
function openProductExperience(variants) {
    if (!variants?.length) return;

    if (isLinkedDriverShopping) {
        openProductModal(variants);
        return;
    }

    const firstProduct = variants[0];
    const params = new URLSearchParams();
    if (firstProduct.product_code) params.set("code", firstProduct.product_code);
    params.set("id", firstProduct.id);
    window.location.href = `product-details.html?${params.toString()}`;
}

function searchProducts() {

    const input =
        document.getElementById("searchInput");

    if (!input) return;

    const search =
        input.value
            .toLowerCase()
            .trim();

    const container =
        document.getElementById("products");

    if (!container) return;


    /*
       إذا البحث فارغ
    */

    if (!search) {

        // الصفحة الرئيسية
        if (
            window.location.pathname.endsWith("index.html") ||
            window.location.pathname === "/"
        ) {

            container.innerHTML = "";

        } else {

            renderProducts(allProducts);

        }

        return;
    }


    /*
       البحث
    */

    const filtered =
        allProducts.filter(product => {

            const text = `

                ${product.model || ""}

                ${product.company || ""}

                ${product.type || ""}

                ${product.color || ""}

                ${product.product_code || ""}

            `.toLowerCase();


            return text.includes(search);

        });


    renderProducts(filtered);

}
/* =========================================================
   الفلاتر
========================================================= */
/* =========================================================
   إنشاء فلاتر الأنواع حسب التصنيف
========================================================= */

function setupFilters() {

    const filters =
        document.querySelectorAll(".filter");

    if (!filters.length) return;

    /*
       نأخذ الحاوية التي تحتوي أزرار الفلاتر
    */

    const filterContainer =
        filters[0].parentElement;

    if (!filterContainer) return;


    /*
       استخراج الأنواع الموجودة فعليًا
       من المنتجات المحملة
    */

    const types = [
        ...new Set(
            allProducts
                .map(product =>
                    String(product.type || "").trim()
                )
                .filter(Boolean)
        )
    ];


    /*
       نخلي "الكل" موجود دائمًا
    */

    filterContainer.innerHTML = "";


    const allButton =
        document.createElement("button");

    allButton.type = "button";

    allButton.className =
        "filter active";

    allButton.textContent =
        "الكل";


    allButton.addEventListener(
        "click",
        function () {

            filterContainer
                .querySelectorAll(".filter")
                .forEach(item => {
                    item.classList.remove("active");
                });

            this.classList.add("active");

            renderProducts(allProducts);
        }
    );


    filterContainer.appendChild(allButton);


    /*
       إنشاء زر لكل TYPE موجود
    */

    types.forEach(type => {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "filter";

        button.textContent =
            type;


        button.addEventListener(
            "click",
            function () {

                filterContainer
                    .querySelectorAll(".filter")
                    .forEach(item => {
                        item.classList.remove("active");
                    });

                this.classList.add("active");


                /*
                   فلترة المنتجات حسب TYPE
                */

                const filtered =
                    allProducts.filter(product => {

                        return (
                            String(product.type || "")
                                .trim()
                                .toLowerCase()
                            ===
                            type
                                .trim()
                                .toLowerCase()
                        );

                    });


                renderProducts(filtered);

            }
        );


        filterContainer.appendChild(button);

    });

}

/* =========================================================
   فتح نافذة اختيار المنتج
========================================================= */

function openProductModal(variants) {

    const oldModal = document.getElementById("productSelectModal");

    if (oldModal) {
        oldModal.remove();
    }

    if (!variants || variants.length === 0) {
        return;
    }

    const companies = [
        ...new Set(
            variants
                .map(p => String(p.company || "").trim())
                .filter(Boolean)
        )
    ];

    const modal = document.createElement("div");

    modal.id = "productSelectModal";

    modal.innerHTML = `

        <div class="product-modal-overlay">

            <div class="product-modal-box">

                <button
                    type="button"
                    class="product-modal-close"
                    id="closeProductModal"
                >
                    ×
                </button>

                <div class="product-modal-content">

                    <div class="modal-icon">
                        📱
                    </div>

                    <div class="modal-type">
                        ${escapeHtml(variants[0].type || "")}
                    </div>

                    <div style="
                        text-align:center;
                        margin-bottom:10px;
                        font-size:14px;
                        font-weight:bold;
                        color:#4935b5;
                    ">
                        كود المنتج:
                        ${escapeHtml(variants[0].product_code || "")}
                    </div>

                    <h2>
                        اختيار المنتج
                    </h2>

                    <div id="orderPriceOverrideBox" class="order-price-override" style="display:none;">
                        <div>
                            <strong>سعر البيع لهذا الطلب</strong>
                            <small>السعر الأساسي: <span id="baseProductPrice">0.00</span> ر.س</small>
                        </div>
                        <label>
                            <input id="orderPriceOverride" type="number" min="0" step="0.01" inputmode="decimal" aria-label="سعر البيع لهذا الطلب">
                            <span>ر.س</span>
                        </label>
                    </div>

                    <!-- الشركة -->

                    <label>
                        الماركة
                    </label>

                    <select
                        id="companySelect"
                        class="product-select"
                    >

                        <option value="">
                            اختر الماركة
                        </option>

                        ${
                            companies
                                .map(company => `
                                    <option value="${escapeHtml(company)}">
                                        ${escapeHtml(company)}
                                    </option>
                                `)
                                .join("")
                        }

                    </select>


                    <!-- الموديل -->

                    <label>
                        الموديل
                    </label>

                    <select
                        id="modelSelect"
                        class="product-select"
                        multiple
                        size="5"
                        disabled
                    >

                        <option value="">
                            اختر الماركة أولاً
                        </option>

                    </select>

                    <small class="model-select-hint">
                        اختر موديلًا أو أكثر، ثم اختر الألوان والكميات.
                    </small>


                    <!-- الألوان والكميات -->

                    <div id="colorsContainer"></div>


                    <!-- معلومات المخزون -->

                    <div
                        id="stockSummary"
                        class="stock-summary"
                    >
                        اختر الموديل
                    </div>


                    <!-- زر الإضافة -->

                    <button
                        type="button"
                        id="confirmAddProduct"
                        class="confirm-add-product"
                        disabled
                    >
                        إضافة للسلة
                    </button>

                </div>

            </div>

        </div>

       .colors-title {
    margin-top: 24px;
    margin-bottom: 12px;
    font-size: 17px;
    font-weight: 800;
    color: #222;
}

.color-quantity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 14px 16px;
    margin-top: 10px;
    background: #fff;
    border: 1px solid #e9e9ef;
    border-radius: 16px;
    box-shadow: 0 3px 12px rgba(0,0,0,0.04);
}

.color-info {
    flex: 1;
    min-width: 0;
}

.color-name {
    font-size: 16px;
    font-weight: 800;
    color: #222;
}

.color-stock {
    margin-top: 5px;
    font-size: 13px;
    color: #888;
}

.color-quantity-control {
    display: flex;
    align-items: center;
    gap: 7px;
    direction: ltr;
}

.color-minus,
.color-plus {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 11px;
    background: #4935b5;
    color: white;
    font-size: 21px;
    font-weight: 700;
    cursor: pointer;
}

.color-quantity-input {
    width: 52px;
    height: 38px;
    padding: 0;
    border: 1px solid #e1e1e8;
    border-radius: 11px;
    background: #fafafa;
    color: #222;
    text-align: center;
    font-size: 16px !important;
    font-weight: 800;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
}

.color-quantity-input:focus {
    background: white;
    border-color: #4935b5;
    box-shadow: 0 0 0 3px rgba(73,53,181,0.10);
}

.stock-summary {
    margin-top: 15px;
    padding: 14px;
    background: #f1efff;
    border-radius: 14px;
    text-align: center;
    line-height: 1.9;
    font-size: 15px;
}

.stock-summary strong {
    color: #4935b5;
    font-size: 18px;
}


#productSelectModal input,
#productSelectModal select,
#productSelectModal textarea {
    font-size: 16px !important;
    transform: none !important;
    -webkit-text-size-adjust: 100%;
}

#productSelectModal input:focus,
#productSelectModal select:focus,
#productSelectModal textarea:focus {
    font-size: 16px !important;
}


    `;

    document.body.appendChild(modal);

    addProductModalStyles();

    document.body.style.overflow = "hidden";


    /* =====================================================
       العناصر
    ===================================================== */

    const companySelect =
        document.getElementById("companySelect");

    const modelSelect =
        document.getElementById("modelSelect");

    const colorsContainer =
        document.getElementById("colorsContainer");

    const stockSummary =
        document.getElementById("stockSummary");

    const addButton =
        document.getElementById("confirmAddProduct");

    function updateModelCheckmarks() {
        Array.from(modelSelect.options).forEach(option => {
            if (option.disabled || !option.value) return;
            option.textContent = `${option.selected ? "✓ " : ""}${option.value}`;
        });
    }

    // يجعل النقر على أي موديل يضيفه/يزيله مباشرة، دون الحاجة إلى زر Ctrl.
    modelSelect.addEventListener("mousedown", function (event) {
        const option = event.target.closest("option");
        if (!option || option.disabled) return;

        event.preventDefault();
        option.selected = !option.selected;
        modelSelect.dispatchEvent(new Event("change"));
    });


    let selectedColorProducts = [];
    const baseProductPrice = Number(variants[0]?.price) || 0;
    const orderPriceOverrideBox = modal.querySelector("#orderPriceOverrideBox");
    const orderPriceOverrideInput = modal.querySelector("#orderPriceOverride");

    // يتيح تعديل سعر البيع للحسابات الداخلية المصرح لها بالطلبات، دون تغيير سعر المنتج الأساسي.
    (async function configureOrderPriceOverride() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session?.user) return;
            const [{ data: access, error }, { data: driverIdentity, error: driverError }] = await Promise.all([
                supabaseClient.rpc("get_my_team_access"),
                supabaseClient.rpc("get_my_driver_identity")
            ]);
            const isRegisteredDriver = !driverError && driverIdentity?.is_driver === true;
            const canSetPrice = isRegisteredDriver || (!error && access?.is_active && (access.role === "owner" || (access.permissions?.sections || []).includes("orders")));
            if (!canSetPrice) return;
            orderPriceOverrideBox.style.display = "flex";
            modal.querySelector("#baseProductPrice").textContent = baseProductPrice.toFixed(2);
            orderPriceOverrideInput.value = baseProductPrice.toFixed(2);
        } catch (error) {
            console.warn("تعذر التحقق من صلاحية سعر البيع:", error);
        }
    })();


    /* =====================================================
   المنتجات العامة
===================================================== */

const compatibilityType =
    variants[0]?.compatibility_type || "device";


if (compatibilityType === "general") {

    /*
       المنتج العام لا يحتاج ماركة ولا موديل
    */

    // إخفاء الماركة
    companySelect.style.display = "none";

    if (companySelect.previousElementSibling) {
        companySelect.previousElementSibling.style.display = "none";
    }


    // إخفاء الموديل
    modelSelect.style.display = "none";

    if (modelSelect.previousElementSibling) {
        modelSelect.previousElementSibling.style.display = "none";
    }


    // تغيير العنوان
    const modalTitle =
        modal.querySelector(".product-modal-content h2");

    if (modalTitle) {
        modalTitle.textContent = "اختيار الكمية";
    }


    /*
       كل منتجات هذا الكود تعتبر خيارات مباشرة
       بدون ماركة وموديل
    */

    const colorProducts = [];

    const usedColors = new Set();


    variants.forEach(product => {

        const color =
            String(product.color || "").trim();


        // إذا المنتج بدون لون
        if (!color) {

            if (!usedColors.has("__NO_COLOR__")) {

                usedColors.add("__NO_COLOR__");

                colorProducts.push(product);

            }

            return;
        }


        const colorKey =
            color.toLowerCase();


        // منع تكرار اللون
        if (!usedColors.has(colorKey)) {

            usedColors.add(colorKey);

            colorProducts.push(product);

        }

    });


    selectedColorProducts =
        colorProducts;


    /*
       عنوان الكمية
    */

    const title =
        document.createElement("div");

    title.className =
        "colors-title";

    title.textContent =
        colorProducts.length > 1
            ? "اختر الكمية لكل لون"
            : "اختر الكمية";

    colorsContainer.appendChild(title);


    /*
       إنشاء صفوف الكميات
    */

    colorProducts.forEach(product => {

        const available =
            Math.max(
                0,
                Number(product.quantity) || 0
            );


        const color =
            String(product.color || "").trim();


        const row =
            document.createElement("div");

        row.className =
            "color-quantity-row";


        row.dataset.productId =
            product.id;


        row.innerHTML = `

            <div class="color-info">

                <div class="color-name">
                    ${escapeHtml(
                        color || "المنتج"
                    )}
                </div>

                <div class="color-stock">
                    المتوفر: ${available}
                </div>

            </div>


            <div class="color-quantity-control">

                <button
                    type="button"
                    class="color-minus"
                >
                    −
                </button>


                <input
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="color-quantity-input"
                    value="0"
                    autocomplete="off"
                >


                <button
                    type="button"
                    class="color-plus"
                >
                    +
                </button>

            </div>

        `;


        const input =
            row.querySelector(
                ".color-quantity-input"
            );

        const minus =
            row.querySelector(
                ".color-minus"
            );

        const plus =
            row.querySelector(
                ".color-plus"
            );


        /*
           تحديث الكمية
        */

        function updateGeneralQuantity(value) {

            let quantity =
                parseInt(value);


            if (isNaN(quantity)) {
                quantity = 0;
            }


            if (quantity < 0) {
                quantity = 0;
            }


            if (quantity > available) {
                quantity = available;
            }


            input.value =
                quantity;


            updateStockSummary();

        }


        /*
           ناقص
        */

        minus.addEventListener(
            "pointerdown",
            function(e) {

                e.preventDefault();
                e.stopPropagation();

                let quantity =
                    parseInt(input.value) || 0;

                quantity--;

                updateGeneralQuantity(
                    quantity
                );

            }
        );


        /*
           زائد
        */

        plus.addEventListener(
            "pointerdown",
            function(e) {

                e.preventDefault();
                e.stopPropagation();

                let quantity =
                    parseInt(input.value) || 0;

                quantity++;

                updateGeneralQuantity(
                    quantity
                );

            }
        );


        /*
           إدخال يدوي
        */

        input.addEventListener(
            "input",
            function() {

                this.value =
                    this.value.replace(
                        /[^0-9]/g,
                        ""
                    );

                updateGeneralQuantity(
                    this.value
                );

            }
        );


        colorsContainer.appendChild(row);

    });


    /*
       تحديث المخزون
    */

    updateStockSummary();

}


    /* =====================================================
       اختيار الماركة
    ===================================================== */

    companySelect.addEventListener("change", function () {

        const company =
            this.value.trim();

        modelSelect.innerHTML = "";

        colorsContainer.innerHTML = "";

        stockSummary.textContent =
            "اختر الموديل";

        addButton.disabled = true;

        selectedColorProducts = [];


        if (!company) {

            modelSelect.disabled = true;

            return;
        }


        const companyProducts =
            variants.filter(product => {

                return (
                    String(product.company || "")
                        .trim()
                        .toLowerCase()
                    ===
                    company
                        .toLowerCase()
                );

            });


        const models = [
            ...new Set(
                companyProducts
                    .map(p =>
                        String(p.model || "").trim()
                    )
                    .filter(Boolean)
            )
        ];


        models.forEach(model => {

            const option =
                document.createElement("option");

            option.value = model;

            option.textContent = model;

            modelSelect.appendChild(option);

        });


        modelSelect.disabled = models.length === 0;

        updateModelCheckmarks();

        if (models.length) {
            const hint = document.createElement("option");
            hint.disabled = true;
            hint.textContent = "يمكنك اختيار أكثر من موديل";
            modelSelect.appendChild(hint);
        }

    });


    /* =====================================================
       اختيار الموديل
    ===================================================== */

    modelSelect.addEventListener("change", function () {

        updateModelCheckmarks();

        const company =
            companySelect.value.trim();

        const selectedModels = Array.from(this.selectedOptions)
            .map(option => option.value.trim())
            .filter(Boolean);


        colorsContainer.innerHTML = "";

        stockSummary.textContent =
            "اختر اللون";

        addButton.disabled = true;

        selectedColorProducts = [];


        if (!company || !selectedModels.length) {
            return;
        }


        /* المنتجات الخاصة بالشركة + الموديل */

        const modelProducts =
            variants.filter(product => {

                return (

                    String(product.company || "")
                        .trim()
                        .toLowerCase()
                    ===
                    company.toLowerCase()

                    &&

                    selectedModels.some(model =>
                        String(product.model || "")
                            .trim()
                            .toLowerCase()
                        ===
                        model.toLowerCase()
                    )

                );

            });


        /*
           كل لون يعتبر منتج مستقل
        */

        const colorProducts = [];

        const usedColors = new Set();


        modelProducts.forEach(product => {

            const color =
                String(product.color || "").trim();


            /*
               المنتجات التي بدون لون
            */

            if (!color) {

                if (!usedColors.has("__NO_COLOR__")) {

                    usedColors.add("__NO_COLOR__");

                    colorProducts.push(product);

                }

                return;
            }


            const colorKey =
                color.toLowerCase();


            /*
               منع تكرار نفس اللون
            */

            if (!usedColors.has(colorKey)) {

                usedColors.add(colorKey);

                colorProducts.push(product);

            }

        });


        // نعرض الألوان المشتركة بين جميع الموديلات فقط؛ بذلك تعني كمية اللون
        // نفسها لكل موديل، ولا يُضاف لون غير متاح لأحد الموديلات المختارة.
        const sharedColorProducts = colorProducts.filter(product => {
            const colorKey = String(product.color || "").trim().toLowerCase() || "__NO_COLOR__";
            const modelsWithColor = new Set(
                modelProducts
                    .filter(item =>
                        (String(item.color || "").trim().toLowerCase() || "__NO_COLOR__") === colorKey
                    )
                    .map(item => String(item.model || "").trim().toLowerCase())
            );
            return modelsWithColor.size === selectedModels.length;
        });

        if (sharedColorProducts.length === 0) {

            stockSummary.textContent =
                "لا توجد ألوان مشتركة بين الموديلات المختارة";

            return;
        }


        // نحتفظ بكل المنتجات المختارة، لا بموديل واحد فقط، حتى تُطبّق
        // كمية كل لون على كل موديل قام العميل بتحديده.
        selectedColorProducts = modelProducts;


        /* =================================================
           عنوان الألوان
        ================================================= */

        const title =
            document.createElement("div");

        title.className =
            "colors-title";

        title.textContent =
            "اختر الكمية لكل لون";

        colorsContainer.appendChild(title);


        /* =================================================
           إنشاء صف لكل لون
        ================================================= */

        sharedColorProducts.forEach((product, index) => {

            const colorKey = String(product.color || "").trim().toLowerCase() || "__NO_COLOR__";
            const matchingProducts = modelProducts.filter(item =>
                (String(item.color || "").trim().toLowerCase() || "__NO_COLOR__") === colorKey
            );
            // لا نسمح بكمية أكبر من مخزون أي موديل مختار لهذا اللون.
            const available = Math.min(...matchingProducts.map(item =>
                Math.max(0, Number(item.quantity) || 0)
            ));


            const color =
                String(product.color || "").trim();


            const row =
                document.createElement("div");

            row.className =
                "color-quantity-row";


            row.dataset.productId =
                product.id;

            row.dataset.colorKey = colorKey;
            row.dataset.available = available;


            row.innerHTML = `

                <div class="color-info">

                    <div class="color-name">
                        ${escapeHtml(color || "بدون لون")}
                    </div>

                    <div class="color-stock">
                        المتوفر: ${available}
                    </div>

                </div>


                <div class="color-quantity-control">

                    <button
                        type="button"
                        class="color-minus"
                    >
                        −
                    </button>

                    <input
                 type="text"
                inputmode="numeric"
                 pattern="[0-9]*"
                class="color-quantity-input"
                 value="0"
                  autocomplete="off"
                    >

                    <button
                        type="button"
                        class="color-plus"
                    >
                        +
                    </button>

                </div>

            `;


            const input =
                row.querySelector(
                    ".color-quantity-input"
                );

            const minus =
                row.querySelector(
                    ".color-minus"
                );

            const plus =
                row.querySelector(
                    ".color-plus"
                );


            /* =================================================
               تحديث الكمية
            ================================================= */

            function updateColorQuantity(value) {

                let quantity =
                    parseInt(value);


                if (isNaN(quantity)) {
                    quantity = 0;
                }


                if (quantity < 0) {
                    quantity = 0;
                }


                if (quantity > available) {
                    quantity = available;
                }


                input.value =
                    quantity;


                updateStockSummary();

            }


            /* ناقص */

           minus.addEventListener("pointerdown", function (e) {

      e.preventDefault();
     e.stopPropagation();

      let quantity =
        parseInt(input.value) || 0;

     quantity--;

         updateColorQuantity(quantity);

        });


            /* زائد */
/* =================================================
   زائد - استجابة فورية للجوال
================================================= */

plus.addEventListener("pointerdown", function (e) {

    e.preventDefault();
    e.stopPropagation();

    let quantity =
        parseInt(input.value) || 0;

    quantity++;

    updateColorQuantity(quantity);

});


            /* إدخال يدوي */

            input.addEventListener("input", function () {

            this.value = this.value.replace(/[^0-9]/g, "");

              updateColorQuantity(this.value);

            });


            colorsContainer.appendChild(row);

        });


        updateStockSummary();

        });


    /* =====================================================
       حساب مجموع الكميات
    ===================================================== */

    function updateStockSummary() {

        const rows =
            colorsContainer.querySelectorAll(
                ".color-quantity-row"
            );


        let totalSelected = 0;

        let totalStock = 0;


        rows.forEach(row => {

            const input =
                row.querySelector(
                    ".color-quantity-input"
                );


            const product = selectedColorProducts.find(
                p => String(p.id) === String(row.dataset.productId)
            );


            const quantity =
                parseInt(input.value) || 0;


            totalSelected +=
                quantity;


            totalStock += row.dataset.available
                ? Number(row.dataset.available)
                : Math.max(0, Number(product?.quantity) || 0);

        });


        stockSummary.innerHTML = `

            <div>
                إجمالي الكمية المختارة:
                <strong>
                    ${totalSelected}
                </strong>
            </div>

            <div>
                إجمالي المخزون:
                <strong>
                    ${totalStock}
                </strong>
            </div>

        `;


        /*
           لازم يكون فيه كمية مختارة
        */

        addButton.disabled =
            totalSelected <= 0;

        }


     /* =====================================================
         إضافة جميع الألوان للسلة
     ===================================================== */

    addButton.onclick = async function () {
        const rows = colorsContainer.querySelectorAll(".color-quantity-row");
        const selectedItems = [];
        const customPriceText = orderPriceOverrideInput?.value.trim();
        const customPrice = customPriceText === "" ? baseProductPrice : Number(customPriceText);

        if (!Number.isFinite(customPrice) || customPrice < 0) {
            alert("اكتب سعر بيع صحيحًا.");
            return;
        }

        rows.forEach(row => {
            const quantity = parseInt(row.querySelector(".color-quantity-input").value) || 0;
            const products = row.dataset.colorKey
                ? selectedColorProducts.filter(product =>
                    (String(product.color || "").trim().toLowerCase() || "__NO_COLOR__") === row.dataset.colorKey
                )
                : selectedColorProducts.filter(product =>
                    String(product.id) === String(row.dataset.productId)
                );

            if (quantity > 0) {
                products.forEach(product => selectedItems.push({ product, quantity, orderPrice: customPrice }));
            }
        });

        if (!selectedItems.length) {
            alert("اختر كمية لون واحد على الأقل");
            return;
        }

        addButton.disabled = true;
        addButton.textContent = "جاري الإضافة...";

        try {
            await addProductsBatch(selectedItems);
            alert("تمت إضافة المنتجات المختارة إلى السلة بنجاح");
            rows.forEach(row => { row.querySelector(".color-quantity-input").value = 0; });
            updateStockSummary();
        } catch (error) {
            console.error("خطأ إضافة المنتجات:", error);
            if (error.message === "LOGIN_REQUIRED") {
                alert("يجب تسجيل الدخول أولاً");
                window.location.href = "login.html";
            } else {
                alert("حدث خطأ أثناء إضافة المنتجات");
            }
        } finally {
            addButton.disabled = false;
            addButton.textContent = "إضافة للسلة";
        }
    };


    /* =====================================================
       إغلاق
    ===================================================== */

    document
        .getElementById("closeProductModal")
        .addEventListener(
            "click",
            closeProductModal
        );


    modal
        .querySelector(".product-modal-overlay")
        .addEventListener("click", function (e) {

            if (e.target === this) {

                closeProductModal();

            }

        });

}

/* =========================================================
   عرض السعر
========================================================= */

function showSelectedProductPrice(
    product,
    priceBox
) {

    const price =
        Number(product.price) || 0;


    priceBox.innerHTML = `

        <div>
            <strong>
                ${product.company || ""}
            </strong>
        </div>

        <div>
            ${product.model || ""}
        </div>

        ${
            product.color
            ?
            `<div>
                اللون: ${product.color}
            </div>`
            :
            ""
        }

        <div class="modal-price">
            ${price} ر.س
        </div>

    `;

}


/* =========================================================
   إغلاق النافذة
========================================================= */

function closeProductModal() {

    const modal =
        document.getElementById(
            "productSelectModal"
        );


    if (modal) {
        modal.remove();
    }


    /*
       نرجع تحريك الصفحة
    */

    document.body.style.overflow = "";

}


/* =========================================================
   حماية النص
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   CSS النافذة
========================================================= */

function addProductModalStyles() {

    if (
        document.getElementById(
            "productModalStyles"
        )
    ) {
        return;
    }


    const style =
        document.createElement("style");

    style.id =
        "productModalStyles";


    style.textContent = `
     #productSelectModal {
    position: fixed;
    inset: 0;
    z-index: 999999;
    direction: rtl;
}

.product-modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);

    display: flex;
    align-items: center;
    justify-content: center;

    padding: 15px;
    overflow-y: auto;
}

.product-modal-box {
    width: 100%;
    max-width: 520px;
    max-height: 92vh;

    background: white;

    border-radius: 26px;

    position: relative;

    box-shadow:
        0 25px 70px rgba(0,0,0,0.25);

    overflow: hidden;
}

.product-modal-content {
    padding: 28px 20px;

    max-height: 92vh;
    overflow-y: auto;
}

/* زر الإغلاق */

.product-modal-close {
    position: absolute;

    top: 14px;
    left: 14px;

    width: 42px;
    height: 42px;

    border: none;
    border-radius: 50%;

    background: #f1f1f4;

    font-size: 27px;

    cursor: pointer;

    z-index: 5;
}

/* العنوان */

.modal-icon {
    text-align: center;
    font-size: 42px;
    margin-bottom: 5px;
}

.modal-type {
    text-align: center;

    font-size: 13px;

    color: #777;
}

.product-modal-content h2 {
    text-align: center;

    margin: 8px 0 25px;

    font-size: 23px;

    font-weight: 800;
}

/* الماركة والموديل */

.product-modal-content label {
    display: block;

    margin: 17px 0 8px;

    font-size: 14px;

    font-weight: 800;

    color: #333;
}

.product-select {
    width: 100%;

    height: 52px;

    padding: 0 15px;

    border: 1px solid #e4e4ea;

    border-radius: 14px;

    background: #fafafa;

    font-size: 16px;

    outline: none;
}

.product-select:focus {
    background: white;

    border-color: #4935b5;

    box-shadow:
        0 0 0 4px
        rgba(73,53,181,0.1);
}

#modelSelect[multiple] {
    height: 150px;
    padding: 8px;
}

.model-select-hint {
    display: block;
    margin-top: 6px;
    color: #777;
    font-size: 13px;
}

/* الألوان */

.colors-title {
    margin-top: 25px;

    margin-bottom: 12px;

    font-size: 17px;

    font-weight: 800;

    color: #222;
}

.color-quantity-row {
    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 12px;

    padding: 14px;

    margin-top: 10px;

    background: white;

    border: 1px solid #e8e8ee;

    border-radius: 17px;

    box-shadow:
        0 4px 14px rgba(0,0,0,0.04);
}

.color-info {
    flex: 1;
}

.color-name {
    font-size: 16px;

    font-weight: 800;

    color: #222;
}

.color-stock {
    margin-top: 5px;

    font-size: 13px;

    color: #888;
}

/* أزرار الكمية */

.color-quantity-control {
    display: flex;

    align-items: center;

    gap: 6px;

    direction: ltr;
}
.color-minus,
.color-plus {
    width: 39px;
    height: 39px;
    border: none;
    border-radius: 11px;
    background: #4935b5;
    color: white;
    font-size: 21px;
    font-weight: bold;
    cursor: pointer;

    /* مهم للجوال */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
}
.color-minus,
.color-plus {
    width: 39px;

    height: 39px;

    border: none;

    border-radius: 11px;

    background: #4935b5;

    color: white;

    font-size: 21px;

    font-weight: bold;

    cursor: pointer;
}

.color-quantity-input {
    width: 50px;

    height: 39px;

    border: 1px solid #ddd;

    border-radius: 11px;

    background: #fafafa;

    text-align: center;

    font-size: 16px !important;

    font-weight: 800;

    outline: none;
}

/* ملخص الكمية */

.stock-summary {
    margin-top: 18px;

    padding: 15px;

    background: #f5f3ff;

    border: 1px solid #e5e0ff;

    border-radius: 17px;

    text-align: center;

    line-height: 1.9;

    font-size: 14px;

    color: #666;
}

.stock-summary strong {
    color: #4935b5;

    font-size: 19px;
}

/* زر إضافة للسلة */

.confirm-add-product {
    width: 100%;

    height: 54px;

    margin-top: 18px;

    border: none;

    border-radius: 15px;

    background: #4935b5;

    color: white;

    font-size: 17px;

    font-weight: 800;

    cursor: pointer;

    box-shadow:
        0 7px 18px
        rgba(73,53,181,0.2);
}

.confirm-add-product:disabled {
    background: #ccc;

    box-shadow: none;

    cursor: not-allowed;
}
    `;


    document.head.appendChild(style);
}


/* =========================================================
   التشغيل
========================================================= */

// يربط زر تحديد الموقع التلقائي بدالة اختيار أقرب منطقة خدمة.
document.getElementById("detectCustomerWarehouse")?.addEventListener("click", detectCustomerWarehouse);

// يفتح شاشة المناطق ليتيح للعميل تغيير مخزن التسوق في أي وقت.
document.getElementById("changeCustomerWarehouse")?.addEventListener("click", () => {
    if (isGuestShopping) return;
    document.getElementById("customerWarehouseMessage").textContent = "";
    showCustomerWarehouseSelection();
});

loadProducts();

setupFilters();

/* =========================================================
   إضافة عدة منتجات للسلة دفعة واحدة
========================================================= */
async function addProductsBatch(items) {

    if (!items || !items.length) {
        return;
    }

    const user = await getCartUser();
    const order = await getOpenOrder(user);


    /* ==========================================
       جلب المنتجات الموجودة في السلة مرة واحدة
       بدل البحث عن كل منتج لوحده
    ========================================== */

    const productIds =
        items.map(item =>
            item.product.id
        );


    const {
        data: existingItems,
        error: existingItemsError
    } = await supabaseClient
        .from("order_items")
        .select("id, product_id, quantity, price")
        .eq("order_id", order.id)
        .in("product_id", productIds);

    if (existingItemsError) {
        throw existingItemsError;
    }


    const existingMap = new Map();


    (existingItems || []).forEach(item => {

        existingMap.set(
            String(item.product_id),
            item
        );

    });


    /* ==========================================
       تجهيز التحديثات والإضافات
    ========================================== */

    const updates = [];
    const inserts = [];


    items.forEach(item => {

        const product =
            item.product;

        const quantity =
            Math.max(
                1,
                parseInt(item.quantity) || 1
            );

        // سعر الطلب المؤقت يخص عنصر السلة فقط، ولا يحدّث سعر المنتج الأساسي.
        const unitPrice = Number.isFinite(Number(item.orderPrice))
            ? Number(item.orderPrice)
            : (Number(product.price) || 0);


        const existingItem =
            existingMap.get(
                String(product.id)
            );


        /* المنتج موجود بالسلة */

        if (existingItem) {

            const newQuantity =
                (Number(existingItem.quantity) || 0)
                + quantity;


            updates.push({

                id:
                    existingItem.id,

                quantity:
                    newQuantity,

                product_code:
                    product.product_code,

                price: unitPrice

            });

        }


        /* المنتج غير موجود */

        else {

            inserts.push({

                order_id:
                    order.id,

                product_id:
                    product.id,

                quantity:
                    quantity,

                product_code:
                    product.product_code,

                category: product.category,
                product_type: product.product_type,
                type: product.type,
                company: product.company,
                model: product.model,
                color: product.color,
                price: unitPrice,
                image: product.image

            });

        }

    });


    /* ==========================================
       تنفيذ الإضافات الجديدة دفعة واحدة
    ========================================== */

    if (inserts.length > 0) {

        const {
            error: insertError
        } = await supabaseClient
            .from("order_items")
            .insert(inserts);

        if (insertError) {
            throw insertError;
        }

    }


    /* ==========================================
       تحديث المنتجات الموجودة
    ========================================== */

    /*
       Supabase لا يدعم تحديث عدة صفوف
       بقيم مختلفة في طلب update واحد بسهولة.

       لذلك نستخدم Promise.all
       حتى تحدث بالتوازي بدل الانتظار بالتسلسل.
    */

    if (updates.length > 0) {

        await Promise.all(

            updates.map(item =>

                supabaseClient
                    .from("order_items")
                    .update({

                        quantity:
                            item.quantity,

                        product_code:
                            item.product_code,

                        price:
                            item.price

                    })
                    .eq(
                        "id",
                        item.id
                    )

                    .then(({ error }) => {

                        if (error) {
                            throw error;
                        }

                    })

            )

        );

    }

    // يعيد حفظ إجمالي السلة وفق سعر البيع المؤقت الذي اختاره الموظف لهذا الطلب.
    const { data: cartItems, error: cartItemsError } = await supabaseClient
        .from("order_items")
        .select("quantity, price")
        .eq("order_id", order.id);
    if (cartItemsError) throw cartItemsError;

    const cartTotal = (cartItems || []).reduce(
        (sum, cartItem) => sum + (Number(cartItem.price) || 0) * (Number(cartItem.quantity) || 1),
        0
    );
    const { error: totalError } = await supabaseClient
        .from("orders")
        .update({ total: cartTotal })
        .eq("id", order.id);
    if (totalError) throw totalError;


    return order;

}
/* =========================================================
   إضافة المنتج للسلة
========================================================= */
async function addProduct(product, quantity = 1) {

    quantity = parseInt(quantity);

    if (isNaN(quantity) || quantity < 1) {
        quantity = 1;
    }

    // التأكد من تسجيل الدخول
    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        throw new Error("LOGIN_REQUIRED");
    }

    if (!product || !product.id) {
        throw new Error("PRODUCT_NOT_FOUND");
    }

    // البحث عن الطلب المفتوح
    const {
        data: orders,
        error: ordersError
    } = await supabaseClient
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "جديد")
        .eq("warehouse", customerWarehouse)
        .order("id", {
            ascending: false
        })
        .limit(1);

    if (ordersError) {
        throw ordersError;
    }

    let order;

    // إنشاء طلب جديد إذا ما فيه طلب
    if (!orders || orders.length === 0) {

        const {
            data: newOrder,
            error: createError
        } = await supabaseClient
            .from("orders")
            .insert({

                user_id: user.id,

                customer_name:
                    user.user_metadata?.name ||
                    user.email ||
                    "عميل",

                customer_phone:
                    user.user_metadata?.phone ||
                    "",

                status: "جديد",

                total: 0,

                warehouse: customerWarehouse

            })
            .select()
            .single();

        if (createError) {
            throw createError;
        }

        order = newOrder;

    } else {

        order = orders[0];

    }

    // البحث عن المنتج داخل السلة
    const {
        data: existingItem,
        error: itemError
    } = await supabaseClient
        .from("order_items")
        .select("*")
        .eq("order_id", order.id)
        .eq("product_id", product.id)
        .maybeSingle();

    if (itemError) {
        throw itemError;
    }

    // إذا المنتج موجود نزيد الكمية
    if (existingItem) {

        const newQuantity =
            (Number(existingItem.quantity) || 0) +
            quantity;

        const {
            error: updateError
        } = await supabaseClient
            .from("order_items")
            .update({

                quantity: newQuantity,

                product_code:
                    product.product_code

            })
            .eq(
                "id",
                existingItem.id
            );

        if (updateError) {
            throw updateError;
        }

    }

    // إذا المنتج غير موجود نضيفه
    else {

        const {
            error: insertError
        } = await supabaseClient
            .from("order_items")
            .insert({

                order_id:
                    order.id,

                product_id:
                    product.id,

                quantity:
                    quantity,

                product_code:
                    product.product_code,

                category:
                    product.category,

                product_type:
                    product.product_type,

                type:
                    product.type,

                company:
                    product.company,

                model:
                    product.model,

                color:
                    product.color,

                price:
                    product.price,

                image:
                    product.image

            });

        if (insertError) {
            throw insertError;
        }

    }

    // إعادة حساب الإجمالي
    const {
        data: items,
        error: totalError
    } = await supabaseClient
        .from("order_items")
        .select("quantity, price")
        .eq(
            "order_id",
            order.id
        );

    if (totalError) {
        throw totalError;
    }

    if (items) {

        const total =
            items.reduce(
                (sum, item) => {

                    return (
                        sum +
                        (
                            Number(item.price) || 0
                        ) *
                        (
                            Number(item.quantity) || 1
                        )
                    );

                },
                0
            );

        const {
            error: updateTotalError
        } = await supabaseClient
            .from("orders")
            .update({
                total: total
            })
            .eq(
                "id",
                order.id
            );

        if (updateTotalError) {
            throw updateTotalError;
        }

    }

    // مهم جدًا:
    // لا يوجد alert هنا
}
