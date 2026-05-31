import { readPublicImageUrl } from "./image-utils";
import { assertSupportedImage } from "./request-guards";
import { mapWithConcurrency } from "./async-utils";

const brandReferenceInputCount = 3;
const styleReferenceInputCount = 3;
const brandReferenceInputReadConcurrency = 3;

export type BrandReferenceImage = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export async function readBrandReferenceImages(formData: FormData): Promise<BrandReferenceImage[]> {
  const inputs = [
    ...Array.from({ length: brandReferenceInputCount }, (_, offset) => ({
      fileKey: `brandAsset_${offset + 1}`,
      urlKey: `brandAssetUrl_${offset + 1}`,
      fallbackFileName: `brand-asset-${offset + 1}.png`,
    })),
    ...Array.from({ length: styleReferenceInputCount }, (_, offset) => ({
      fileKey: `styleReference_${offset + 1}`,
      urlKey: `styleReferenceUrl_${offset + 1}`,
      fallbackFileName: `favorite-style-${offset + 1}.png`,
    })),
  ];
  const images = await mapWithConcurrency(
    inputs,
    brandReferenceInputReadConcurrency,
    (input) => readBrandReferenceImage(formData, input),
  );
  return images.filter((image): image is BrandReferenceImage => image !== null);
}

async function readBrandReferenceImage(formData: FormData, input: { fileKey: string; urlKey: string; fallbackFileName: string }): Promise<BrandReferenceImage | null> {
  const file = formData.get(input.fileKey);
  const sourceUrl = String(formData.get(input.urlKey) ?? "");
  if (file instanceof File) {
    assertSupportedImage(file);
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || input.fallbackFileName,
      mimeType: file.type || "image/png",
    };
  }
  if (sourceUrl) {
    return {
      buffer: await readPublicImageUrl(sourceUrl),
      fileName: input.fallbackFileName,
      mimeType: "image/png",
    };
  }
  return null;
}
