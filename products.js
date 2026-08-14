let allProducts = [];

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


/* =========================
   عرض المنتجات
========================= */

function renderProducts(products) {

    const container =
        document.getElementById("products");

    container.innerHTML = "";


    if (products.length === 0) {

        container.innerHTML = `
            <div class="message">
                لا توجد منتجات بهذا النوع
            </div>
        `;

        return;
    }


   products.forEach(product => {

    const card =
        document.createElement("div");

    card.className = "product-card";

    // الضغط على البطاقة يفتح التفاصيل
    card.onclick = function(e) {

        // إذا ضغط على زر + لا نفتح البطاقة
        if (e.target.closest(".add-button")) {
            return;
        }

        openProductModal(product.id);
    };

card.style.cursor = "pointer";

card.onclick = function(event) {

    // إذا ضغط على زر + لا نفتح النافذة
    if (event.target.closest(".add-button")) {
        return;
    }

    openProductModal(product.id);
};

card.innerHTML = `

    <div class="product-image">
        ${product.image
            ? `<img src="${product.image}" alt="${product.model || ""}">`
            : "📱"
        }
    </div>

    <div class="product-type">
        ${product.type || ""}
    </div>

    <h3>
        ${product.model || "بدون موديل"}
    </h3>

    <p>
        ${product.company || ""}
        ${product.color ? " • " + product.color : ""}
    </p>

            <div class="product-bottom">

                <span class="price">
                    ${product.price ?? 0} ر.س
                </span>

                <button
    class="add-button"
    onclick="addProduct(${product.id})"
>
    +
</button>
            </div>
        `;


        container.appendChild(card);

    });

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

                    item.classList.remove("active");

                });


                button.classList.add("active");


                const selected =
                    button.textContent.trim();


                if (selected === "الكل") {

                    renderProducts(allProducts);

                    return;
                }


                const filtered =
                    allProducts.filter(product =>

                        (product.type || "")
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
   التشغيل
========================= */

loadProducts();

setupFilters();



async function addProduct(productId) {

    try {

        // =========================
        // التأكد من تسجيل الدخول
        // =========================

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError || !user) {

            alert("يجب تسجيل الدخول أولاً");

            window.location.href = "login.html";

            return;
        }


        // =========================
        // البحث عن المنتج
        // =========================

        const product =
            allProducts.find(
                item => item.id === productId
            );

        if (!product) {

            alert("المنتج غير موجود");

            return;
        }


        // =========================
        // البحث عن طلب مفتوح للمستخدم
        // =========================

        let { data: orders, error: ordersError } =
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

            alert("حدث خطأ أثناء البحث عن الطلب");

            return;
        }


        // =========================
        // إذا ما عنده طلب مفتوح
        // نسوي طلب جديد
        // =========================

        let order;

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

                console.error(
                    "خطأ إنشاء الطلب:",
                    createError
                );

                alert("حدث خطأ أثناء إنشاء الطلب");

                return;
            }

            order = newOrder;

        } else {

            order = orders[0];

        }


        // =========================
        // هل المنتج موجود بالسلة؟
        // =========================

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

            console.error(
                "خطأ البحث عن المنتج في السلة:",
                itemError
            );

            alert("حدث خطأ أثناء البحث عن المنتج");

            return;
        }


        // =========================
        // إذا المنتج موجود
        // نزيد الكمية
        // =========================

        if (existingItem) {

            const newQuantity =
                (existingItem.quantity || 1) + 1;


            const {
                error: updateError
            } = await supabaseClient
                .from("order_items")
                .update({
                    quantity: newQuantity
                })
                .eq("id", existingItem.id);


            if (updateError) {

                console.error(
                    "خطأ تحديث الكمية:",
                    updateError
                );

                alert("حدث خطأ أثناء تحديث الكمية");

                return;
            }

        }

        // =========================
        // إذا المنتج غير موجود
        // نضيفه
        // =========================

        else {

            const {
                error: insertError
            } = await supabaseClient
                .from("order_items")
                .insert({

                    order_id: order.id,

                    product_id: product.id,

                    quantity: 1,

                    category: product.category,

                    product_type: product.product_type,

                    type: product.type,

                    company: product.company,

                    model: product.model,

                    color: product.color,

                    price: product.price,

                    image: product.image
                });


            if (insertError) {

                console.error(
                    "خطأ إضافة المنتج:",
                    insertError
                );

                alert("حدث خطأ أثناء إضافة المنتج");

                return;
            }
        }


        // =========================
        // حساب إجمالي الطلب
        // =========================

        const {
            data: items,
            error: totalError
        } = await supabaseClient
            .from("order_items")
            .select("quantity, price")
            .eq("order_id", order.id);


        if (!totalError && items) {

            const total =
                items.reduce(
                    (sum, item) =>
                        sum +
                        ((Number(item.price) || 0) *
                        (Number(item.quantity) || 1)),
                    0
                );


            await supabaseClient
                .from("orders")
                .update({
                    total: total
                })
                .eq("id", order.id);
        }


        alert(
            "تمت إضافة " +
            (product.model || "المنتج") +
            " إلى السلة"
        );


    } catch (error) {

        console.error(
            "خطأ غير متوقع:",
            error
        );

        alert("حدث خطأ غير متوقع");
    }
}







