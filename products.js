let allProducts = [];
let groupedProducts = [];


/* =========================
   تحميل المنتجات
========================= */

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

    groupProducts();

    renderProducts(groupedProducts);
}


/* =========================
   تجميع المنتجات حسب TYPE
========================= */

function groupProducts() {

    const groups = {};

    allProducts.forEach(product => {

        const type =
            (product.type || "منتج")
                .trim();

        if (!groups[type]) {

            groups[type] = {
                type: type,
                products: [],
                models: [],
                colors: [],
                image: product.image || null,
                price: product.price ?? 0
            };
        }

        groups[type].products.push(product);


        /* الموديلات */

        if (
            product.model &&
            !groups[type].models.includes(product.model)
        ) {

            groups[type].models.push(product.model);

        }


        /* الألوان */

        if (
            product.color &&
            !groups[type].colors.includes(product.color)
        ) {

            groups[type].colors.push(product.color);

        }


        /* أول صورة */

        if (
            !groups[type].image &&
            product.image
        ) {

            groups[type].image = product.image;

        }

    });


    groupedProducts =
        Object.values(groups);
}


/* =========================
   عرض البطاقات المجمعة
========================= */

function renderProducts(products) {

    const container =
        document.getElementById("products");

    if (!container) return;

    container.innerHTML = "";


    if (products.length === 0) {

        container.innerHTML = `
            <div class="message">
                لا توجد منتجات بهذا النوع
            </div>
        `;

        return;
    }


    products.forEach(group => {

        const card =
            document.createElement("div");

        card.className = "product-card";


        card.innerHTML = `

            <div class="product-image">

                ${
                    group.image

                    ? `
                        <img
                            src="${group.image}"
                            alt="${group.type}"
                        >
                    `

                    : "📱"
                }

            </div>


            <div class="product-type">
                ${group.type}
            </div>


            <h3>
                ${group.type}
            </h3>


            <p>
                ${group.models.length}
                موديل متوفر
            </p>


            <div class="product-bottom">

                <span class="price">
                    من ${group.price} ر.س
                </span>


                <button
                    class="add-button"
                    type="button"
                >
                    +
                </button>

            </div>

        `;


        /* الضغط على البطاقة */

        card.addEventListener("click", function(e) {

            /*
                إذا ضغط على زر +
                لا نفتح النافذة
            */

            if (
                e.target.closest(".add-button")
            ) {

                return;

            }


            openProductModal(group);

        });


        /* زر الإضافة */

        const addButton =
            card.querySelector(".add-button");

        addButton.addEventListener(
            "click",
            function(e) {

                e.stopPropagation();

                openProductModal(group);

            }
        );


        container.appendChild(card);

    });

}


/* =========================
   نافذة المنتج
========================= */

function openProductModal(group) {

    /* حذف أي نافذة قديمة */

    const oldModal =
        document.getElementById("productModal");

    if (oldModal) {

        oldModal.remove();

    }


    const modal =
        document.createElement("div");

    modal.id = "productModal";

    modal.className = "product-modal";


    modal.innerHTML = `

        <div class="product-modal-box">


            <button
                class="modal-close"
                type="button"
            >
                ×
            </button>


            <div class="modal-image">

                ${
                    group.image

                    ? `
                        <img
                            src="${group.image}"
                            alt="${group.type}"
                        >
                    `

                    : "📱"
                }

            </div>


            <h2>
                ${group.type}
            </h2>


            <p class="modal-subtitle">
                اختر الموديل واللون
            </p>


            <div class="option-section">

                <label>
                    الموديل
                </label>


                <select id="modalModel">

                    <option value="">
                        اختر الموديل
                    </option>

                    ${
                        group.models
                            .map(model => `
                                <option value="${escapeHtml(model)}">
                                    ${escapeHtml(model)}
                                </option>
                            `)
                            .join("")
                    }

                </select>

            </div>


            <div class="option-section">

                <label>
                    اللون
                </label>


                <select id="modalColor">

                    <option value="">
                        اختر اللون
                    </option>

                    ${
                        group.colors.length

                        ? group.colors
                            .map(color => `
                                <option value="${escapeHtml(color)}">
                                    ${escapeHtml(color)}
                                </option>
                            `)
                            .join("")

                        : `
                            <option value="">
                                لا توجد ألوان محددة
                            </option>
                        `
                    }

                </select>

            </div>


            <div
                id="modalPrice"
                class="modal-price"
            >
                ${group.price} ر.س
            </div>


            <button
                id="modalAddButton"
                class="modal-add-button"
                type="button"
            >
                إضافة إلى السلة
            </button>


        </div>

    `;


    document.body.appendChild(modal);


    /* إغلاق */

    modal
        .querySelector(".modal-close")
        .addEventListener(
            "click",
            function() {

                modal.remove();

            }
        );


    /* الضغط خارج البطاقة */

    modal.addEventListener(
        "click",
        function(e) {

            if (e.target === modal) {

                modal.remove();

            }

        }
    );


    /* زر إضافة للسلة */

    modal
        .querySelector("#modalAddButton")
        .addEventListener(
            "click",
            async function() {

                const model =
                    document.getElementById(
                        "modalModel"
                    ).value;

                const color =
                    document.getElementById(
                        "modalColor"
                    ).value;


                if (!model) {

                    alert("اختر الموديل أولاً");

                    return;

                }


                /*
                    نبحث عن المنتج الحقيقي
                    الذي يطابق الموديل واللون
                */

                let selectedProduct =
                    group.products.find(product => {

                        const modelMatch =
                            product.model === model;

                        const colorMatch =
                            !color ||
                            product.color === color;

                        return modelMatch &&
                               colorMatch;

                    });


                /*
                    إذا اللون غير موجود
                    نبحث بالموديل فقط
                */

                if (!selectedProduct) {

                    selectedProduct =
                        group.products.find(
                            product =>
                                product.model === model
                        );

                }


                if (!selectedProduct) {

                    alert(
                        "هذا الموديل غير متوفر"
                    );

                    return;

                }


                await addProduct(
                    selectedProduct.id
                );


                modal.remove();

            }
        );

}


