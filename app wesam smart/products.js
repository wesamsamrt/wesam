let allProducts = [];

async function loadProducts() {

    const container = document.getElementById("products");

    if (!container) return;

    container.innerHTML = `
        <div class="loading">
            جاري تحميل المنتجات...
        </div>
    `;

    const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .eq("category", "حمايات")
        .eq("product_type", "حماية شاشة")
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


        card.innerHTML = `

            <div class="product-image">
                📱
            </div>

            <div class="product-type">
                ${product.type || ""}
            </div>

            <h3>
                ${product.model || "بدون موديل"}
            </h3>

            <p>
                ${product.company || ""}
                ${product.color || ""}
            </p>

            <div class="product-bottom">

                <span class="price">
                    ${product.price ?? 0} ر.س
                </span>

                <button
                    class="add-button"
                    data-id="${product.id}"
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