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