/* =========================
   حماية HTML
========================= */

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================
   البحث
========================= */

function searchProducts() {

    const input =
        document.getElementById("searchInput");

    if (!input) return;


    const search =
        input.value
            .toLowerCase()
            .trim();


    if (!search) {

        renderProducts(groupedProducts);

        return;

    }


    const filtered =
        groupedProducts.filter(group => {

            const text = `

                ${group.type}

                ${group.models.join(" ")}

                ${group.colors.join(" ")}

            `.toLowerCase();


            return text.includes(search);

        });


    renderProducts(filtered);

}


/* =========================
   الفلاتر
========================= */

function setupFilters() {

    const filters =
        document.querySelectorAll(".filter");


    filters.forEach(button => {

        button.addEventListener(
            "click",
            function() {

                filters.forEach(item => {

                    item.classList.remove(
                        "active"
                    );

                });


                button.classList.add(
                    "active"
                );


                const selected =
                    button.textContent
                        .trim();


                if (selected === "الكل") {

                    renderProducts(
                        groupedProducts
                    );

                    return;

                }


                const filtered =
                    groupedProducts.filter(
                        group =>

                            group.type
                                .trim()
                                .toLowerCase()

                            ===

                            selected
                                .trim()
                                .toLowerCase()
                    );


                renderProducts(filtered);

            }
        );

    });

}


/* =========================
   إضافة للسلة
========================= */

async function addProduct(productId) {

    try {

        const {
            data: { user },
            error: userError
        } =
        await supabaseClient.auth.getUser();


        if (userError || !user) {

            alert(
                "يجب تسجيل الدخول أولاً"
            );

            window.location.href =
                "login.html";

            return;

        }


        const product =
            allProducts.find(
                item => item.id === productId
            );


        if (!product) {

            alert(
                "المنتج غير موجود"
            );

            return;

        }


        /* البحث عن الطلب المفتوح */

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


        let order;


        /* إنشاء طلب */

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


        /* البحث عن المنتج */

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
                "خطأ البحث عن المنتج:",
                itemError
            );

            alert(
                "حدث خطأ أثناء البحث عن المنتج"
            );

            return;

        }


        /* زيادة الكمية */

        if (existingItem) {

            const newQuantity =
                (existingItem.quantity || 1) + 1;


            const {
                error: updateError
            } =
            await supabaseClient
                .from("order_items")
                .update({

                    quantity: newQuantity

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


        /* إضافة المنتج */

        else {

            const {
                error: insertError
            } =
            await supabaseClient
                .from("order_items")
                .insert({

                    order_id: order.id,

                    product_id: product.id,

                    quantity: 1,

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


        /* حساب الإجمالي */

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
                    ) =>

                        sum +

                        (
                            Number(
                                item.price
                            ) || 0
                        )

                        *

                        (
                            Number(
                                item.quantity
                            ) || 1
                        ),

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


        alert(
            "تمت إضافة " +
            (
                product.model ||
                "المنتج"
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


/* =========================
   التشغيل
========================= */

loadProducts();

setupFilters();