/* =========================
   فتح تفاصيل المنتج
========================= */

function openProductModal(productId) {

    const product =
        allProducts.find(
            item => item.id === productId
        );

    if (!product) return;


    const modal =
        document.getElementById("productModal");


    const image =
        document.getElementById("modalProductImage");


    if (product.image) {

        image.innerHTML = `
            <img
                src="${product.image}"
                alt="${product.model || ""}"
            >
        `;

    } else {

        image.innerHTML = "📱";

    }


    document.getElementById(
        "modalProductType"
    ).textContent =
        product.type || product.product_type || "منتج";


    document.getElementById(
        "modalProductName"
    ).textContent =
        product.model || "بدون موديل";


    document.getElementById(
        "modalProductCompany"
    ).textContent =
        product.company
            ? "الشركة: " + product.company
            : "";


    document.getElementById(
        "modalProductDescription"
    ).textContent =
        product.description ||
        "منتج عالي الجودة ومناسب للاستخدام اليومي.";


    document.getElementById(
        "modalPrice"
    ).textContent =
        `${product.price ?? 0} ر.س`;


    /* =========================
       اللون
    ========================= */

    const colors =
        document.getElementById("modalColors");


    colors.innerHTML = "";


    if (product.color) {

        const color =
            document.createElement("span");

        color.className = "modal-option";

        color.textContent =
            product.color;

        colors.appendChild(color);

    } else {

        colors.innerHTML = `
            <span class="modal-option">
                غير محدد
            </span>
        `;

    }


    /* =========================
       الموديل
    ========================= */

    const models =
        document.getElementById("modalModels");


    models.innerHTML = "";


    if (product.model) {

        const model =
            document.createElement("span");

        model.className = "modal-option";

        model.textContent =
            product.model;

        models.appendChild(model);

    } else {

        models.innerHTML = `
            <span class="modal-option">
                غير محدد
            </span>
        `;

    }


    /* =========================
       زر الإضافة
    ========================= */

    const addButton =
        document.getElementById(
            "modalAddButton"
        );


    addButton.onclick = function() {

        addProduct(product.id);

    };


    /* =========================
       فتح النافذة
    ========================= */

    modal.classList.add("show");

    document.body.style.overflow = "hidden";

}


/* =========================
   إغلاق التفاصيل
========================= */

function closeProductModal() {

    const modal =
        document.getElementById("productModal");

    modal.classList.remove("show");

    document.body.style.overflow = "";

}


/* =========================
   الضغط خارج البطاقة
========================= */

document.addEventListener(
    "click",
    function(event) {

        const modal =
            document.getElementById(
                "productModal"
            );

        if (
            event.target === modal
        ) {

            closeProductModal();

        }

    }
);


/* =========================
   زر ESC
========================= */

document.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Escape") {

            closeProductModal();

        }

    }
);