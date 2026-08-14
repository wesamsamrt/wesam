const loginPage = document.getElementById("loginPage");
const adminPage = document.getElementById("adminPage");

const adminCode = document.getElementById("adminCode");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

const logoutButton = document.getElementById("logoutButton");


/* =========================
   إظهار لوحة الإدارة
========================= */

function showAdmin() {

    loginPage.style.display = "none";
    adminPage.style.display = "block";

}


/* =========================
   إظهار تسجيل الدخول
========================= */

function showLogin() {

    loginPage.style.display = "flex";
    adminPage.style.display = "none";

}


/* =========================
   تسجيل الدخول
========================= */

async function login() {

    const password = adminCode.value.trim();

    if (!password) {

        loginMessage.textContent =
            "اكتب كلمة المرور";

        loginMessage.style.color =
            "#e05265";

        return;
    }


    loginButton.disabled = true;

    loginButton.textContent =
        "جاري الدخول...";


    /*
       مهم:
       الإيميل هنا نضعه أنت محليًا
       ولا ترسله لي.
    */

    const email =
        "procurement@wesamsa.com";


    const { data, error } =
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

        loginButton.disabled = false;

        loginButton.textContent =
            "دخول";

        return;
    }


    loginMessage.textContent =
        "";

    showAdmin();


    loginButton.disabled = false;

    loginButton.textContent =
        "دخول";

}


/* =========================
   تسجيل الخروج
========================= */

async function logout() {

    await supabaseClient.auth.signOut();

    showLogin();

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


/* =========================
   التحقق عند فتح الصفحة
========================= */

async function checkSession() {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    if (session) {

        showAdmin();

    } else {

        showLogin();

    }

}


checkSession();

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


let adminProductsData = [];


/* فتح إدارة المنتجات */

productsButton.addEventListener("click", async function () {

    dashboardContent.style.display = "none";

    productsAdmin.style.display = "block";

    await loadAdminProducts();

});


/* الرجوع */

backToDashboard.addEventListener("click", function () {

    productsAdmin.style.display = "none";

    dashboardContent.style.display = "block";

});


/* تحميل المنتجات */

async function loadAdminProducts() {

    adminProducts.innerHTML = `
        <div class="loading">
            جاري تحميل المنتجات...
        </div>
    `;


    const { data, error } =
        await supabaseClient
            .from("products")
            .select("*")
            .order("id", { ascending: false });


    if (error) {

        console.error(error);

        adminProducts.innerHTML = `
            <div class="message error">
                ${error.message}
            </div>
        `;

        return;
    }


    adminProductsData = data || [];

    renderAdminProducts(adminProductsData);

}


/* عرض المنتجات */

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

    });

}


/* البحث */

adminProductSearch.addEventListener(
    "input",
    function () {

        const search =
            this.value
                .toLowerCase()
                .trim();


        const filtered =
            adminProductsData.filter(product => {

                const text = `

                    ${product.model || ""}
                    ${product.company || ""}
                    ${product.category || ""}
                    ${product.product_type || ""}
                    ${product.type || ""}

                `.toLowerCase();


                return text.includes(search);

            });


        renderAdminProducts(filtered);

    }
);






/* =========================
   إضافة منتج
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


/* فتح النموذج */

addProductButton.addEventListener("click", function () {

    productFormCard.style.display = "block";

    productFormMessage.textContent = "";

    productFormCard.scrollIntoView({
        behavior: "smooth"
    });

});


/* إغلاق النموذج */

cancelProductButton.addEventListener("click", function () {

    productFormCard.style.display = "none";

    clearProductForm();

});


/* مسح النموذج */

