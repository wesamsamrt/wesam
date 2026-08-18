document.addEventListener("DOMContentLoaded", function () {

    /*
     * منع التكبير التلقائي عند الضغط على حقول الإدخال
     * مع إبقاء التمرير واللمس طبيعيين.
     */

    const inputs = document.querySelectorAll(
        "input, select, textarea"
    );

    inputs.forEach(function (element) {

        element.addEventListener("focus", function () {

            this.style.fontSize = "16px";

        });

    });


    /*
     * منع Zoom بإيماءة النقر المزدوج
     */

    let lastTouchEnd = 0;

    document.addEventListener(
        "touchend",
        function (event) {

            const now = Date.now();

            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }

            lastTouchEnd = now;

        },
        {
            passive: false
        }
    );


    /*
     * منع التكبير بإيماءة pinch
     */

    document.addEventListener(
        "touchmove",
        function (event) {

            if (
                event.touches &&
                event.touches.length > 1
            ) {
                event.preventDefault();
            }

        },
        {
            passive: false
        }
    );

});