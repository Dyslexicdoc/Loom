/**
 * Browser download helpers. Loom is local-first: exports are produced in the
 * page and handed straight to the user, never round-tripped through a server.
 */

/** A filename-safe version of a title, for use as a download name. */
export function slugify(title: string, fallback = "loom"): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Give the click a tick to start before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

/**
 * Rasterizes an SVG document to a PNG blob at `scale`x. The SVG must be
 * self-contained — an <img> refuses to load external references — which the
 * diagram renderer guarantees.
 */
export async function svgToPng(
  svg: string,
  scale = 2,
  background?: string,
): Promise<Blob> {
  const match = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  const width = Number(match?.[1] ?? 800);
  const height = Number(match?.[2] ?? 600);

  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The diagram could not be rasterized."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("This browser has no 2D canvas.");
    }
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
