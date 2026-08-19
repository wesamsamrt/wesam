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
   التحقق هل المستخدم أدمن
========================= */

async function isAdmin() {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    if (!session || !session.user) {

        return false;

    }


    const {
        data,
        error
    } = await supabaseClient
        .from("admins")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();


    if (error) {

        console.error(
            "Admin Check Error:",
            error
        );

        return false;

    }


    return !!data;

}


/* =========================
   تسجيل الدخول للإدارة
========================= */

async function login() {

    const password =
        adminCode.value.trim();


    if (!password) {

        loginMessage.textContent =
            "اكتب كلمة المرور";

        loginMessage.style.color =
            "#e05265";

        return;

    }


    loginButton.disabled = true;

    loginButton.textContent =
        "جاري التحقق...";


    const email =
        "procurement@wesamsa.com";


    try {

        const {
            data,
            error
        } =
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

            loginButton.disabled =
                false;

            loginButton.textContent =
                "دخول";

            return;

        }


        /* =========================
           التحقق من صلاحية الأدمن
        ========================= */

        const admin =
            await isAdmin();


        if (!admin) {

            await supabaseClient.auth.signOut();


            loginMessage.textContent =
                "هذا الحساب ليس لديه صلاحية دخول لوحة الإدارة";

            loginMessage.style.color =
                "#e05265";

            loginButton.disabled =
                false;

            loginButton.textContent =
                "دخول";

            return;

        }


        /* =========================
           نجاح
        ========================= */

        loginMessage.textContent =
            "تم الدخول بنجاح ✓";

        loginMessage.style.color =
            "#2e9d69";


        showAdmin();


        loginButton.disabled =
            false;

        loginButton.textContent =
            "دخول";

    }

    catch (error) {

        console.error(
            "Admin Login Error:",
            error
        );


        loginMessage.textContent =
            "حدث خطأ أثناء تسجيل الدخول";

        loginMessage.style.color =
            "#e05265";


        loginButton.disabled =
            false;

        loginButton.textContent =
            "دخول";

    }

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
/* =========================
   حساب الإدارة المسموح
========================= */

const ADMIN_EMAIL = "zzzzxxccvvbbnnmm12345a@wesamsa.com";


/* =========================
   التحقق من حساب الإدارة
========================= */

async function checkSession() {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    /* لا يوجد تسجيل دخول */

    if (!session || !session.user) {

        showLogin();

        return;

    }


    /* إيميل المستخدم */

    const userEmail =
        (session.user.email || "")
            .trim()
            .toLowerCase();


    /* =========================
       التحقق من أنه الأدمن
    ========================= */

    if (userEmail !== ADMIN_EMAIL.toLowerCase()) {

        console.log(
            "محاولة دخول غير مصرح بها:",
            userEmail
        );


        /* تسجيل خروج الحساب */

        await supabaseClient.auth.signOut();


        showLogin();


        loginMessage.textContent =
            "هذا الحساب ليس لديه صلاحية دخول لوحة الإدارة";

        loginMessage.style.color =
            "#e05265";


        return;

    }


    /* =========================
       الحساب صحيح
    ========================= */

    showAdmin();

}


checkSession();



/* =========================================================
   إدارة المنتجات
========================================================= */

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
let selectedProductImage = null;

const productImage =
    document.getElementById("productImage");

