let allProducts = [];


/* =========================================================
   تحميل المنتجات
========================================================= */

async function loadProducts() {

    const container = document.getElementById("products");

    if (!container) return;

    container.innerHTML = `
        <div class="loading">
            جاري تحميل المنتجات...
        </div>
    `;

    const params = new URLSearchParams(window.location.search);

    const category = params.get("category");
    const productType = params.get("type");

    let query = supabaseClient
        .from("products")
        .select("*");

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

allProducts = allData;

console.log("عدد المنتجات المحملة كامل:", allProducts.length);

renderProducts(allProducts);
setupFilters();
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


            <p>
                ${uniqueModels.length}
                موديل متوفر
            </p>


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

            openProductModal(variants);
        });


        /*
           زر +
        */

        const addButton =
            card.querySelector(".add-button");

        addButton.addEventListener("click", function(e) {

            e.stopPropagation();

            openProductModal(variants);
        });


        container.appendChild(card);

    });

}


/* =========================================================
   البحث
========================================================= */
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
                        disabled
                    >

                        <option value="">
                            اختر الماركة أولاً
                        </option>

                    </select>


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


    let selectedColorProducts = [];


    /* =====================================================
       اختيار الماركة
    ===================================================== */

    companySelect.addEventListener("change", function () {

        const company =
            this.value.trim();

        modelSelect.innerHTML = `
            <option value="">
                اختر الموديل
            </option>
        `;

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


        modelSelect.disabled =
            models.length === 0;

    });


    /* =====================================================
       اختيار الموديل
    ===================================================== */

    modelSelect.addEventListener("change", function () {

        const company =
            companySelect.value.trim();

        const model =
            this.value.trim();


        colorsContainer.innerHTML = "";

        stockSummary.textContent =
            "اختر اللون";

        addButton.disabled = true;

        selectedColorProducts = [];


        if (!company || !model) {
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

                    String(product.model || "")
                        .trim()
                        .toLowerCase()
                    ===
                    model.toLowerCase()

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


        if (colorProducts.length === 0) {

            stockSummary.textContent =
                "لا توجد منتجات لهذا الموديل";

            return;
        }


        selectedColorProducts =
            colorProducts;


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

        colorProducts.forEach((product, index) => {

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


            const product =
                selectedColorProducts.find(
                    p =>
                        String(p.id) ===
                        String(row.dataset.productId)
                );


            const quantity =
                parseInt(input.value) || 0;


            totalSelected +=
                quantity;


            if (product) {

                totalStock +=
                    Math.max(
                        0,
                        Number(product.quantity) || 0
                    );

            }

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

    /* =========================================================
   إضافة المنتج للسلة - سريع وفوري
========================================================= */

addButton.onclick = async function () {

    /* ==========================================
       منع الضغط المتكرر
    ========================================== */

    if (addButton.disabled) {
        return;
    }

    addButton.disabled = true;
    addButton.textContent = "✓ تمت الإضافة";


    /* ==========================================
       جمع الكميات المختارة
    ========================================== */

    const rows =
        colorsContainer.querySelectorAll(
            ".color-quantity-row"
        );

    const selectedItems = [];


    rows.forEach(row => {

        const input =
            row.querySelector(
                ".color-quantity-input"
            );

        const quantity =
            parseInt(input.value) || 0;


        if (quantity <= 0) {
            return;
        }


        const product =
            selectedColorProducts.find(
                p =>
                    String(p.id) ===
                    String(row.dataset.productId)
            );


        if (product) {

            selectedItems.push({

                product: product,

                quantity: quantity

            });

        }

    });


    /* ==========================================
       التأكد من وجود منتجات
    ========================================== */

    if (selectedItems.length === 0) {

        alert("اختر كمية لون واحد على الأقل");

        addButton.disabled = false;
        addButton.textContent =
            "إضافة للسلة";

        return;
    }


    /* ==========================================
       إغلاق النافذة فورًا
    ========================================== */

    closeProductModal();


    /* ==========================================
       رسالة فورية للمستخدم
    ========================================== */

    showFastCartMessage(
        `✓ تمت إضافة ${selectedItems.reduce(
            (sum, item) =>
                sum + item.quantity,
            0
        )} قطعة إلى السلة`
    );


    /* ==========================================
       الإضافة في الخلفية
    ========================================== */

    try {

        /* --------------------------------------
           التأكد من تسجيل الدخول
        -------------------------------------- */

        const {
            data: { user },
            error: userError
        } =
            await supabaseClient.auth.getUser();


        if (userError || !user) {

            console.error(
                "المستخدم غير مسجل الدخول"
            );

            showFastCartMessage(
                "⚠️ يجب تسجيل الدخول أولاً"
            );

            window.location.href =
                "login.html";

            return;
        }


        /* --------------------------------------
           إضافة المنتجات واحدًا واحدًا
        -------------------------------------- */

        for (const item of selectedItems) {

            try {

                await addProduct(
                    item.product,
                    item.quantity
                );

            } catch (error) {

                console.error(
                    "خطأ إضافة المنتج:",
                    error
                );

            }

        }


        console.log(
            "✓ تمت إضافة المنتجات للسلة بنجاح"
        );


    } catch (error) {

        console.error(
            "خطأ إضافة المنتجات للسلة:",
            error
        );

        showFastCartMessage(
            "⚠️ حدث خطأ أثناء إضافة المنتج"
        );

    }

};


/* =========================================================
   رسالة سريعة للمستخدم
========================================================= */

function showFastCartMessage(message) {

    /* حذف الرسالة القديمة */

    const oldMessage =
        document.getElementById(
            "fastCartMessage"
        );

    if (oldMessage) {
        oldMessage.remove();
    }


    /* إنشاء الرسالة */

    const messageBox =
        document.createElement("div");

    messageBox.id =
        "fastCartMessage";

    messageBox.textContent =
        message;


    messageBox.style.cssText = `

        position: fixed;

        top: 20px;

        left: 50%;

        transform: translateX(-50%);

        z-index: 9999999;

        background: #4935b5;

        color: white;

        padding: 14px 22px;

        border-radius: 14px;

        font-size: 15px;

        font-weight: 800;

        box-shadow:
            0 10px 30px
            rgba(0,0,0,0.18);

        direction: rtl;

        white-space: nowrap;

        animation:
            fastCartMessageIn
            0.15s ease;

    `;


    document.body.appendChild(
        messageBox
    );


    /* إزالة الرسالة بعد فترة */

    setTimeout(() => {

        if (messageBox) {

            messageBox.style.opacity =
                "0";

            messageBox.style.transition =
                "opacity 0.2s";

            setTimeout(() => {

                messageBox.remove();

            }, 200);

        }

    }, 1800);

}

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


@keyframes fastCartMessageIn {

    from {
        opacity: 0;
        transform:
            translateX(-50%)
            translateY(-10px);
    }

    to {
        opacity: 1;
        transform:
            translateX(-50%)
            translateY(0);
    }

}
    `;


    document.head.appendChild(style);
}


/* =========================================================
   التشغيل
========================================================= */

loadProducts();

setupFilters();


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

                total: 0

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