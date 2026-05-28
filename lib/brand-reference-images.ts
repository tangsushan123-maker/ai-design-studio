import { readPublicImageUrl } from "./image-utils";
import { assertSupportedImage } from "./request-guards";
import { mapWithConcurrency } from "./async-utils";

const brandReferenceInputCount = 3;
const brandReferenceInputReadConcurrency = 3;

export type BrandReferenceImage = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export async function readBrandReferenceImages(formData: FormData): Promise<BrandReferenceImage[]> {
  const images = await mapWithConcurrency(
    Array.from({ length: brandReferenceInputCount }, (_, offset) => offset + 1),
    brandReferenceInputReadConcurrency,
    (index) => readBrandReferenceImage(formData, index),
  );
  return images.filter((image): image is BrandReferenceImage => image !== null);
}

async function readBrandReferenceImage(formData: FormData, index: number): Promise<BrandReferenceImage | null> {
  const file = formData.get(`brandAsset_${index}`);
  const sourceUrl = String(formData.get(`brandAssetUrl_${index}`) ?? "");
  if (file instanceof File) {
    assertSupportedImage(file);
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || `brand-asset-${index}.png`,
      mimeType: file.type || "image/png",
    };
  }
  if (sourceUrl) {
    return {
      buffer: await readPublicImageUrl(sourceUrl),
      fileName: `brand-asset-${index}.png`,
      mimeType: "image/png",
    };
  }
  return null;
}