productImage.addEventListener("change", function () {

    selectedProductImage =
        this.files[0] || null;

});

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
            جاري تحميل جميع المنتجات...
        </div>
    `;

    try {

        let allProducts = [];
        let from = 0;
        const pageSize = 1000;

        while (true) {

            const {
                data,
                error
            } = await supabaseClient
                .from("products")
                .select("*")
                .order("id", {
                    ascending: false
                })
                .range(
                    from,
                    from + pageSize - 1
                );

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) {
                break;
            }

            allProducts.push(...data);

            console.log(
                "تم تحميل المنتجات:",
                allProducts.length
            );

            // إذا رجعت أقل من 1000
            // فهذا يعني أننا وصلنا للنهاية
            if (data.length < pageSize) {
                break;
            }

            from += pageSize;
        }

        adminProductsData = allProducts;

        console.log(
            "✅ إجمالي المنتجات:",
            adminProductsData.length
        );

        renderAdminProducts(adminProductsData);

    }

    catch (error) {

        console.error(
            "❌ خطأ تحميل جميع المنتجات:",
            error
        );

        adminProducts.innerHTML = `
            <div class="message error">
                حدث خطأ أثناء تحميل المنتجات
                <br>
                ${error.message || ""}
            </div>
        `;

    }

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

                 ${product.product_code || ""}
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
   إضافة / تعديل منتج
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


addProductButton.addEventListener("click", function () {

    productFormCard.style.display = "block";

    productFormMessage.textContent = "";

    productFormCard.scrollIntoView({
        behavior: "smooth"
    });

});


cancelProductButton.addEventListener("click", function () {

    productFormCard.style.display = "none";

    clearProductForm();

});


function clearProductForm() {

    document.getElementById("productCategory").value = "";
    document.getElementById("productProductType").value = "";
    document.getElementById("productType").value = "";
    document.getElementById("productCompany").value = "";
    document.getElementById("productModel").value = "";
    document.getElementById("productColor").value = "";
    document.getElementById("productQuantity").value = "";
    document.getElementById("productPrice").value = "";


    selectedProductImage = null;

document.getElementById("productImage").value = "";

document.getElementById("productImagePreview").innerHTML = "";
}

/* =========================================================
   رفع صورة المنتج
========================================================= */
async function uploadProductImage(productId, file) {

    if (!productId) {
        console.error("لا يوجد productId");
        return null;
    }

    if (!file) {
        console.error("لم يتم اختيار صورة");
        return null;
    }

    try {

        /* =========================
           اسم فريد للصورة
        ========================= */

        const fileExt =
            file.name.split(".").pop();

        const fileName =
            `${crypto.randomUUID()}.${fileExt}`;

        const filePath =
            `products/${fileName}`;


        /* =========================
           رفع الصورة إلى Storage
        ========================= */

        const {
            error: uploadError
        } = await supabaseClient
            .storage
            .from("product-images")
            .upload(
                filePath,
                file,
                {
                    upsert: false,
                    contentType: file.type
                }
            );


        if (uploadError) {

            console.error(
                "Image Upload Error:",
                uploadError
            );

            alert(
                "حدث خطأ أثناء رفع الصورة:\n" +
                uploadError.message
            );

            return null;
        }


        /* =========================
           الحصول على رابط الصورة
        ========================= */

        const {
            data: publicData
        } =
            supabaseClient
                .storage
                .from("product-images")
                .getPublicUrl(filePath);


        const imageUrl =
            publicData?.publicUrl;


        if (!imageUrl) {

            console.error(
                "لم يتم الحصول على رابط الصورة"
            );

            return null;
        }


        console.log(
            "رابط الصورة:",
            imageUrl
        );


        /* =========================
           حفظ الرابط في نفس المنتج
        ========================= */

        const {
            error: updateError
        } =
            await supabaseClient
                .from("products")
                .update({
                    image: imageUrl
                })
                .eq("id", productId);


        if (updateError) {

            console.error(
                "Product Image Update Error:",
                updateError
            );

            alert(
                "تم رفع الصورة، لكن لم يتم حفظها داخل المنتج:\n" +
                updateError.message
            );

            return null;
        }


        console.log(
            "تم حفظ الصورة داخل المنتج ✅"
        );


        return imageUrl;

    }

    catch (error) {

        console.error(
            "Upload Product Image Error:",
            error
        );

        alert(
            "حدث خطأ أثناء رفع الصورة"
        );

        return null;
    }

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

    const imageFile =
        document.getElementById("productImage").files[0];


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



            let imageUrl = null;

try {

    if (imageFile) {

        imageUrl =
            await uploadProductImage(imageFile);

    }

}
catch (error) {

    productFormMessage.textContent =
        "حدث خطأ أثناء رفع صورة المنتج";

    productFormMessage.style.color =
        "#e05265";

    saveProductButton.disabled = false;

    saveProductButton.textContent =
        editingProductId
            ? "حفظ التعديل"
            : "حفظ المنتج";

    return;
}

    let result;


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

                  price: price || 0,

                 image: imageUrl

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
/* =========================
   رفع صورة المنتج
========================= */

if (selectedProductImage) {

    await uploadProductImage(
        result.data.id,
        selectedProductImage
    );

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


let editingProductId = null;


/* تعديل المنتج */

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


/* حذف المنتج */

async function deleteProduct(id) {

    const product =
        adminProductsData.find(
            item => item.id === id
        );


    if (!product) {

        alert("لم يتم العثور على المنتج");

        return;
    }


    const confirmed =
        confirm(
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






/* =========================================================
   إدارة التصنيفات
========================================================= */

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


/* إضافة تصنيف */

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

    }

    else {

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






/* =========================================================
   إدارة الطلبات
========================================================= */

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


/* الرجوع */

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


    const {
    data: orders,
    error
} = await supabaseClient
    .from("orders")
    .select(`
    id,
    status,
    customer_name,
    customer_phone,
    customer_lat,
    customer_lng,
    customer_location,
    total,
    created_at,
    user_id,
    driver_name,
    driver_number