function clearProductForm() {

    document.getElementById("productCategory").value = "";
    document.getElementById("productProductType").value = "";
    document.getElementById("productType").value = "";
    document.getElementById("productCompany").value = "";
    document.getElementById("productModel").value = "";
    document.getElementById("productColor").value = "";
    document.getElementById("productQuantity").value = "";
    document.getElementById("productPrice").value = "";

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

    const price =
        Number(
            document.getElementById("productPrice").value
        );


    if (
        !category ||
        !productType ||
        !type ||
        !company ||
        !model
    ) {

        productFormMessage.textContent =
            "فضلاً أكمل بيانات المنتج المطلوبة";

        productFormMessage.style.color =
            "#e05265";

        return;
    }


    saveProductButton.disabled = true;

    saveProductButton.textContent =
        editingProductId
            ? "جاري تعديل المنتج..."
            : "جاري الحفظ...";


    let result;


    /* =========================
       تعديل
    ========================= */

    if (editingProductId) {

        result =
            await supabaseClient
                .from("products")
                .update({

                    category: category,

                    product_type: productType,

                    type: type,

                    company: company,

                    model: model,

                    color: color,

                    quantity: quantity || 0,

                    price: price || 0

                })
                .eq("id", editingProductId)
                .select()
                .single();


    }


    /* =========================
       إضافة
    ========================= */

    else {

        result =
            await supabaseClient
                .from("products")
                .insert({

                    category: category,

                    product_type: productType,

                    type: type,

                    company: company,

                    model: model,

                    color: color,

                    quantity: quantity || 0,

                    price: price || 0

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

/* =========================
   تعديل المنتج
========================= */

let editingProductId = null;


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


    /* تعبئة النموذج */

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

    document.getElementById("productPrice").value =
        product.price ?? 0;


    /* إظهار النموذج */

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



/* =========================
   حذف المنتج
========================= */

async function deleteProduct(id) {

    const product =
        adminProductsData.find(
            item => item.id === id
        );

    if (!product) {
        alert("لم يتم العثور على المنتج");
        return;
    }


    const confirmed = confirm(
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








/* =========================
   إدارة التصنيفات
========================= */

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


let adminCategories = [];
let editingCategoryId = null;


/* فتح التصنيفات */

categoriesButton.addEventListener(
    "click",
    async function () {

        dashboardContent.style.display = "none";

        productsAdmin.style.display = "none";

        categoriesAdmin.style.display = "block";

        await loadAdminCategories();

    }
);


/* الرجوع */

backFromCategories.addEventListener(
    "click",
    function () {

        categoriesAdmin.style.display = "none";

        dashboardContent.style.display = "block";

    }
);


/* تحميل التصنيفات */

async function loadAdminCategories() {

    categoriesList.innerHTML = `
        <div class="message">
            جاري تحميل التصنيفات...
        </div>
    `;


    const { data, error } =
        await supabaseClient
            .from("categories")
            .select("*")
            .order("id", { ascending: true });


    if (error) {

        console.error(error);

        categoriesList.innerHTML = `
            <div class="message error">
                ${error.message}
            </div>
        `;

        return;
    }


    adminCategories = data || [];

    renderAdminCategories();

}


/* عرض التصنيفات */

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


        item.innerHTML = `

            <div class="category-admin-icon">
                ${category.icon || "📦"}
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


/* فتح نموذج الإضافة */

addCategoryButton.addEventListener(
    "click",
    function () {

        editingCategoryId = null;

        document.getElementById("categoryName").value = "";
        document.getElementById("categoryIcon").value = "";

        saveCategoryButton.textContent =
            "حفظ التصنيف";

        categoryFormMessage.textContent = "";

        categoryFormCard.style.display =
            "block";

    }
);


/* إلغاء */

cancelCategoryButton.addEventListener(
    "click",
    function () {

        categoryFormCard.style.display =
            "none";

        editingCategoryId = null;

    }
);


/* حفظ */

saveCategoryButton.addEventListener(
    "click",
    saveCategory
);


async function saveCategory() {

    const name =
        document.getElementById("categoryName")
            .value
            .trim();

    const icon =
        document.getElementById("categoryIcon")
            .value
            .trim();


    if (!name) {

        categoryFormMessage.textContent =
            "اكتب اسم التصنيف";

        categoryFormMessage.style.color =
            "#e05265";

        return;
    }


    saveCategoryButton.disabled = true;

    saveCategoryButton.textContent =
        "جاري الحفظ...";


    let result;


    if (editingCategoryId) {

        result =
            await supabaseClient
                .from("categories")
                .update({
                    name: name,
                    icon: icon || "📦"
                })
                .eq("id", editingCategoryId);

    } else {

        result =
            await supabaseClient
                .from("categories")
                .insert({
                    name: name,
                    icon: icon || "📦"
                });

    }


    if (result.error) {

        categoryFormMessage.textContent =
            result.error.message;

        categoryFormMessage.style.color =
            "#e05265";

        saveCategoryButton.disabled = false;

        saveCategoryButton.textContent =
            editingCategoryId
                ? "حفظ التعديل"
                : "حفظ التصنيف";

        return;
    }


    categoryFormMessage.textContent =
        editingCategoryId
            ? "تم تعديل التصنيف ✅"
            : "تمت إضافة التصنيف ✅";

    categoryFormMessage.style.color =
        "#2e9d69";


    editingCategoryId = null;

    categoryFormCard.style.display =
        "none";


    await loadAdminCategories();


    saveCategoryButton.disabled = false;

    saveCategoryButton.textContent =
        "حفظ التصنيف";

}


/* تعديل */

async function editCategory(id) {

    const category =
        adminCategories.find(
            item => item.id === id
        );


    if (!category) return;


    editingCategoryId = id;


    document.getElementById("categoryName").value =
        category.name || "";

    document.getElementById("categoryIcon").value =
        category.icon || "";


    saveCategoryButton.textContent =
        "حفظ التعديل";


    categoryFormCard.style.display =
        "block";


    categoryFormCard.scrollIntoView({
        behavior: "smooth"
    });

}


/* حذف */

async function deleteCategory(id) {

    const category =
        adminCategories.find(
            item => item.id === id
        );


    if (!category) return;


    const confirmed =
        confirm(
            `هل أنت متأكد من حذف التصنيف؟\n\n${category.name}`
        );


    if (!confirmed) return;


    const { error } =
        await supabaseClient
            .from("categories")
            .delete()
            .eq("id", id);


    if (error) {

        alert(
            "حدث خطأ:\n" +
            error.message
        );

        return;
    }


    await loadAdminCategories();

    alert("تم حذف التصنيف بنجاح ✅");

}





/* =========================
   إدارة الطلبات
========================= */

const ordersButton =
    document.getElementById("ordersButton");

const ordersAdmin =
    document.getElementById("ordersAdmin");

const backFromOrders =
    document.getElementById("backFromOrders");

const adminOrders =
    document.getElementById("adminOrders");


/* فتح الطلبات */

ordersButton.addEventListener(
    "click",
    async function () {

        dashboardContent.style.display = "none";

        productsAdmin.style.display = "none";

        categoriesAdmin.style.display = "none";

        ordersAdmin.style.display = "block";

        await loadAdminOrders();

    }
);


/* الرجوع للوحة الرئيسية */

backFromOrders.addEventListener(
    "click",
    function () {

        ordersAdmin.style.display = "none";

        dashboardContent.style.display = "block";

    }
);


/* تحميل الطلبات */

async function loadAdminOrders() {

    adminOrders.innerHTML = `
        <div class="message">
            جاري تحميل الطلبات...
        </div>
    `;


    const { data: orders, error } =
        await supabaseClient
            .from("orders")
            .select("*")
            .order("created_at", {
                ascending: false
            });


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


    if (!orders || !orders.length) {

        adminOrders.innerHTML = `
            <div class="message">
                لا توجد طلبات حتى الآن 📋
            </div>
        `;

        return;
    }


    adminOrders.innerHTML = "";


    for (const order of orders) {

        await renderAdminOrder(order);

    }

}


/* عرض طلب واحد */

async function renderAdminOrder(order) {

    const { data: items, error } =
        await supabaseClient
            .from("order_items")
            .select("*")
            .eq("order_id", order.id)
            .order("id", {
                ascending: true
            });


    if (error) {

        console.error(error);

        return;

    }


    const card =
        document.createElement("div");

    card.className =
        "admin-order-card";


    const date =
        new Date(order.created_at)
            .toLocaleString("ar-SA", {
                dateStyle: "medium",
                timeStyle: "short"
            });


    let productsHTML = "";


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
                        ${item.model || "بدون موديل"}
                    </h4>

                    <p>
                        ${item.company || ""}
                        ${
                            item.color
                            ? " • " + item.color
                            : ""
                        }
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

            </div>


           <div class="admin-order-date">

    ${date}

    <button
        class="print-order-button"
        onclick="printOrder(${order.id})"
    >
        🖨️ طباعة الطلب
    </button>

</div>

        </div>


        <div class="admin-order-status">

            <span>
                الحالة:
            </span>

            <strong>
                ${order.status || "جديد"}
            </strong>

        </div>


        <div class="admin-order-items">

            ${productsHTML}

        </div>


        <div class="admin-order-bottom">

            <strong>
                الإجمالي
            </strong>

            <strong class="admin-order-total">
                ${Number(order.total || 0).toFixed(2)} ر.س
            </strong>

        </div>

    `;


    adminOrders.appendChild(card);

}


/* =========================
   طباعة الطلب
========================= */

async function printOrder(orderId) {

    try {

        /* =========================
           جلب الطلب
        ========================= */

        const { data: order, error: orderError } =
            await supabaseClient
                .from("orders")
                .select("*")
                .eq("id", orderId)
                .single();


        if (orderError || !order) {

            console.error(orderError);

            alert("لم يتم العثور على الطلب");

            return;
        }


        /* =========================
           جلب منتجات الطلب
        ========================= */

        const { data: items, error: itemsError } =
            await supabaseClient
                .from("order_items")
                .select("*")
                .eq("order_id", orderId)
                .order("id", {
                    ascending: true
                });


        if (itemsError) {

            console.error(itemsError);

            alert("حدث خطأ أثناء تحميل منتجات الطلب");

            return;
        }


        const date =
            new Date(order.created_at)
                .toLocaleString("ar-SA", {
                    dateStyle: "medium",
                    timeStyle: "short"
                });


        /* =========================
           بناء صفوف الجدول
        ========================= */

        let rowsHTML = "";


        (items || []).forEach((item, index) => {

            const quantity =
                Number(item.quantity || 1);

            const price =
                Number(item.price || 0);

            const total =
                quantity * price;


            rowsHTML += `

                <tr>

                    <td>
                        ${index + 1}
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

        });


        /* =========================
           فتح صفحة الطباعة
        ========================= */

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


        /* =========================
           العنوان
        ========================= */

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


        /* =========================
           معلومات العميل
        ========================= */

        .customer-info {

            display: grid;

            grid-template-columns:
                repeat(4, 1fr);

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


        /* =========================
           الجدول
        ========================= */

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


        /* =========================
           الإجمالي
        ========================= */

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


        /* =========================
           الطباعة
        ========================= */

        .footer {

            margin-top: 30px;

            padding-top: 12px;

            border-top: 1px solid #aaa;

            text-align: center;

            font-size: 11px;

            color: #555;

        }


        @media print {

            body {

                padding: 10px;

            }


            .print-page {

                max-width: none;

            }


            @page {

                size: A4 landscape;

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


    <!-- =========================
         رأس الطلب
    ========================= -->

    <div class="header">

        <div>

            <h1>
                فاتورة / كشف طلب
            </h1>

            <p>
                رقم الطلب: <strong>#${order.id}</strong>
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


    <!-- =========================
         معلومات العميل
    ========================= -->

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
                رقم الطلب
            </span>

            <span class="customer-value">
                #${order.id}
            </span>

        </div>


    </div>


    <!-- =========================
         جدول المنتجات
    ========================= -->

    <table>

        <thead>

            <tr>

                <th>
                    #
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

                <th>
                    الكمية
                </th>

                <th>
                    السعر
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


    <!-- =========================
         الإجمالي
    ========================= -->

    <div class="total-section">

        <div class="total-box">

            <span>
                إجمالي الطلب
            </span>

            <span>
                ${Number(order.total || 0).toFixed(2)} ر.س
            </span>

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


    } catch (error) {

        console.error(error);

        alert(
            "حدث خطأ أثناء تجهيز الطلب للطباعة"
        );

    }

}



