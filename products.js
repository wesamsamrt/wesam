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

    /*
        هنا التجميع الحقيقي

        كل المنتجات التي لها نفس product_type
        تصبح بطاقة واحدة
    */

    groupedProducts = groupProducts(allProducts);

    renderProducts(groupedProducts);
}


/* =========================
   تجميع المنتجات
========================= */

function groupProducts(products) {

    const groups = new Map();

    products.forEach(product => {

        const productType =
            (product.product_type || "منتج")
                .trim();

        if (!groups.has(productType)) {

            groups.set(productType, {
                product_type: productType,
                products: []
            });

        }

        groups.get(productType).products.push(product);

    });

    return Array.from(groups.values());
}


/* =========================
   عرض البطاقات المجمعة
========================= */

function renderProducts(groups) {

    const container =
        document.getElementById("products");

    if (!container) return;

    container.innerHTML = "";

    if (!groups || groups.length === 0) {

        container.innerHTML = `
            <div class="message">
                لا توجد منتجات بهذا النوع
            </div>
        `;

        return;
    }


    groups.forEach(group => {

        const firstProduct =
            group.products[0];

        const card =
            document.createElement("div");

        card.className = "product-card";


        /*
            عند الضغط على البطاقة
            نفتح النافذة
        */

        card.addEventListener("click", () => {

            openProductModal(group);

        });


        card.innerHTML = `

            <div class="product-image">

                ${
                    firstProduct.image

                    ? `
                        <img
                            src="${firstProduct.image}"
                            alt="${group.product_type}"
                        >
                    `

                    : "📱"
                }

            </div>


            <div class="product-type">

                ${group.product_type}

            </div>


            <h3>

                ${group.product_type}

            </h3>


            <p>

                ${
                    group.products.length
                }

                خيار متوفر

            </p>


            <div class="product-bottom">

                <span class="price">

                    ${
                        firstProduct.price ?? 0
                    }

                    ر.س

                </span>


                <button
                    class="add-button"
                    type="button"
                >
                    +
                </button>

            </div>

        `;


        /*
            زر + يفتح نفس النافذة
            بدل الإضافة المباشرة
        */

        const addButton =
            card.querySelector(".add-button");


        addButton.addEventListener(
            "click",
            function(event) {

                event.stopPropagation();

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

    closeProductModal();


    const products =
        group.products || [];


    if (products.length === 0) return;


    /*
        إنشاء النافذة
        تلقائياً حتى ما يصير
        null.innerHTML
    */

    const modal =
        document.createElement("div");

    modal.id = "productModal";

    modal.className = "product-modal";


    modal.innerHTML = `

        <div class="product-modal-overlay"></div>


        <div class="product-modal-box">


            <button
                class="product-modal-close"
                type="button"
            >
                ×
            </button>


            <div class="modal-product-image">

                ${
                    products[0].image

                    ? `
                        <img
                            id="modalProductImage"
                            src="${products[0].image}"
                            alt="${group.product_type}"
                        >
                    `

                    : `
                        <div class="modal-no-image">
                            📱
                        </div>
                    `
                }

            </div>


            <div class="modal-product-info">


                <div class="modal-product-type">

                    ${group.product_type}

                </div>


                <h2>

                    ${group.product_type}

                </h2>


                <!-- الموديل -->

                <label>

                    الموديل

                </label>


                <select
                    id="modalModel"
                    class="product-select"
                >

                </select>


                <!-- اللون -->

                <label>

                    اللون

                </label>


                <select
                    id="modalColor"
                    class="product-select"
                >

                </select>


                <!-- السعر -->

                <div class="modal-price">

                    <span>

                        السعر

                    </span>

                    <strong
                        id="modalPrice"
                    >
                        0 ر.س
                    </strong>

                </div>


                <button
                    id="modalAddButton"
                    class="modal-add-button"
                    type="button"
                >

                    + إضافة للسلة

                </button>


            </div>

        </div>

    `;


    document.body.appendChild(modal);


    const modelSelect =
        document.getElementById("modalModel");

    const colorSelect =
        document.getElementById("modalColor");


    /*
        إنشاء قائمة الموديلات
    */

    const models = [];


    products.forEach(product => {

        const company =
            (product.company || "")
                .trim();

        const model =
            (product.model || "")
                .trim();


        const key =
            company + "|||" + model;


        if (
            !models.some(
                item => item.key === key
            )
        ) {

            models.push({
                key: key,
                company: company,
                model: model
            });

        }

    });


    models.forEach(item => {

        const option =
            document.createElement("option");

        option.value = item.key;

        option.textContent =
            item.company
                ? `${item.company} — ${item.model}`
                : item.model;


        modelSelect.appendChild(option);

    });


    /*
        تحديث الألوان
        حسب الموديل
    */

    function updateColors() {

        colorSelect.innerHTML = "";


        const selectedModel =
            modelSelect.value;


        const selectedProducts =
            products.filter(product => {

                const key =
                    `${(product.company || "").trim()}|||${(product.model || "").trim()}`;

                return key === selectedModel;

            });


        const colors = [];


        selectedProducts.forEach(product => {

            const color =
                (product.color || "بدون لون")
                    .trim();


            if (!colors.includes(color)) {

                colors.push(color);

            }

        });


        colors.forEach(color => {

            const option =
                document.createElement("option");

            option.value = color;

            option.textContent = color;

            colorSelect.appendChild(option);

        });


        updateSelectedProduct();

    }


    /*
        معرفة المنتج المحدد
        وتحديث السعر والصورة
    */

    function updateSelectedProduct() {

        const selectedModel =
            modelSelect.value;

        const selectedColor =
            colorSelect.value;


        const selectedProduct =
            products.find(product => {

                const key =
                    `${(product.company || "").trim()}|||${(product.model || "").trim()}`;

                const color =
                    (product.color || "بدون لون")
                        .trim();

                return (
                    key === selectedModel &&
                    color === selectedColor
                );

            });


        if (!selectedProduct) return;


        const price =
            Number(selectedProduct.price) || 0;


        const priceElement =
            document.getElementById("modalPrice");


        if (priceElement) {

            priceElement.textContent =
                `${price} ر.س`;

        }


        const imageElement =
            document.getElementById(
                "modalProductImage"
            );


        if (
            imageElement &&
            selectedProduct.image
        ) {

            imageElement.src =
                selectedProduct.image;

        }


        /*
            نخزن المنتج المختار
            على زر الإضافة
        */

        const addButton =
            document.getElementById(
                "modalAddButton"
            );


        if (addButton) {

            addButton.dataset.productId =
                selectedProduct.id;

        }

    }


    /*
        أول تحميل
    */

    updateColors();


    /*
        إذا تغير الموديل
    */

    modelSelect.addEventListener(
        "change",
        updateColors
    );


    /*
        إذا تغير اللون
    */

    colorSelect.addEventListener(
        "change",
        updateSelectedProduct
    );


    /*
        زر إضافة للسلة
    */

    document
        .getElementById("modalAddButton")
        .addEventListener(
            "click",
            async function() {

                const productId =
                    Number(
                        this.dataset.productId
                    );


                if (!productId) {

                    alert(
                        "اختر الموديل واللون أولاً"
                    );

                    return;

                }


                await addProduct(
                    productId
                );

                closeProductModal();

            }
        );


    /*
        زر الإغلاق
    */

    document
        .querySelector(
            ".product-modal-close"
        )
        .addEventListener(
            "click",
            closeProductModal
        );


    /*
        الضغط خارج البطاقة
    */

    document
        .querySelector(
            ".product-modal-overlay"
        )
        .addEventListener(
            "click",
            closeProductModal
        );


    /*
        منع تحريك الصفحة خلف النافذة
    */

    document.body.classList.add(
        "modal-open"
    );

}


/* =========================
   إغلاق النافذة
========================= */

function closeProductModal() {

    const modal =
        document.getElementById(
            "productModal"
        );


    if (modal) {

        modal.remove();

    }


    document.body.classList.remove(
        "modal-open"
    );

}


/* =========================
   البحث
========================= */

function searchProducts() {

    const input =
        document.getElementById(
            "searchInput"
        );


    if (!input) return;


    const search =
        input.value
            .toLowerCase()
            .trim();


    if (!search) {

        renderProducts(
            groupedProducts
        );

        return;

    }


    /*
        البحث داخل جميع المنتجات
        ثم نعيد تجميع النتائج
    */

    const filteredProducts =
        allProducts.filter(product => {

            const text = `

                ${product.model || ""}

                ${product.company || ""}

                ${product.type || ""}

                ${product.color || ""}

                ${product.product_type || ""}

            `.toLowerCase();


            return text.includes(search);

        });


    const filteredGroups =
        groupProducts(
            filteredProducts
        );


    renderProducts(
        filteredGroups
    );

}


/* =========================
   الفلاتر
========================= */

function setupFilters() {

    const filters =
        document.querySelectorAll(
            ".filter"
        );


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


                if (
                    selected === "الكل"
                ) {

                    renderProducts(
                        groupedProducts
                    );

                    return;

                }


                /*
                    نبحث عن المجموعات التي
                    تحتوي على هذا النوع
                */

                const filtered =
                    groupedProducts.filter(
                        group => {

                            return group.products.some(
                                product =>
                                    (
                                        product.type ||
                                        ""
                                    )
                                    .trim()
                                    .toLowerCase()
                                    ===
                                    selected
                                        .trim()
                                        .toLowerCase()
                            );

                        }
                    );


                renderProducts(
                    filtered
                );

            }
        );

    });

}