`)
    .order("id", {
        ascending: false
    });

console.log("ORDERS FROM ADMIN:", orders);

if (orders) {
    orders.forEach(order => {
        console.log(
            "طلب #" + order.id,
            "driver_name =", order.driver_name,
            "driver_number =", order.driver_number
        );
    });
}


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


    console.log(
        "الطلبات التي وصلت للإدارة:",
        orders
    );


    if (!orders || orders.length === 0) {

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

    const {
        data: items,
        error
    } =
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


    /* =========================
       إحصائيات الأنواع
    ========================= */

    /* =========================
   إحصائيات المنتجات حسب الكود
========================= */

const typeCodes = {};

(items || []).forEach(item => {

    const code =
        item.product_code?.trim() || "بدون كود";

    const quantity =
        Number(item.quantity || 1);

    typeCodes[code] =
        (typeCodes[code] || 0) + quantity;

});


let typeStatsHTML = "";

Object.entries(typeCodes).forEach(
    ([code, quantity]) => {

        typeStatsHTML += `
            <span class="type-stat">
                ${code}: ${quantity} قطعة
            </span>
        `;

    }
);


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

                    <p>
    🚚 المندوب:
    <strong>
        ${order.driver_name || "غير محدد"}
    </strong>

    ${
        order.driver_number
        ? ` • رقم المندوب: ${order.driver_number}`
        : ""
    }
</p>

<p style="margin-top:8px;">
    📍 الموقع:

    ${
        order.customer_lat && order.customer_lng
        ?
        `
        <a
            href="https://www.google.com/maps?q=${order.customer_lat},${order.customer_lng}"
            target="_blank"
            style="
                display:inline-block;
                margin-top:5px;
                padding:7px 12px;
                background:#eeeaff;
                color:#6557ed;
                border-radius:10px;
                text-decoration:none;
                font-weight:800;
                font-size:12px;
            "
        >
            🗺️ فتح موقع العميل
        </a>
        `
        :
        `
        <span style="color:#999;">
            لم يتم تحديد الموقع
        </span>
        `
    }
</p>

                  </div>


          <div class="admin-order-date">

                ${date}

                <div style="display:flex; gap:8px; flex-wrap:wrap;">

    <button
        class="edit-order-button"
        onclick="editOrder(${order.id})"
    >
        ✏️ تعديل الطلب
    </button>

    <button
        class="print-order-button"
        onclick="printOrder(${order.id})"
    >
        🖨️ طباعة الطلب
    </button>

</div>

            </div>

        </div>


        <div class="admin-order-status">

            <span>
                الحالة:
            </span>


            <select
                class="order-status-select"
                onchange="updateOrderStatus(${order.id}, this.value)"
            >

                <option
                    value="جديد"
                    ${order.status === "جديد" ? "selected" : ""}
                >
                    جديد
                </option>


                <option
                    value="قيد التجهيز"
                    ${order.status === "قيد التجهيز" ? "selected" : ""}
                >
                    قيد التجهيز
                </option>


                <option
                    value="تم شحن الطلب"
                    ${order.status === "تم شحن الطلب" ? "selected" : ""}
                >
                    تم شحن الطلب
                </option>


                <option
                    value="تم استلام طلبك"
                    ${order.status === "تم استلام طلبك" ? "selected" : ""}
                >
                    تم استلام طلبك
                </option>


                <option
                    value="ملغي"
                    ${order.status === "ملغي" ? "selected" : ""}
                >
                    ملغي
                </option>

            </select>

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
   تغيير حالة الطلب
========================= */
async function updateOrderStatus(orderId, newStatus) {

    try {

        // =========================
        // 1 - جلب الطلب
        // =========================

        const {
            data: order,
            error: orderError
        } = await supabaseClient
            .from("orders")
            .select("id, user_id, status")
            .eq("id", orderId)
            .single();


        if (orderError || !order) {

            console.error(orderError);

            alert("لم يتم العثور على الطلب");

            return;
        }


        // =========================
        // 2 - إذا نفس الحالة
        // =========================

        if (order.status === newStatus) {

            return;

        }


        // =========================
        // 3 - تحديث حالة الطلب
        // =========================

        const {
            error: updateError
        } = await supabaseClient
            .from("orders")
            .update({
                status: newStatus
            })
            .eq("id", orderId);


        if (updateError) {

            console.error(updateError);

            alert(
                "حدث خطأ أثناء تحديث حالة الطلب:\n" +
                updateError.message
            );

            return;
        }


        // =========================
        // 4 - إنشاء إشعار للمستخدم
        // =========================

        if (order.user_id) {

            const {
                error: notificationError
            } = await supabaseClient
                .from("notifications")
                .insert({

                    user_id: order.user_id,

                    order_id: order.id,

                    title: "تحديث حالة الطلب 🔔",

                    message:
                        `تم تحديث حالة طلبك #${order.id} إلى "${newStatus}"`

                });


            if (notificationError) {

                console.error(
                    "خطأ في إنشاء الإشعار:",
                    notificationError
                );

                alert(
                    "تم تحديث حالة الطلب، لكن حدث خطأ في إرسال الإشعار."
                );

                return;
            }

        }


        // =========================
        // 5 - نجاح
        // =========================

        alert(
            `تم تحديث الطلب #${order.id} إلى "${newStatus}" ✅`
        );


        // =========================
        // 6 - إعادة تحميل الطلبات في الإدارة
        // =========================

        await loadAdminOrders();


    }

    catch (error) {

        console.error(
            "Update Order Status Error:",
            error
        );

        alert(
            "حدث خطأ غير متوقع أثناء تحديث الطلب"
        );

    }

}


