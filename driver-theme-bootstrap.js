// Presentation hint only: permissions and warehouse access still come from the server.
(function () {
    let driver=false;
    function accountKey(){
        try {
            const key=Object.keys(localStorage).find(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'));
            return key ? JSON.parse(localStorage.getItem(key))?.user?.id || '' : '';
        } catch (_) {return '';}
    }
    try { driver=Boolean(accountKey())&&sessionStorage.getItem('wesam-driver-account')===accountKey()&&sessionStorage.getItem('wesam-driver-theme')==='1'; } catch (_) {}
    window.rememberDriverTheme=function(value){
        driver=Boolean(value);
        try {sessionStorage.setItem('wesam-driver-theme',driver?'1':'0');sessionStorage.setItem('wesam-driver-account',accountKey());}catch(_){}
    };
    function apply(){
        if(!driver)return;
        document.documentElement.classList.remove('home-theme-pending','cart-theme-pending','customer-desktop-mobile');
        if(document.body){
            document.body.classList.add('driver-classic-theme');
            if(/orders\.html$/.test(location.pathname)){document.body.classList.add('driver-cart');document.body.classList.remove('customer-cart');}
        }
        const theme=document.getElementById('darkTechThemeStyles');if(theme)theme.media='not all';
        const viewport=document.querySelector('meta[name="viewport"]');
        if(viewport)viewport.content='width=device-width, initial-scale=1.0, viewport-fit=cover';
    }
    const style=document.createElement('style');
    style.textContent='body.driver-classic-theme #storeIntroOverlay,body.driver-classic-theme #productsLoadingScreen,body.driver-classic-theme #offers .sale-card{display:none!important}';
    document.head.appendChild(style);
    const observer=new MutationObserver(apply);observer.observe(document.documentElement,{childList:true,subtree:true});
    apply();document.addEventListener('DOMContentLoaded',()=>{apply();observer.disconnect();},{once:true});
    window.addEventListener('pageshow',apply);
})();
