document.addEventListener("gesturestart", function (e) {
    e.preventDefault();
});

document.addEventListener("gesturechange", function (e) {
    e.preventDefault();
});

document.addEventListener("gestureend", function (e) {
    e.preventDefault();
});

// منع التكبير بالضغط المزدوج
let lastTouchEnd = 0;

document.addEventListener("touchend", function (e) {
    const now = Date.now();

    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }

    lastTouchEnd = now;
}, { passive: false });