/* =========================================================
   طباعة الطلب
========================================================= */

async function printOrder(orderId) {

    try {

        const {
            data: order,
            error: orderError
        } =
            await supabaseClient
                .from("orders")
                .select("*")
                .eq("id", orderId)
                .single();


        if (orderError || !order) {

            console.error(orderError);

            alert(
                "لم يتم العثور على الطلب"
            );

            return;
        }


        const {
            data: items,
            error: itemsError
        } =
            await supabaseClient
                .from("order_items")
                .select("*")
                .eq("order_id", orderId)
                .order("id", {
                    ascending: true
                });


        if (itemsError) {

            console.error(itemsError);

            alert(
                "حدث خطأ أثناء تحميل منتجات الطلب"
            );

            return;
        }


        const date =
            new Date(order.created_at)
                .toLocaleString(
                    "ar-SA",
                    {
                        dateStyle: "medium",
                        timeStyle: "short"
                    }
                );


        let rowsHTML = "";


        const typeCodes = {};

(items || []).forEach(item => {

    const code =
        item.product_code?.trim() ||
        "بدون كود";

    const quantity =
        Number(item.quantity || 1);

    typeCodes[code] =
        (typeCodes[code] || 0) + quantity;

});


let typeStatsHTML = "";

Object.entries(typeCodes).forEach(
    ([code, quantity]) => {

        typeStatsHTML += `
            <span class="type-stat">
                ${code}: ${quantity} قطعة
            </span>
        `;

    }
);


        (items || []).forEach(
            (item, index) => {

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
                             ${item.product_code || "-"}
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

            }
        );


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


        .customer-info {

    display: grid;

    grid-template-columns:
        repeat(5, 1fr);

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


        .type-stats {

            margin-top: 12px;

            display: flex;

            gap: 8px;

            flex-wrap: wrap;

            justify-content: flex-end;

        }


        .type-stat {

            border: 1px solid #111;

            padding: 5px 9px;

            font-size: 11px;

        }


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


    <div class="header">

        <div>

            <h1>
               تحضير
            </h1>

            <p>
                رقم الطلب:
                <strong>
                    #${order.id}
                </strong>
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
                 المندوب
                 </span>

             <span class="customer-value">
             ${order.driver_name || "-"}
              ${
                 order.driver_number
            ? ` (${order.driverr_number})`
              : ""
              }
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


    <table>

        <thead>

            <tr>

                <th>#</th>
                <th>
                     رقم المنتج
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


    <div class="total-section">

        <div>

            <div class="total-box">

                <span>
                    إجمالي الطلب
                </span>

                <span>
                    ${Number(order.total || 0).toFixed(2)} ر.س
                </span>

            </div>


            <div class="type-stats">

                <strong>
                    إحصائيات الأنواع:
                </strong>

                ${typeStatsHTML}

            </div>

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


    }

    catch (error) {

        console.error(error);

        alert(
            "حدث خطأ أثناء تجهيز الطلب للطباعة"
        );

    }

}


/* =========================================================
   تعديل الطلب
========================================================= */

let editingOrderId = null;
let editingOrderItems = [];


/* عناصر نافذة التعديل */

const editOrderModal =
    document.getElementById("editOrderModal");

const closeEditOrderButton =
    document.getElementById("closeEditOrderButton");

const cancelOrderEditButton =
    document.getElementById("cancelOrderEditButton");

const saveOrderEditButton =
    document.getElementById("saveOrderEditButton");

const addOrderItemButton =
    document.getElementById("addOrderItemButton");

const editOrderItems =
    document.getElementById("editOrderItems");

const editOrderTotal =
    document.getElementById("editOrderTotal");

const editOrderMessage =
    document.getElementById("editOrderMessage");


/* =========================================================
   فتح تعديل الطلب
========================================================= */

async function editOrder(orderId) {

    try {

        editOrderMessage.textContent = "";

        editingOrderId = orderId;


        /* =========================
           جلب الطلب
        ========================= */

        const {
            data: order,
            error: orderError
        } = await supabaseClient
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

        const {
            data: items,
            error: itemsError
        } = await supabaseClient
            .from("order_items")
            .select("*")
            .eq("order_id", orderId)
            .order("id", {
                ascending: true
            });


        if (itemsError) {

            console.error(itemsError);

            alert(
                "حدث خطأ أثناء تحميل منتجات الطلب:\n" +
                itemsError.message
            );

            return;

        }


        /* =========================
           بيانات العميل
        ========================= */

        document.getElementById(
            "editOrderNumber"
        ).textContent =
            `الطلب #${order.id}`;


        document.getElementById(
            "editOrderCustomerName"
        ).value =
            order.customer_name || "";


        document.getElementById(
            "editOrderCustomerPhone"
        ).value =
            order.customer_phone || "";


        document.getElementById(
            "editOrderDriverName"
        ).value =
            order.driver_name || "";


        document.getElementById(
            "editOrderDriverNumber"
        ).value =
            order.driver_number || "";


        /* =========================
           نسخ المنتجات
        ========================= */

        editingOrderItems =
            (items || []).map(item => ({
                ...item
            }));


        renderEditOrderItems();


        /* =========================
           فتح النافذة
        ========================= */

        editOrderModal.style.display =
            "flex";


        document.body.style.overflow =
            "hidden";

    }

    catch (error) {

        console.error(
            "Edit Order Error:",
            error
        );

        alert(
            "حدث خطأ أثناء فتح تعديل الطلب"
        );

    }

}


/* =========================================================
   عرض منتجات الطلب داخل النافذة
========================================================= */

function renderEditOrderItems() {

    editOrderItems.innerHTML = "";


    if (!editingOrderItems.length) {

        editOrderItems.innerHTML = `

            <div class="message">

                لا توجد منتجات في الطلب

            </div>

        `;

        calculateEditOrderTotal();

        return;

    }


    editingOrderItems.forEach(
        (item, index) => {

            const row =
                document.createElement("div");

            row.className =
                "edit-order-item";


            row.innerHTML = `

                <div class="edit-order-item-grid">

                    <div class="edit-order-item-field">

                        <label>
                            الموديل
                        </label>

                        <input
                            type="text"
                            value="${escapeHtmlAttribute(item.model || "")}"
                            onchange="changeEditOrderItem(${index}, 'model', this.value)"
                        >

                    </div>


                    <div class="edit-order-item-field">

                        <label>
                            اللون
                        </label>

                        <input
                            type="text"
                            value="${escapeHtmlAttribute(item.color || "")}"
                            onchange="changeEditOrderItem(${index}, 'color', this.value)"
                        >

                    </div>


                    <div class="edit-order-item-field">

                        <label>
                            الكمية
                        </label>

                        <input
                            type="number"
                            min="1"
                            value="${Number(item.quantity || 1)}"
                            onchange="changeEditOrderItem(${index}, 'quantity', this.value)"
                        >

                    </div>


                    <div class="edit-order-item-field">

                        <label>
                            السعر
                        </label>

                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value="${Number(item.price || 0)}"
                            onchange="changeEditOrderItem(${index}, 'price', this.value)"
                        >

                    </div>


                    <button
                        type="button"
                        class="remove-order-item"
                        onclick="removeEditOrderItem(${index})"
                    >
                        🗑️
                    </button>

                </div>

            `;


            editOrderItems.appendChild(row);

        }
    );


    calculateEditOrderTotal();

}


/* =========================================================
   تغيير بيانات منتج
========================================================= */

function changeEditOrderItem(
    index,
    field,
    value
) {

    if (!editingOrderItems[index]) {

        return;

    }


    if (
        field === "quantity"
    ) {

        value =
            Math.max(
                1,
                Number(value) || 1
            );

    }


    if (
        field === "price"
    ) {

        value =
            Math.max(
                0,
                Number(value) || 0
            );

    }


    editingOrderItems[index][field] =
        value;


    calculateEditOrderTotal();

}


/* =========================================================
   حذف منتج من الطلب
========================================================= */

function removeEditOrderItem(index) {

    if (!editingOrderItems[index]) {

        return;

    }


    const confirmed =
        confirm(
            "هل تريد حذف هذا المنتج من الطلب؟"
        );


    if (!confirmed) {

        return;

    }


    editingOrderItems.splice(
        index,
        1
    );


    renderEditOrderItems();

}


/* =========================================================
   حساب الإجمالي
========================================================= */

function calculateEditOrderTotal() {

    const total =
        editingOrderItems.reduce(
            (sum, item) => {

                const price =
                    Number(item.price || 0);

                const quantity =
                    Number(item.quantity || 1);

                return sum +
                    (price * quantity);

            },
            0
        );


    editOrderTotal.textContent =
        total.toFixed(2);


    return total;

}


/* =========================================================
   إضافة منتج جديد للطلب
========================================================= */



/* =========================================================
   حفظ تعديل الطلب
========================================================= */

saveOrderEditButton.addEventListener(
    "click",
    saveOrderEdit
);


async function saveOrderEdit() {

    if (!editingOrderId) {

        return;

    }


    try {

        saveOrderEditButton.disabled =
            true;

        saveOrderEditButton.textContent =
            "جاري الحفظ...";


        editOrderMessage.textContent = "";


        /* =========================
           بيانات العميل
        ========================= */

        const customerName =
            document.getElementById(
                "editOrderCustomerName"
            ).value.trim();


        const customerPhone =
            document.getElementById(
                "editOrderCustomerPhone"
            ).value.trim();


        const driverName =
            document.getElementById(
                "editOrderDriverName"
            ).value.trim();


        const driverNumber =
            document.getElementById(
                "editOrderDriverNumber"
            ).value.trim();


        /* =========================
           حساب الإجمالي
        ========================= */

        const total =
            calculateEditOrderTotal();


        /* =========================
           تحديث الطلب
        ========================= */

        const {
            error: orderUpdateError
        } = await supabaseClient
            .from("orders")
            .update({

                customer_name:
                    customerName,

                customer_phone:
                    customerPhone,

                driver_name:
                    driverName,

                driver_number:
                    driverNumber,

                total:
                    total

            })
            .eq("id", editingOrderId);


        if (orderUpdateError) {

            throw orderUpdateError;

        }


        /* =========================
           تحديث المنتجات
        ========================= */

        const originalItems =
            editingOrderItems.filter(
                item => item.id
            );


        const currentIds =
            originalItems.map(
                item => item.id
            );


        /* =========================
           حذف المنتجات التي حذفها الأدمن
        ========================= */

        const {
            data: oldItems,
            error: oldItemsError
        } = await supabaseClient
            .from("order_items")
            .select("id")
            .eq("order_id", editingOrderId);


        if (oldItemsError) {

            throw oldItemsError;

        }


        const idsToDelete =
            (oldItems || [])
                .filter(
                    oldItem =>
                        !currentIds.includes(
                            oldItem.id
                        )
                )
                .map(
                    item => item.id
                );


        if (idsToDelete.length) {

            const {
                error: deleteError
            } = await supabaseClient
                .from("order_items")
                .delete()
                .in(
                    "id",
                    idsToDelete
                );


            if (deleteError) {

                throw deleteError;

            }

        }


        /* =========================
           تحديث المنتجات الموجودة
        ========================= */

        for (
            const item
            of originalItems
        ) {

            const {
                error: itemUpdateError
            } = await supabaseClient
                .from("order_items")
                .update({

                    product_code:
                        item.product_code || null,

                    category:
                        item.category || null,

                    product_type:
                        item.product_type || null,

                    type:
                        item.type || null,

                    company:
                        item.company || null,

                    model:
                        item.model || null,

                    color:
                        item.color || null,

                    quantity:
                        Math.max(
                            1,
                            Number(
                                item.quantity
                            ) || 1
                        ),

                    price:
                        Math.max(
                            0,
                            Number(
                                item.price
                            ) || 0
                        ),

                    image:
                        item.image || null

                })
                .eq(
                    "id",
                    item.id
                );


            if (itemUpdateError) {

                throw itemUpdateError;

            }

        }


        /* =========================
           إضافة المنتجات الجديدة
        ========================= */

        const newItems =
            editingOrderItems.filter(
                item => !item.id
            );


        if (newItems.length) {

            const insertData =
                newItems.map(item => ({

                    order_id:
                        editingOrderId,

                    product_id:
                       item.product_id,    

                    product_code:
                        item.product_code || null,

                    category:
                        item.category || null,

                    product_type:
                        item.product_type || null,

                    type:
                        item.type || null,

                    company:
                        item.company || null,

                    model:
                        item.model || null,

                    color:
                        item.color || null,

                    quantity:
                        Math.max(
                            1,
                            Number(
                                item.quantity
                            ) || 1
                        ),

                    price:
                        Math.max(
                            0,
                            Number(
                                item.price
                            ) || 0
                        ),

                    image:
                        item.image || null

                }));


            const {
                error: insertError
            } = await supabaseClient
                .from("order_items")
                .insert(
                    insertData
                );


            if (insertError) {

                throw insertError;

            }

        }


        /* =========================
           نجاح
        ========================= */

        editOrderMessage.textContent =
            "تم حفظ تعديل الطلب بنجاح ✅";

        editOrderMessage.style.color =
            "#2e9d69";


        setTimeout(
            async function () {

                closeEditOrder();

                await loadAdminOrders();

            },
            700
        );


    }

    catch (error) {

        console.error(
            "Save Order Edit Error:",
            error
        );


        editOrderMessage.textContent =
            "حدث خطأ أثناء حفظ التعديلات:\n" +
            error.message;

        editOrderMessage.style.color =
            "#e05265";

    }

    finally {

        saveOrderEditButton.disabled =
            false;

        saveOrderEditButton.textContent =
            "حفظ التعديلات";

    }

}


/* =========================================================
   إغلاق نافذة التعديل
========================================================= */

function closeEditOrder() {

    editOrderModal.style.display =
        "none";

    document.body.style.overflow =
        "";

    editingOrderId = null;

    editingOrderItems = [];

}


/* =========================================================
   أزرار الإغلاق
========================================================= */

closeEditOrderButton.addEventListener(
    "click",
    closeEditOrder
);


cancelOrderEditButton.addEventListener(
    "click",
    closeEditOrder
);


/* إغلاق عند الضغط خارج النافذة */

editOrderModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target ===
            editOrderModal
        ) {

            closeEditOrder();

        }

    }
);


