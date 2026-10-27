import mammoth from 'mammoth';
import { PNG } from 'pngjs';
import { verifyMagicBytes, type AllowedMimeType } from '../validation/upload';

export interface IngestionResult {
  text: string;
  metadata?: {
    dominantHexColors?: string[];
    hasImages?: boolean;
    extractedWordCount?: number;
  };
}

/**
 * Extracts raw RGB and converts to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Samples pixel data to extract up to 3 dominant hex colors from PNG
 */
function extractColorsFromPngBuffer(buffer: Buffer): string[] {
  try {
    const png = PNG.sync.read(buffer);
    const colorCounts: Record<string, number> = {};

    // Sample every 16th pixel for performance
    for (let i = 0; i < png.data.length; i += 64) {
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];

      // Ignore transparent pixels
      if (a < 128) continue;

      // Quantize to 16-color bins
      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      const hex = rgbToHex(qr, qg, qb);
      colorCounts[hex] = (colorCounts[hex] || 0) + 1;
    }

    const sorted = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([hex]) => hex);

    return sorted.slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Ingests content from raw string or file buffer with magic-byte verification.
 */
export async function ingestContent(
  input: string | Buffer | Uint8Array,
  mimeType: AllowedMimeType = 'text/plain'
): Promise<IngestionResult> {
  if (typeof input === 'string') {
    return {
      text: input,
      metadata: {
        extractedWordCount: input.trim().split(/\s+/).filter(Boolean).length,
      },
    };
  }

  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  // Validate magic bytes to prevent spoofing
  if (!verifyMagicBytes(buffer, mimeType)) {
    throw new Error(`File content failed magic-byte validation for mimeType: ${mimeType}`);
  }

  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown': {
      const text = buffer.toString('utf8');
      return {
        text,
        metadata: {
          extractedWordCount: text.trim().split(/\s+/).filter(Boolean).length,
        },
      };
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      // DOCX text extraction via mammoth
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value || '';
      return {
        text,
        metadata: {
          extractedWordCount: text.trim().split(/\s+/).filter(Boolean).length,
        },
      };
    }

    case 'application/pdf': {
      // PDF text extraction via pdf-parse
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = data.text || '';
      await parser.destroy?.();
      return {
        text,
        metadata: {
          extractedWordCount: text.trim().split(/\s+/).filter(Boolean).length,
        },
      };
    }

    case 'image/png': {
      const dominantHexColors = extractColorsFromPngBuffer(buffer);
      return {
        text: `[Visual Asset: PNG Image. Extracted Dominant Hex Colours: ${dominantHexColors.join(', ')}]`,
        metadata: {
          dominantHexColors,
          hasImages: true,
        },
      };
    }

    case 'image/jpeg': {
      return {
        text: `[Visual Asset: JPEG Image.]`,
        metadata: {
          hasImages: true,
        },
      };
    }

    default:
      throw new Error(`Unsupported MIME type for ingestion: ${mimeType}`);
  }
}
