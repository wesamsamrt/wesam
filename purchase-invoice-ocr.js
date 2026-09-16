/* Free, local OCR review for the supplied stock-transfer table layout. */
(function () {
    const digits = value => String(value || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    const identity = value => digits(value).toUpperCase().replace(/[\s–—_-]/g, '');
    const number = value => {
        const matches = digits(value).replace(/٬/g, '').replace(/٫/g, '.').match(/\d+(?:[.,]\d+)?/g);
        return matches?.length === 1 ? Number(matches[0].replace(',', '.')) : NaN;
    };
    function extractWords(data) {
        if(data?.words?.length)return data.words;
        return (data?.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
    }
    function parse(words, width, left = 3, right = 95) {
        const start = width * left / 100, span = width * (right - left) / 100;
        // Fractions measured from the supplied example: total, qty, color, model, company, type, product type, code, row number.
        const edges = [0, .115, .22, .33, .435, .54, .645, .755, .875, 1];
        const column = w => edges.findIndex((edge, i) => i < edges.length - 1 && (w.bbox.x0 + w.bbox.x1) / 2 >= start + edge * span && (w.bbox.x0 + w.bbox.x1) / 2 < start + edges[i + 1] * span);
        // OCR may split WM, hyphen and digits into separate words. Join by position,
        // not OCR reading order (which can be reversed in Arabic documents).
        const groups=[];
        words.filter(w=>column(w)===7).sort((a,b)=>a.bbox.y0-b.bbox.y0).forEach(w=>{
            const cy=(w.bbox.y0+w.bbox.y1)/2;
            const group=groups.find(g=>Math.abs(g.y-cy)<Math.max(5,(w.bbox.y1-w.bbox.y0)*.6));
            if(group)group.words.push(w);else groups.push({y:cy,words:[w]});
        });
        const anchors=groups.flatMap(g=>{
            const parts=g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
            const text=digits(parts.map(w=>w.text).join('')).toUpperCase().replace(/[–—_]/g,'-').replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g,'');
            if(!/^(?:[A-Z]{1,5}-?)?\d{3,}[A-Z0-9-]*$/.test(text))return [];
            return [{text,bbox:{x0:Math.min(...parts.map(w=>w.bbox.x0)),x1:Math.max(...parts.map(w=>w.bbox.x1)),y0:Math.min(...parts.map(w=>w.bbox.y0)),y1:Math.max(...parts.map(w=>w.bbox.y1))}}];
        });
        return anchors.map((anchor, i) => {
            const center = (anchor.bbox.y0 + anchor.bbox.y1) / 2;
            const prev = anchors[i-1], next = anchors[i+1];
            const gap = next ? (next.bbox.y0+next.bbox.y1)/2-center : prev ? center-(prev.bbox.y0+prev.bbox.y1)/2 : 60;
            const top = prev ? (center+(prev.bbox.y0+prev.bbox.y1)/2)/2 : center-gap/2;
            const bottom = next ? (center+(next.bbox.y0+next.bbox.y1)/2)/2 : center+gap/2;
            const cells = Array.from({length:9},()=>[]);
            words.forEach(w => {const y=(w.bbox.y0+w.bbox.y1)/2, c=column(w); if(y>=top&&y<bottom&&c>=0)cells[c].push(w);});
            const text = c => cells[c].sort((a,b)=>Math.abs(a.bbox.y0-b.bbox.y0)>10?a.bbox.y0-b.bbox.y0:(c===3||c===4?a.bbox.x0-b.bbox.x0:b.bbox.x0-a.bbox.x0)).map(w=>w.text).join(' ').trim().replace(/^[-–—]+$/, '');
            const quantity=number(text(1)), total=number(text(0).replace(/ر\.?\s*س\.?/g,''));
            return {product_code:digits(anchor.text).replace(/[–—]/g,'-'), category:'', product_type:text(6), type:text(5), company:text(4), model:text(3), color:text(2), quantity:Number.isFinite(quantity)?quantity:'', price:Number.isFinite(total)&&quantity>0?Number((total/quantity).toFixed(4)):''};
        });
    }
    async function review(file, products, onAdd) {
        if (!window.Tesseract) return alert('تعذر تحميل قارئ الصور. تحقق من الإنترنت.');
        const dialog=document.createElement('dialog');
        dialog.className='purchase-ocr-review';
        dialog.innerHTML='<h2>مراجعة صورة طلب الشراء</h2><p>القالب مخصص لجدول التحويل المرفق: الإجمالي يسارًا والكود يمينًا. القراءة قد تخطئ أو تفوّت صفوفًا؛ راجع الصورة والعدد والكميات. لا يتم حفظ الطلب تلقائيًا.</p><button type="button" data-close>إلغاء وإغلاق</button><p data-status>جاري قراءة الصورة…</p><details><summary>الصورة وإعدادات حدود الجدول</summary><img alt="صورة الفاتورة للمراجعة"><label>بداية الجدول من يسار الصورة % <input data-left type="number" value="3" min="0" max="99"></label><label>نهاية الجدول % <input data-right type="number" value="95" min="1" max="100"></label><button type="button" data-parse disabled>إعادة توزيع الأعمدة</button></details><div class="purchase-ocr-table"></div><button type="button" data-new>إضافة صف يدوي</button><p data-count></p><label><input type="checkbox" data-reviewed>راجعت جميع الصفوف والكميات والأسعار مقابل الصورة</label><button type="button" data-add disabled>إضافة المسودة لطلب الشراء</button>';
        document.body.appendChild(dialog); dialog.showModal();
        const rawDetails=document.createElement('details'),rawSummary=document.createElement('summary'),rawText=document.createElement('textarea');
        rawSummary.textContent='النص الخام للتشخيص والمراجعة';rawText.readOnly=true;rawText.style.cssText='width:100%;min-height:140px';rawDetails.append(rawSummary,rawText);dialog.appendChild(rawDetails);
        const url=URL.createObjectURL(file), img=dialog.querySelector('img'); img.src=url;
        dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();},{once:true});
        dialog.querySelector('[data-close]').onclick=()=>dialog.close();
        const status=dialog.querySelector('[data-status]'), target=dialog.querySelector('.purchase-ocr-table');
        let rows=[], words=[], width=0;
        const fields={product_code:'كود المنتج',category:'التصنيف',product_type:'نوع المنتج',type:'النوع',company:'الشركة',model:'الموديل',color:'اللون',quantity:'الكمية',price:'سعر الوحدة'};
        const matched=row=>products.filter(p=>['product_code','model','color'].every(key=>identity(p[key])===identity(row[key])));
        function update() {
            dialog.querySelector('[data-reviewed]').checked=false;
            dialog.querySelector('[data-add]').disabled=true;
            dialog.querySelector('[data-count]').textContent=`عدد الصفوف: ${rows.length} · الإجمالي: ${rows.reduce((s,r)=>s+(Number(r.quantity)||0)*(Number(r.price)||0),0).toFixed(2)}`;
        }
        function render() {
            target.replaceChildren(); const table=document.createElement('table'), head=table.createTHead().insertRow();
            ['المطابقة (الكود + الموديل + اللون)',...Object.values(fields),'إزالة'].forEach(label=>{const th=document.createElement('th');th.textContent=label;head.appendChild(th);});
            rows.forEach((row,index)=>{
                const tr=table.insertRow(), result=tr.insertCell();
                const showMatch=()=>{const list=matched(row);result.textContent=list.length===1?'مطابق — راجع البيانات':list.length>1?'مطابقة متعددة — راجع البيانات':'غير مطابق — سيضاف بوصفه المكتوب فقط';}; showMatch();
                Object.keys(fields).forEach(key=>{const input=document.createElement('input');input.value=row[key]??'';input.type=['quantity','price'].includes(key)?'number':'text';if(input.type==='number'){input.min=key==='quantity'?'1':'0';input.step=key==='quantity'?'1':'any';}input.oninput=()=>{row[key]=input.value;showMatch();update();};tr.insertCell().appendChild(input);});
                const remove=document.createElement('button');remove.type='button';remove.textContent='إزالة';remove.onclick=()=>{rows.splice(index,1);render();};tr.insertCell().appendChild(remove);
            });target.appendChild(table);update();
        }
        dialog.querySelector('[data-reviewed]').onchange=e=>dialog.querySelector('[data-add]').disabled=!e.target.checked||!rows.length;
        dialog.querySelector('[data-new]').onclick=()=>{rows.push({});render();};
        dialog.querySelector('[data-add]').onclick=()=>{
            if(rows.some(r=>!String(r.product_code||'').trim()||!Number.isInteger(Number(r.quantity))||Number(r.quantity)<=0||r.price===''||r.price==null||!Number.isFinite(Number(r.price))||Number(r.price)<0))return alert('أكمل كود المنتج وكمية صحيحة أكبر من صفر وسعر الوحدة لكل صف.');
            onAdd(rows.map((r,index)=>{const matches=matched(r), p=matches.length===1?matches[0]:{};return {...p,...r,id:p.id||`ocr-${Date.now()}-${index}`,category:r.category||p.category||'',available_quantity:Number(p.quantity||0),purchase_quantity:Number(r.quantity),purchase_price:Number(r.price)};}));
            dialog.close();
        };
        const distribute=()=>{
            const left=Number(dialog.querySelector('[data-left]').value),right=Number(dialog.querySelector('[data-right]').value);
            if(left<0||right>100||left>=right)return alert('حدود الجدول غير صحيحة.');
            rows=parse(words,width,left,right);render();status.textContent=rows.length?`تم استخراج ${rows.length} صف مبدئي. راجع العدد وجميع القيم؛ سعر الوحدة = إجمالي السطر ÷ الكمية.`:`لم تُستخرج صفوف من ${words.length} كلمة. راجع النص الخام واضبط حدود الجدول حسب الصورة ثم اضغط إعادة توزيع الأعمدة؛ أو أضف الصفوف يدويًا.`;
        };
        dialog.querySelector('[data-parse]').onclick=distribute;
        try {
            await img.decode(); width=img.naturalWidth;
            const result=await window.Tesseract.recognize(file,'ara+eng',{logger:m=>{if(dialog.isConnected)status.textContent=`جاري القراءة: ${Math.round((m.progress||0)*100)}%`;}});
            if(!dialog.isConnected)return;
            words=extractWords(result.data);rawText.value=result.data.text||'';
            if(!parse(words,width).length){
                status.textContent='محاولة ثانية لقراءة الأكواد والأرقام باللغة الإنجليزية…';
                const english=await window.Tesseract.recognize(file,'eng');
                if(!dialog.isConnected)return;
                const englishWords=extractWords(english.data);
                rawText.value+='\n\n--- English ---\n'+(english.data.text||'');
                // Preserve Arabic descriptive cells while retrying Latin/numeric columns.
                const latinColumn=w=>{const x=((w.bbox.x0+w.bbox.x1)/2-width*.03)/(width*.92);return x<.22||(x>=.33&&x<.54)||(x>=.755&&x<.875);};
                const combined=[...words.filter(w=>!latinColumn(w)),...englishWords.filter(latinColumn)];
                if(parse(combined,width).length)words=combined;
                else if(!words.length)words=englishWords;
            }
            distribute();dialog.querySelector('[data-parse]').disabled=false;
        } catch(error) {if(dialog.isConnected)status.textContent='تعذرت القراءة. يمكنك إضافة الصفوف يدويًا أو المحاولة بصورة أوضح.';}
    }
    window.PurchaseInvoiceOCR = {parse, identity, number, extractWords, review};
})();