/* =========================================================
   حماية النصوص داخل value=""
========================================================= */

function escapeHtmlAttribute(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}



/* =========================================================
   اختيار منتج لإضافته إلى الطلب
========================================================= */
addOrderItemButton.addEventListener("click", async function () {

    addOrderItemButton.disabled = true;
    addOrderItemButton.textContent = "جاري تحميل المنتجات...";

    try {

        const { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .order("id", { ascending: false })
            .limit(1000);

        if (error) {

            console.error("PRODUCT LOAD ERROR:", error);

            alert(
                "خطأ في تحميل المنتجات:\n\n" +
                error.message
            );

            return;
        }

        console.log(
            "منتجات الإضافة:",
            data
        );

        if (!data || data.length === 0) {

            alert("لم يتم العثور على منتجات");

            return;
        }

        showOrderProductList(data);

    }

    catch (error) {

        console.error(
            "ADD PRODUCT ERROR:",
            error
        );

        alert(
            "حدث خطأ:\n\n" +
            error.message
        );

    }

    finally {

        addOrderItemButton.disabled = false;

        addOrderItemButton.textContent =
            "+ إضافة منتج";

    }

});


function showOrderProductList(products) {

    const oldPicker =
        document.getElementById("orderProductPicker");

    if (oldPicker) {
        oldPicker.remove();
    }


    const picker =
        document.createElement("div");

    picker.id =
        "orderProductPicker";

    picker.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0,0,0,.55);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;


    picker.innerHTML = `

        <div style="
            background:white;
            width:100%;
            max-width:700px;
            max-height:85vh;
            overflow:hidden;
            border-radius:20px;
            padding:20px;
        ">

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:15px;
            ">

                <h3 style="margin:0;">
                    اختر المنتج
                </h3>

                <button
                    type="button"
                    onclick="closeOrderProductPicker()"
                    style="
                        border:none;
                        background:#eee;
                        border-radius:10px;
                        width:38px;
                        height:38px;
                        cursor:pointer;
                    "
                >
                    ✕
                </button>

            </div>


            <input
                id="orderProductSearch"
                type="text"
                placeholder="ابحث عن موديل أو شركة..."
                style="
                    width:100%;
                    box-sizing:border-box;
                    padding:13px;
                    border:1px solid #ddd;
                    border-radius:12px;
                    margin-bottom:15px;
                    font-family:inherit;
                "
            >


            <div
                id="orderProductList"
                style="
                    max-height:60vh;
                    overflow-y:auto;
                "
            ></div>

        </div>
    `;


    document.body.appendChild(picker);


    renderOrderProductList(products);


    document
        .getElementById("orderProductSearch")
        .addEventListener("input", function () {

            const search =
                this.value
                    .trim()
                    .toLowerCase();


            const filtered =
                products.filter(product => {

                    const text = `
                        ${product.model || ""}
                        ${product.company || ""}
                        ${product.product_code || ""}
                        ${product.category || ""}
                        ${product.product_type || ""}
                        ${product.type || ""}
                    `.toLowerCase();


                    return text.includes(search);

                });


            renderOrderProductList(filtered);

        });

}

