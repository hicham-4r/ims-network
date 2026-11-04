import sharp from "sharp";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_AVATAR_PIXELS = 4096 * 4096;

const allowedFormats = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export class AvatarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarValidationError";
  }
}

function hasValidSignature(
  bytes: Buffer,
  format: string,
): boolean {
  if (format === "jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (format === "png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }

  if (format === "webp") {
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

export async function prepareAvatarImage(
  input: unknown,
): Promise<Buffer> {
  if (!(input instanceof File)) {
    throw new AvatarValidationError(
      "Please select an image.",
    );
  }

  if (
    input.size === 0 ||
    input.size > MAX_AVATAR_BYTES
  ) {
    throw new AvatarValidationError(
      "Image must be smaller than 2 MB.",
    );
  }

  const expectedFormat = allowedFormats.get(input.type);

  if (!expectedFormat) {
    throw new AvatarValidationError(
      "Only JPEG, PNG and WebP images are accepted.",
    );
  }

  const bytes = Buffer.from(await input.arrayBuffer());

  if (
    bytes.length !== input.size ||
    !hasValidSignature(bytes, expectedFormat)
  ) {
    throw new AvatarValidationError(
      "Invalid image content.",
    );
  }

  try {
    const options = {
      limitInputPixels: MAX_AVATAR_PIXELS,
      failOn: "error" as const,
    };

    const metadata = await sharp(bytes, options).metadata();

    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width < 64 ||
      metadata.height < 64 ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new AvatarValidationError(
        "Unsupported image dimensions or format.",
      );
    }

    const output = await sharp(bytes, options)
      .rotate()
      .resize(512, 512, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .webp({
        quality: 78,
        effort: 4,
      })
      .toBuffer();

    if (output.length > 512 * 1024) {
      throw new AvatarValidationError(
        "Processed image exceeds the size limit.",
      );
    }

    return output;
  } catch (error) {
    if (error instanceof AvatarValidationError) {
      throw error;
    }

    throw new AvatarValidationError(
      "The image could not be processed.",
    );
  }
}
