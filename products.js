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

    const { data, error } = await query
        .order("id", { ascending: true });

    if (error) {

        console.error("Supabase Error:", error);

        container.innerHTML = `
            <div class="message error">
                حدث خطأ في تحميل المنتجات
            </div>
        `;

        return;
    }

    allProducts = data || [];

    renderProducts(allProducts);
}


/* =========================================================
   تجميع المنتجات حسب TYPE
========================================================= */

function groupProductsByType(products) {

    const groups = {};

    products.forEach(product => {

        const type = (product.type || "منتج").trim();

        if (!groups[type]) {
            groups[type] = [];
        }

        groups[type].push(product);
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

    const groups = groupProductsByType(products);


    Object.keys(groups).forEach(type => {

        const variants = groups[type];

        const card = document.createElement("div");

        card.className = "product-card";


        // أول منتج نستخدم صورته وسعره للبطاقة
        const firstProduct = variants[0];


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


            <p>
                ${uniqueModels.length}
                موديل متوفر
            </p>


            <div class="product-bottom">

                <span class="price">
                    ${
                        firstProduct.price != null
                        ? "من " + firstProduct.price + " ر.س"
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


    if (!search) {

        renderProducts(allProducts);

        return;
    }


    const filtered =
        allProducts.filter(product => {

            const text = `

                ${product.model || ""}

                ${product.company || ""}

                ${product.type || ""}

                ${product.color || ""}

            `.toLowerCase();


            return text.includes(search);

        });


    renderProducts(filtered);
}


/* =========================================================
   الفلاتر
========================================================= */

function setupFilters() {

    const filters =
        document.querySelectorAll(".filter");


    filters.forEach(button => {

        button.addEventListener(
            "click",
            function() {

                filters.forEach(item => {

                    item.classList.remove("active");

                });


                button.classList.add("active");


                const selected =
                    button.textContent.trim();


                if (selected === "الكل") {

                    renderProducts(allProducts);

                    return;
                }


                /*
                   الفلتر يعتمد على TYPE
                   وليس product_type
                */

                const filtered =
                    allProducts.filter(product => {

                        return (
                            (product.type || "")
                                .trim()
                                .toLowerCase()
                            ===
                            selected
                                .trim()
                                .toLowerCase()
                        );

                    });


                renderProducts(filtered);

            }
        );

    });

}


/* =========================================================
   فتح نافذة اختيار المنتج
========================================================= */

function openProductModal(variants) {

    /*
       نحذف أي نافذة قديمة
    */

    const oldModal =
        document.getElementById("productSelectModal");

    if (oldModal) {
        oldModal.remove();
    }


    /*
       منع التكرار
    */

    if (!variants || variants.length === 0) {
        return;
    }


    /* =====================================================
       الشركات الموجودة لهذا TYPE
    ===================================================== */

    const companies = [
        ...new Set(
            variants
                .map(p => (p.company || "").trim())
                .filter(Boolean)
        )
    ];


    /*
       إنشاء النافذة
    */

    const modal =
        document.createElement("div");

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
                        ${variants[0].type || ""}
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


                    <!-- اللون -->

                    <label>
                        اللون
                    </label>

                    <select
                        id="colorSelect"
                        class="product-select"
                        disabled
                    >

                        <option value="">
                            اختر الموديل أولاً
                        </option>

                    </select>


                    <!-- السعر -->

                    <div
                        id="selectedProductPrice"
                        class="selected-product-price"
                    >
                        اختر المنتج
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
    `;


    document.body.appendChild(modal);


    /*
       إضافة CSS للنافذة
       حتى تشتغل حتى لو ما عندك CSS خاص بها
    */

    addProductModalStyles();


    /*
       منع الصفحة من التحرك أثناء فتح النافذة
    */

    document.body.style.overflow = "hidden";


    /* =====================================================
       العناصر
    ===================================================== */

    const companySelect =
        document.getElementById("companySelect");

    const modelSelect =
        document.getElementById("modelSelect");

    const colorSelect =
        document.getElementById("colorSelect");

    const priceBox =
        document.getElementById("selectedProductPrice");

    const addButton =
        document.getElementById("confirmAddProduct");


    let selectedProduct = null;


    /* =====================================================
       اختيار الماركة
    ===================================================== */

    companySelect.addEventListener(
        "change",
        function() {

            const company =
                this.value.trim();


            /*
               تصفير الموديل واللون
            */

            modelSelect.innerHTML = `
                <option value="">
                    اختر الموديل
                </option>
            `;

            colorSelect.innerHTML = `
                <option value="">
                    اختر الموديل أولاً
                </option>
            `;

            modelSelect.disabled = true;
            colorSelect.disabled = true;

            addButton.disabled = true;

            selectedProduct = null;

            priceBox.textContent =
                "اختر الموديل";


            if (!company) {
                return;
            }


            /*
               جلب موديلات الشركة فقط
            */

            const companyProducts =
                variants.filter(product => {

                    return (
                        (product.company || "")
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
                            (p.model || "").trim()
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

        }
    );


    /* =====================================================
       اختيار الموديل
    ===================================================== */

    modelSelect.addEventListener(
        "change",
        function() {

            const company =
                companySelect.value.trim();

            const model =
                this.value.trim();


            colorSelect.innerHTML = `
                <option value="">
                    اختر اللون
                </option>
            `;

            colorSelect.disabled = true;

            addButton.disabled = true;

            selectedProduct = null;


            if (!company || !model) {

                priceBox.textContent =
                    "اختر اللون";

                return;
            }


            /*
               المنتجات التي تطابق:
               الشركة + الموديل
            */

            const modelProducts =
                variants.filter(product => {

                    return (

                        (product.company || "")
                            .trim()
                            .toLowerCase()
                        ===
                        company
                            .toLowerCase()

                        &&

                        (product.model || "")
                            .trim()
                            .toLowerCase()
                        ===
                        model
                            .toLowerCase()

                    );

                });


            /*
               الألوان الموجودة لهذا الموديل
            */

            const colors = [
                ...new Set(
                    modelProducts
                        .map(p =>
                            (p.color || "").trim()
                        )
                        .filter(Boolean)
                )
            ];


            /*
               إذا ما فيه ألوان
            */

            if (colors.length === 0) {

                /*
                   إذا فيه منتج واحد فقط
                   نستخدمه مباشرة
                */

                if (modelProducts.length === 1) {

                    selectedProduct =
                        modelProducts[0];

                    showSelectedProductPrice(
                        selectedProduct,
                        priceBox
                    );

                    addButton.disabled = false;

                } else {

                    priceBox.textContent =
                        "لا يوجد لون محدد";

                }

                return;
            }


            /*
               إضافة الألوان
            */

            colors.forEach(color => {

                const option =
                    document.createElement("option");

                option.value = color;

                option.textContent = color;

                colorSelect.appendChild(option);

            });


            colorSelect.disabled = false;

            priceBox.textContent =
                "اختر اللون";

        }
    );


    /* =====================================================
       اختيار اللون
    ===================================================== */

    colorSelect.addEventListener(
        "change",
        function() {

            const company =
                companySelect.value.trim();

            const model =
                modelSelect.value.trim();

            const color =
                this.value.trim();


            if (!company || !model || !color) {

                selectedProduct = null;

                addButton.disabled = true;

                priceBox.textContent =
                    "اختر اللون";

                return;
            }


            /*
               العثور على المنتج الحقيقي
            */

            selectedProduct =
                variants.find(product => {

                    return (

                        (product.company || "")
                            .trim()
                            .toLowerCase()
                        ===
                        company
                            .toLowerCase()

                        &&

                        (product.model || "")
                            .trim()
                            .toLowerCase()
                        ===
                        model
                            .toLowerCase()

                        &&

                        (product.color || "")
                            .trim()
                            .toLowerCase()
                        ===
                        color
                            .toLowerCase()

                    );

                });


            if (!selectedProduct) {

                priceBox.textContent =
                    "المنتج غير موجود";

                addButton.disabled = true;

                return;
            }


            showSelectedProductPrice(
                selectedProduct,
                priceBox
            );


            addButton.disabled = false;

        }
    );


    /* =====================================================
       إضافة المنتج للسلة
    ===================================================== */

   addButton.addEventListener(
    "click",
    async function() {

        if (!selectedProduct) {

            alert("اختر الماركة والموديل واللون أولاً");

            return;
        }

        /*
           إضافة المنتج للسلة
           بدون إغلاق البطاقة
        */

        await addProduct(
            selectedProduct.id
        );

        /*
           بعد الإضافة:
           نخلي البطاقة مفتوحة
           ونصفر الاختيارات عشان يقدر
           يختار موديل/لون ثاني مباشرة
        */

        selectedProduct = null;

        companySelect.value = "";

        modelSelect.innerHTML = `
            <option value="">
                اختر الماركة أولاً
            </option>
        `;

        colorSelect.innerHTML = `
            <option value="">
                اختر الموديل أولاً
            </option>
        `;

        modelSelect.disabled = true;
        colorSelect.disabled = true;

        priceBox.textContent = "اختر المنتج";

        addButton.disabled = true;

    }
);


    /* =====================================================
       زر الإغلاق
    ===================================================== */

    document
        .getElementById("closeProductModal")
        .addEventListener(
            "click",
            closeProductModal
        );


    /*
       الضغط خارج النافذة
    */

    modal
        .querySelector(".product-modal-overlay")
        .addEventListener(
            "click",
            function(e) {

                if (
                    e.target === this
                ) {

                    closeProductModal();

                }

            }
        );

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

            padding: 20px;

            overflow-y: auto;
        }


        .product-modal-box {

            width: 100%;
            max-width: 520px;

            max-height: 90vh;

            background: white;

            border-radius: 24px;

            position: relative;

            box-shadow:
                0 25px 70px
                rgba(0,0,0,0.25);

            overflow: hidden;
        }


        .product-modal-content {

            padding: 30px;

            max-height: 90vh;

            overflow-y: auto;
        }


        .product-modal-close {

            position: absolute;

            top: 15px;
            left: 15px;

            width: 44px;
            height: 44px;

            border: none;

            border-radius: 50%;

            background: #f1f1f1;

            font-size: 28px;

            cursor: pointer;

            z-index: 2;
        }


        .product-modal-close:hover {
            background: #e5e5e5;
        }


        .modal-icon {

            text-align: center;

            font-size: 45px;

            margin-bottom: 5px;
        }


        .modal-type {

            text-align: center;

            font-size: 14px;

            color: #555;

            margin-bottom: 5px;
        }


        .product-modal-content h2 {

            text-align: center;

            margin-top: 5px;

            margin-bottom: 25px;
        }


        .product-modal-content label {

            display: block;

            font-weight: bold;

            margin:

                14px

                0

                7px;
        }


        .product-select {

            width: 100%;

            height: 50px;

            padding: 0 14px;

            border: 1px solid #ddd;

            border-radius: 12px;

            background: white;

            font-size: 16px;

            outline: none;
        }


        .product-select:focus {

            border-color: #4935b5;

            box-shadow:
                0 0 0 3px
                rgba(73,53,181,0.1);
        }


        .product-select:disabled {

            background: #f4f4f4;

            color: #999;

            cursor: not-allowed;
        }


        .selected-product-price {

            margin-top: 22px;

            padding: 16px;

            background: #f7f7f7;

            border-radius: 14px;

            text-align: center;

            line-height: 1.8;

            min-height: 30px;
        }


        .modal-price {

            font-size: 22px;

            font-weight: bold;

            margin-top: 5px;
        }


        .confirm-add-product {

            width: 100%;

            height: 52px;

            margin-top: 18px;

            border: none;

            border-radius: 14px;

            background: #4935b5;

            color: white;

            font-size: 17px;

            font-weight: bold;

            cursor: pointer;
        }


        .confirm-add-product:hover {

            opacity: 0.9;
        }


        .confirm-add-product:disabled {

            background: #ccc;

            cursor: not-allowed;
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

async function addProduct(productId) {

    try {

        /* =========================
           التأكد من تسجيل الدخول
        ========================= */

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError || !user) {

            alert("يجب تسجيل الدخول أولاً");

            window.location.href =
                "login.html";

            return;
        }


        /* =========================
           البحث عن المنتج
        ========================= */

        const product =
            allProducts.find(
                item =>
                    item.id === productId
            );


        if (!product) {

            alert("المنتج غير موجود");

            return;
        }


        /* =========================
           البحث عن طلب مفتوح
        ========================= */

        let {
            data: orders,
            error: ordersError
        } =
            await supabaseClient
                .from("orders")
                .select("*")
                .eq("user_id", user.id)
                .eq("status", "جديد")
                .order("id", {
                    ascending: false
                })
                .limit(1);


        if (ordersError) {

            console.error(
                "خطأ البحث عن الطلب:",
                ordersError
            );

            alert(
                "حدث خطأ أثناء البحث عن الطلب"
            );

            return;
        }


        /* =========================
           إنشاء طلب جديد
        ========================= */

        let order;


        if (
            !orders ||
            orders.length === 0
        ) {

            const {
                data: newOrder,
                error: createError
            } =
                await supabaseClient
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

                console.error(
                    "خطأ إنشاء الطلب:",
                    createError
                );

                alert(
                    "حدث خطأ أثناء إنشاء الطلب"
                );

                return;
            }


            order = newOrder;

        } else {

            order = orders[0];

        }


        /* =========================
           البحث عن المنتج بالسلة
        ========================= */

        const {
            data: existingItem,
            error: itemError
        } =
            await supabaseClient
                .from("order_items")
                .select("*")
                .eq("order_id", order.id)
                .eq("product_id", product.id)
                .maybeSingle();


        if (itemError) {

            console.error(
                "خطأ البحث عن المنتج في السلة:",
                itemError
            );

            alert(
                "حدث خطأ أثناء البحث عن المنتج"
            );

            return;
        }


        /* =========================
           المنتج موجود
        ========================= */

        if (existingItem) {

            const newQuantity =
                (existingItem.quantity || 1) + 1;


            const {
                error: updateError
            } =
                await supabaseClient
                    .from("order_items")
                    .update({

                        quantity:
                            newQuantity

                    })
                    .eq(
                        "id",
                        existingItem.id
                    );


            if (updateError) {

                console.error(
                    "خطأ تحديث الكمية:",
                    updateError
                );

                alert(
                    "حدث خطأ أثناء تحديث الكمية"
                );

                return;
            }

        }


        /* =========================
           المنتج غير موجود
        ========================= */

        else {

            const {
                error: insertError
            } =
                await supabaseClient
                    .from("order_items")
                    .insert({

                        order_id:
                            order.id,

                        product_id:
                            product.id,

                        quantity:
                            1,

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

                console.error(
                    "خطأ إضافة المنتج:",
                    insertError
                );

                alert(
                    "حدث خطأ أثناء إضافة المنتج"
                );

                return;
            }

        }


        /* =========================
           حساب الإجمالي
        ========================= */

        const {
            data: items,
            error: totalError
        } =
            await supabaseClient
                .from("order_items")
                .select(
                    "quantity, price"
                )
                .eq(
                    "order_id",
                    order.id
                );


        if (
            !totalError &&
            items
        ) {

            const total =
                items.reduce(
                    (
                        sum,
                        item
                    ) => {

                        return (
                            sum +
                            (
                                Number(
                                    item.price
                                ) || 0
                            ) *
                            (
                                Number(
                                    item.quantity
                                ) || 1
                            )
                        );

                    },
                    0
                );


            await supabaseClient
                .from("orders")
                .update({

                    total: total

                })
                .eq(
                    "id",
                    order.id
                );
        }


        /* =========================
           رسالة النجاح
        ========================= */

        alert(
            "تمت إضافة " +
            (
                product.model ||
                "المنتج"
            ) +
            (
                product.color
                ?
                " - " + product.color
                :
                ""
            ) +
            " إلى السلة"
        );


    } catch (error) {

        console.error(
            "خطأ غير متوقع:",
            error
        );

        alert(
            "حدث خطأ غير متوقع"
        );

    }

}