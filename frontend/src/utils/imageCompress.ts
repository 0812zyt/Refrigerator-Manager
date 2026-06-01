// 把 dataURL 缩到最大寬度並重新編碼成 JPEG。
// 預設 800px / quality 0.7，一張照片大約 80-200 KB，方便存進 localStorage。
export async function compressImage(
  dataUrl: string,
  maxWidth = 800,
  quality = 0.7,
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    if (!img.width || !img.height) {
      console.warn('[compressImage] 影像尺寸為 0，可能相機未準備好');
      return dataUrl;
    }
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch (e) {
    console.warn('[compressImage] 壓縮失敗，使用原圖', e);
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
