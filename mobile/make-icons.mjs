// Tạo ảnh nguồn cho `npx capacitor-assets generate` từ ../icon.svg (chạy lại khi đổi icon).
import sharp from "sharp";
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>`;
const mark = `<path d="M256 92c-72 0-130 57-130 128 0 94 130 200 130 200s130-106 130-200c0-71-58-128-130-128Z" fill="#fff"/>
  <path d="M256 152 192 206h16v58h96v-58h16Z" fill="#0f766e"/>
  <rect x="242" y="226" width="28" height="38" rx="4" fill="#fff"/>`;
const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}${body}</svg>`);
const out = (name, body, size = 1024) => sharp(svg(body), { density: 300 }).resize(size, size).png().toFile(`assets/${name}`);
// Icon vuông không bo góc (iOS/Android tự cắt theo hình của máy)
await out("icon-only.png", `<rect width="512" height="512" fill="url(#g)"/>${mark}`);
// Adaptive icon Android: nền + hình (thu nhỏ vào vùng an toàn 66%)
await out("icon-background.png", `<rect width="512" height="512" fill="url(#g)"/>`);
await out("icon-foreground.png", `<g transform="translate(256 256) scale(.62) translate(-256 -256)">${mark}</g>`);
// Màn hình khởi động: icon bo góc giữa nền kem / nền tối
const splash = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${bg}"/>
  <svg x="1066" y="1066" width="600" height="600" viewBox="0 0 512 512">${grad}<rect width="512" height="512" rx="112" fill="url(#g)"/>${mark}</svg></svg>`;
await sharp(Buffer.from(splash("#f6f4ef"))).png().toFile("assets/splash.png");
await sharp(Buffer.from(splash("#1c1917"))).png().toFile("assets/splash-dark.png");
console.log("ok");
