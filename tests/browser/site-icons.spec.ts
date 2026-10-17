import { expect, test } from "@playwright/test";

test("browser icons are declared once across home, search and company detail", async ({ page, request }) => {
  const found = await request.get("/api/v1/companies?q=삼성전자&limit=1");
  expect(found.status()).toBe(200);
  const company = (await found.json()).data.companies[0];
  for (const path of ["/", "/?q=삼성전자", `/companies/${company.id}`]) {
    await page.goto(path);
    const icons = page.locator('head link[rel="icon"]');
    await expect(icons).toHaveCount(3);
    for (const [href, type, sizes] of [
      ["/favicon.ico", "image/x-icon", "16x16 32x32 48x48"],
      ["/favicon-96.png", "image/png", "96x96"],
      ["/icon.svg", "image/svg+xml", "any"]
    ]) {
      const link = page.locator(`head link[rel="icon"][href="${href}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("type", type);
      await expect(link).toHaveAttribute("sizes", sizes);
    }
    const apple = page.locator('head link[rel="apple-touch-icon"]');
    await expect(apple).toHaveCount(1);
    await expect(apple).toHaveAttribute("href", "/apple-touch-icon.png");
    await expect(apple).toHaveAttribute("type", "image/png");
    await expect(apple).toHaveAttribute("sizes", "180x180");
  }
});

test("all icon assets load and each ICO frame decodes in a browser", async ({ request, page }) => {
  const frames: { base64: string; size: number }[] = [];
  for (const [path, type, size] of [
    ["/favicon.ico", "image/x-icon", 0],
    ["/favicon-96.png", "image/png", 96],
    ["/apple-touch-icon.png", "image/png", 180],
    ["/icon.svg", "image/svg+xml", 64]
  ] as const) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"].split(";")[0]).toBe(type);
    const bytes = await response.body();
    if (size === 0) {
      expect(bytes.readUInt16LE(0)).toBe(0);
      expect(bytes.readUInt16LE(2)).toBe(1);
      expect(bytes.readUInt16LE(4)).toBe(3);
      for (const [i, frameSize] of [16, 32, 48].entries()) {
        const entry = 6 + i * 16;
        expect(bytes[entry]).toBe(frameSize);
        expect(bytes[entry + 1]).toBe(frameSize);
        const length = bytes.readUInt32LE(entry + 8);
        const offset = bytes.readUInt32LE(entry + 12);
        expect(offset + length).toBeLessThanOrEqual(bytes.length);
        const frame = bytes.subarray(offset, offset + length);
        expect(frame.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(frame.readUInt32BE(16)).toBe(frameSize);
        expect(frame.readUInt32BE(20)).toBe(frameSize);
        frames.push({ base64: frame.toString("base64"), size: frameSize });
      }
    } else if (type === "image/png") {
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
      frames.push({ base64: bytes.toString("base64"), size });
    }
  }
  for (const frame of frames) {
    const dimensions = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, frame.base64);
    expect(dimensions).toEqual([frame.size, frame.size]);
  }
  await page.goto("/favicon.ico");
  await page.locator("img").evaluate(async (image: HTMLImageElement) => image.decode());
});
