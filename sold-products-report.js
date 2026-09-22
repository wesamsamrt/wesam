(function () {
    const dateKey=value=>{
        const date=new Date(value);
        if(!value||!Number.isFinite(date.getTime()))return '';
        return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    };
    function collect(orders,from,to) {
        return orders.filter(order=>['تم الشحن','تم شحن الطلب','تم التسليم','تم استلام طلبك'].includes(String(order.status||'').trim())&&dateKey(order.created_at)>=from&&dateKey(order.created_at)<=to)
            .flatMap(order=>(order.items||[]).map(item=>({...item,orderId:order.id,orderDate:dateKey(order.created_at),orderStatus:order.status})));
    }
    window.collectSoldProductsReport=collect;
    const host=document.getElementById('salesAdmin');
    if(!host)return;
    const page=document.createElement('section');page.id='soldProductsPage';page.hidden=true;
    page.innerHTML='<div class="orders-admin-header"><button type="button" data-back class="back-admin">رجوع للمبيعات</button><div><h2>المنتجات المباعة حسب التاريخ</h2><p>حسب تاريخ إنشاء الطلب بتوقيت السعودية، وحالته الحالية تم الشحن أو تم التسليم فقط. كل سطر يمثل صنفًا في طلب، ولا تُدمج الموديلات والألوان.</p></div></div><div class="sales-filters"><label>من تاريخ<input type="date" data-from></label><label>إلى تاريخ<input type="date" data-to></label><button type="button" data-load>عرض المنتجات</button></div><p data-message role="status"></p><div style="overflow:auto" data-results></div>';
    host.appendChild(page);
    const style=document.createElement('style');style.textContent='#salesAdmin.sold-products-mode > :not(#soldProductsPage){display:none!important}#soldProductsPage table{width:100%;min-width:1100px;border-collapse:collapse;background:white}#soldProductsPage th,#soldProductsPage td{padding:12px;border:1px solid #ebe7f8;text-align:right}#soldProductsPage th{background:#eee9ff}';document.head.appendChild(style);
    const from=page.querySelector('[data-from]'),to=page.querySelector('[data-to]'),message=page.querySelector('[data-message]'),results=page.querySelector('[data-results]');
    let request=0;
    async function load(){
        const ticket=++request;results.replaceChildren();
        if(!from.value||!to.value||from.value>to.value){message.textContent='حدد فترة صحيحة؛ تاريخ البداية لا يتجاوز النهاية.';return;}
        const warehouse=selectedWarehouse,start=from.value,end=to.value;
        if(!warehouse){message.textContent='اختر المخزن أولًا.';return;}
        message.textContent='جاري تحميل المنتجات المباعة…';
        try {
            const {data,error}=await supabaseClient.rpc('list_warehouse_orders',{p_warehouse:warehouse});
            if(ticket!==request||warehouse!==selectedWarehouse)return;
            if(error)throw error;
            const rows=collect(Array.isArray(data)?data:[],start,end);
            const qty=rows.reduce((s,r)=>s+Number(r.quantity||0),0),amount=rows.reduce((s,r)=>s+Number(r.quantity||0)*Number(r.price||0),0);
            message.textContent=`مخزن ${warehouse} · ${new Set(rows.map(r=>r.orderId)).size} طلب · ${rows.length} سطر · ${qty} قطعة · قيمة الأصناف: ${amount.toFixed(2)} ر.س`;
            if(!rows.length){results.textContent='لا توجد منتجات مباعة ضمن الفترة المحددة بالحالات المطلوبة.';return;}
            const columns={orderId:'رقم الطلب',orderDate:'التاريخ',orderStatus:'الحالة',product_code:'كود المنتج',category:'التصنيف',product_type:'نوع المنتج',type:'النوع',company:'الشركة',model:'الموديل',color:'اللون',quantity:'الكمية',price:'سعر الوحدة',lineTotal:'الإجمالي'};
            const table=document.createElement('table'),head=table.createTHead().insertRow(),body=table.createTBody();
            Object.values(columns).forEach(label=>{const th=document.createElement('th');th.textContent=label;head.appendChild(th);});
            rows.forEach(row=>{const tr=body.insertRow();Object.keys(columns).forEach(key=>{tr.insertCell().textContent=key==='lineTotal'?(Number(row.quantity||0)*Number(row.price||0)).toFixed(2):String(row[key]??'—');});});results.appendChild(table);
        }catch(error){if(ticket===request)message.textContent=`تعذر تحميل التقرير: ${error.message||'حاول مجددًا'}`;}
    }
    document.getElementById('openSoldProducts')?.addEventListener('click',()=>{host.classList.add('sold-products-mode');page.hidden=false;from.value=to.value=dateKey(new Date());load();});
    page.querySelector('[data-back]').onclick=()=>{request++;page.hidden=true;host.classList.remove('sold-products-mode');};
    page.querySelector('[data-load]').onclick=load;
})();