/* =========================
   إضافة المنتج للسلة
========================= */

async function addProduct(productId) {

    try {

        const {
            data: { user },
            error: userError
        } =
            await supabaseClient.auth.getUser();


        if (
            userError ||
            !user
        ) {

            alert(
                "يجب تسجيل الدخول أولاً"
            );

            window.location.href =
                "login.html";

            return;

        }


        /*
            نبحث في كل المنتجات
        */

        const product =
            allProducts.find(
                item =>
                    Number(item.id) ===
                    Number(productId)
            );


        if (!product) {

            alert(
                "المنتج غير موجود"
            );

            return;

        }


        /*
            البحث عن الطلب المفتوح
        */

        let {
            data: orders,
            error: ordersError
        } =
            await supabaseClient
                .from("orders")
                .select("*")
                .eq(
                    "user_id",
                    user.id
                )
                .eq(
                    "status",
                    "جديد"
                )
                .order(
                    "id",
                    {
                        ascending: false
                    }
                )
                .limit(1);


        if (ordersError) {

            console.error(
                ordersError
            );

            alert(
                "حدث خطأ أثناء البحث عن الطلب"
            );

            return;

        }


        let order;


        /*
            إنشاء طلب جديد
        */

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

                        user_id:
                            user.id,

                        customer_name:
                            user.user_metadata?.name ||
                            user.email ||
                            "عميل",

                        customer_phone:
                            user.user_metadata?.phone ||
                            "",

                        status:
                            "جديد",

                        total:
                            0

                    })
                    .select()
                    .single();


            if (createError) {

                console.error(
                    createError
                );

                alert(
                    "حدث خطأ أثناء إنشاء الطلب"
                );

                return;

            }


            order =
                newOrder;

        } else {

            order =
                orders[0];

        }


        /*
            هل المنتج المحدد
            موجود بالسلة؟
        */

        const {
            data: existingItem,
            error: itemError
        } =
            await supabaseClient
                .from("order_items")
                .select("*")
                .eq(
                    "order_id",
                    order.id
                )
                .eq(
                    "product_id",
                    product.id
                )
                .maybeSingle();


        if (itemError) {

            console.error(
                itemError
            );

            alert(
                "حدث خطأ أثناء البحث عن المنتج"
            );

            return;

        }


        /*
            موجود → زيادة الكمية
        */

        if (existingItem) {

            const newQuantity =
                (
                    existingItem.quantity ||
                    1
                ) + 1;


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
                    updateError
                );

                alert(
                    "حدث خطأ أثناء تحديث الكمية"
                );

                return;

            }

        }


        /*
            غير موجود → إضافة
        */

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
                    insertError
                );

                alert(
                    "حدث خطأ أثناء إضافة المنتج"
                );

                return;

            }

        }


        /*
            إعادة حساب الإجمالي
        */

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

                    total:
                        total

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
            (
                product.color
                    ? " - " +
                      product.color
                    : ""
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