function renderOrderProductList(products) {

    const list =
        document.getElementById(
            "orderProductList"
        );

    if (!list) return;

    list.innerHTML = "";


    products.forEach(product => {

        const button =
            document.createElement("button");

        button.type = "button";

        button.style.cssText = `
            width:100%;
            display:flex;
            align-items:center;
            gap:12px;
            padding:12px;
            margin-bottom:8px;
            border:1px solid #eee;
            border-radius:12px;
            background:white;
            cursor:pointer;
            text-align:right;
            font-family:inherit;
        `;


        button.innerHTML = `

            <div style="
                width:55px;
                height:55px;
                border-radius:10px;
                overflow:hidden;
                background:#f3f3f3;
                display:flex;
                align-items:center;
                justify-content:center;
                flex-shrink:0;
            ">

                ${
                    product.image
                    ?
                    `<img
                        src="${escapeHtmlAttribute(product.image)}"
                        style="
                            width:100%;
                            height:100%;
                            object-fit:cover;
                        "
                    >`
                    :
                    "📦"
                }

            </div>


            <div>

                <strong>
                    ${escapeHtmlAttribute(
                        product.model ||
                        "بدون موديل"
                    )}
                </strong>

                <div style="
                    color:#777;
                    font-size:12px;
                    margin-top:4px;
                ">

                    ${escapeHtmlAttribute(
                        product.company || ""
                    )}

                    ${
                        product.color
                        ?
                        " • " +
                        escapeHtmlAttribute(
                            product.color
                        )
                        :
                        ""
                    }

                </div>


                <div style="
                    color:#6557ed;
                    font-size:12px;
                    margin-top:4px;
                ">

                    ${Number(
                        product.price || 0
                    ).toFixed(2)} ر.س

                </div>

            </div>

        `;


        button.addEventListener(
            "click",
            function () {

                addProductToCurrentOrder(
                    product
                );

            }
        );


        list.appendChild(button);

    });

}



function addProductToCurrentOrder(product) {

    if (!product || !product.id) {

        alert(
            "المنتج لا يحتوي على رقم product_id"
        );

        return;

    }


    editingOrderItems.push({

        id: null,

        order_id:
            editingOrderId,

        product_id:
            product.id,

        product_code:
            product.product_code || null,

        category:
            product.category || null,

        product_type:
            product.product_type || null,

        type:
            product.type || null,

        company:
            product.company || null,

        model:
            product.model || null,

        color:
            product.color || null,

        quantity: 1,

        price:
            Number(product.price || 0),

        image:
            product.image || null

    });


    closeOrderProductPicker();

    renderEditOrderItems();

}
function closeOrderProductPicker() {

    const picker =
        document.getElementById(
            "orderProductPicker"
        );

    if (picker) {
        picker.remove();
    }

}