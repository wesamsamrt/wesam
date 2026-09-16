(function () {
    function gridLines(pixels, width, height, vertical) {
        const size=vertical?width:height, length=vertical?height:width, hits=[];
        for(let a=0;a<size;a++) {
            let dark=0;
            for(let b=0;b<length;b++) {
                let found=false;
                for(let offset=-2;offset<=2;offset++) {
                    const pos=a+offset;if(pos<0||pos>=size)continue;
                    const i=(vertical?b*width+pos:pos*width+b)*4;
                    if(Math.max(pixels[i],pixels[i+1],pixels[i+2])<125){found=true;break;}
                }
                if(found)dark++;
            }
            if(dark/length>.65)hits.push(a);
        }
        const groups=[];
        hits.forEach(x=>{const last=groups.at(-1);if(last&&x-last.at(-1)<=4)last.push(x);else groups.push([x]);});
        const lines=groups.map(g=>Math.round((g[0]+g.at(-1))/2));
        if(!lines.length||lines[0]>size*.03)lines.unshift(0);
        if(lines.at(-1)<size*.97)lines.push(size-1);
        return lines;
    }
    function safeNumber(text, confidence, integer=false) {
        const clean=String(text||'').trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.');
        if(confidence<85||!(integer?/^\d+$/:/^\d+(?:\.\d{1,2})?$/).test(clean))return '';
        const value=Number(clean);return Number.isFinite(value)&&(!integer||value>0)?value:'';
    }
    async function read(img, progress, cancelled) {
        const source=document.createElement('canvas');source.width=img.naturalWidth;source.height=img.naturalHeight;
        const context=source.getContext('2d',{willReadFrequently:true});context.drawImage(img,0,0);
        const pixels=context.getImageData(0,0,source.width,source.height);
        const xs=gridLines(pixels.data,source.width,source.height,true),ys=gridLines(pixels.data,source.width,source.height,false);
        if(xs.length!==10||ys.length<3)throw new Error('تعذر تحديد شبكة من تسعة أعمدة. ارفع صورة مستقيمة مقصوصة على الجدول مع ظهور حدوده كاملة.');
        if(ys.length>102)throw new Error('عدد صفوف الصورة كبير؛ قسّم الصورة إلى صفحات أصغر.');
        const workers=[];let english,arabic;
        try {
            english=await Tesseract.createWorker('eng');workers.push(english);
            if(cancelled())return null;
            arabic=await Tesseract.createWorker('ara+eng');workers.push(arabic);
            const rows=[],raw=[];
            for(let r=1;r<ys.length-1;r++) {
                const cells=[];
                for(let c=0;c<8;c++) {
                    if(cancelled())return null;
                    progress(`قراءة الصف ${r} من ${ys.length-2} · الخانة ${c+1} من 8`);
                    const crop=document.createElement('canvas'), pad=4;
                    const w=xs[c+1]-xs[c]-pad*2,h=ys[r+1]-ys[r]-pad*2;
                    if(w<5||h<5)throw new Error('حدود الخلايا غير واضحة؛ استخدم صورة أوضح.');
                    crop.width=w*3+24;crop.height=h*3+24;
                    const ctx=crop.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);
                    ctx.drawImage(source,xs[c]+pad,ys[r]+pad,w,h,12,12,w*3,h*3);
                    const data=ctx.getImageData(0,0,crop.width,crop.height);
                    for(let i=0;i<data.data.length;i+=4){const v=Math.max(data.data[i],data.data[i+1],data.data[i+2])>170?255:0;data.data[i]=data.data[i+1]=data.data[i+2]=v;}
                    ctx.putImageData(data,0,0);
                    const numeric=c<2,worker=[0,1,3,4,7].includes(c)?english:arabic;
                    await worker.setParameters({tessedit_pageseg_mode:numeric||c===7?'7':'6',tessedit_char_whitelist:numeric?'0123456789.':c===7?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-':'',user_defined_dpi:'300'});
                    const {data:result}=await worker.recognize(crop);
                    cells.push(result);raw.push(`صف ${r} / عمود ${c+1}: ${result.text.trim()} (ثقة ${Math.round(result.confidence)})`);
                }
                const text=c=>cells[c].confidence>=60?cells[c].text.trim().replace(/\s+/g,' ').replace(/^[-–—]+$/,''):'';
                const quantity=safeNumber(cells[1].text,cells[1].confidence,true),total=safeNumber(cells[0].text,cells[0].confidence);
                rows.push({product_code:text(7),category:'',product_type:text(6),type:text(5),company:text(4),model:text(3),color:text(2),quantity,price:quantity!==''&&total!==''?Number((total/quantity).toFixed(4)):''});
            }
            return {rows,raw:raw.join('\n')};
        } finally {await Promise.all(workers.map(w=>w.terminate()));}
    }
    window.PurchaseCellOCR={read,gridLines,safeNumber};
})();
