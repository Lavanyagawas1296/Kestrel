import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'image/png',
  'image/jpeg',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES: Record<AllowedMimeType, number> = {
  'text/plain': 2 * 1024 * 1024, // 2MB
  'text/markdown': 2 * 1024 * 1024, // 2MB
  'application/pdf': 10 * 1024 * 1024, // 10MB
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024, // 10MB
  'image/png': 5 * 1024 * 1024, // 5MB
  'image/jpeg': 5 * 1024 * 1024, // 5MB
};

export const fileUploadMetaSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: 'Unsupported file type. Allowed: text, Markdown, DOCX, PDF, PNG/JPG' }),
  }),
  size: z.number().int().positive(),
}).refine(
  (data) => data.size <= MAX_FILE_SIZE_BYTES[data.mimeType],
  (data) => ({
    message: `File exceeds maximum allowed size of ${(MAX_FILE_SIZE_BYTES[data.mimeType] / (1024 * 1024)).toFixed(0)}MB for ${data.mimeType}`,
    path: ['size'],
  })
);

/**
 * Validates binary buffer headers against expected magic bytes.
 * Prevents MIME-type spoofing (e.g. executable disguised as .pdf or .png).
 */
export function verifyMagicBytes(buffer: Uint8Array | Buffer, mimeType: AllowedMimeType): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const bytes = new Uint8Array(buffer);

  switch (mimeType) {
    case 'application/pdf':
      // %PDF- (0x25 0x50 0x44 0x46 0x2D)
      return (
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d
      );

    case 'image/png':
      // \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );

    case 'image/jpeg':
      // FF D8 FF
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      // PK\x03\x04 (ZIP archive header standard for OpenXML .docx)
      return (
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
      );

    case 'text/plain':
    case 'text/markdown':
      // Verify valid text: no binary null bytes (0x00) within the first 1024 bytes
      const sampleLength = Math.min(bytes.length, 1024);
      for (let i = 0; i < sampleLength; i++) {
        if (bytes[i] === 0x00) {
          return false;
        }
      }
      return true;

    default:
      return false;
  }
}
