import fs from "node:fs/promises";
import sharp from "sharp";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="32" y="32" width="960" height="960" rx="210" fill="#edf5ef"/><path d="M512 285V208" stroke="#376757" stroke-width="34" stroke-linecap="round"/><circle cx="512" cy="178" r="44" fill="#e5b461"/><rect x="212" y="294" width="600" height="410" rx="130" fill="#b9dfcc" stroke="#376757" stroke-width="24"/><rect x="284" y="373" width="456" height="222" rx="72" fill="#244d44"/><rect x="364" y="428" width="40" height="71" rx="20" fill="#e1f1da"/><rect x="620" y="428" width="40" height="71" rx="20" fill="#e1f1da"/><path d="M471 540Q512 574 553 540" fill="none" stroke="#e1f1da" stroke-width="18" stroke-linecap="round"/><rect x="363" y="735" width="298" height="83" rx="35" fill="#a2ceb7"/><circle cx="287" cy="553" r="24" fill="#e8bb9e"/><circle cx="737" cy="553" r="24" fill="#e8bb9e"/></svg>`;
await fs.mkdir(new URL("../src-tauri/icons/", import.meta.url), {
  recursive: true,
});
await sharp(Buffer.from(svg))
  .png()
  .toFile(new URL("../src-tauri/icons/icon.png", import.meta.url).pathname);
console.log("Created original raster application icon.");
