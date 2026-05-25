import { Injectable } from '@nestjs/common';
import { TAG_DICTIONARY } from '../dictionaries/tag_dictionary_1500_entries';

export type ExtractProductTagInput = {
  title?: string | null;
  description?: string | null;
  categoryName?: string | null;
  optionSchema?: unknown;
  variants?: Array<{
    name?: string | null;
    value1?: string | null;
    value2?: string | null;
    value3?: string | null;
    value4?: string | null;
    value5?: string | null;
  }>;
};

export type ExtractedProductTag = {
  tag: string;
  tagNorm: string;
  weight: number;
  sources: string[];
  type?: string;
  categoryGroup?: string;
};

@Injectable()
export class TagExtractorService {
  extractProductTags(input: ExtractProductTagInput): ExtractedProductTag[] {
    const sourceTexts = [
      {
        source: 'category',
        text: input.categoryName ?? '',
        sourceBoost: 5,
      },
      {
        source: 'title',
        text: input.title ?? '',
        sourceBoost: 4,
      },
      {
        source: 'option',
        text: this.stringifyOptionSchema(input.optionSchema),
        sourceBoost: 3,
      },
      {
        source: 'variant',
        text: this.stringifyVariants(input.variants ?? []),
        sourceBoost: 2,
      },
      {
        source: 'description',
        text: input.description ?? '',
        sourceBoost: 1,
      },
    ];

    const resultMap = new Map<string, ExtractedProductTag>();

    for (const item of TAG_DICTIONARY) {
      const keywordNorm = this.normalizeText(item.keyword);

      if (!keywordNorm) continue;

      for (const sourceText of sourceTexts) {
        const textNorm = this.normalizeText(sourceText.text);

        if (!textNorm) continue;
        if (!this.containsKeyword(textNorm, keywordNorm)) continue;

        const tagNorm = this.normalizeTag(item.tag);
        const addedWeight = Number(item.weight ?? 1) + sourceText.sourceBoost;

        const existed = resultMap.get(tagNorm);

        if (!existed) {
          resultMap.set(tagNorm, {
            tag: item.tag,
            tagNorm,
            weight: addedWeight,
            sources: [sourceText.source],
            type: item.type,
            categoryGroup: item.categoryGroup,
          });
        } else {
          existed.weight += addedWeight;

          if (!existed.sources.includes(sourceText.source)) {
            existed.sources.push(sourceText.source);
          }
        }
      }
    }

    return Array.from(resultMap.values()).sort((a, b) => b.weight - a.weight);
  }

  normalizeText(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeTag(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim();
  }

  private containsKeyword(textNorm: string, keywordNorm: string): boolean {
    const escapedKeyword = keywordNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s)${escapedKeyword}(\\s|$)`, 'i');

    return regex.test(textNorm);
  }

  private stringifyOptionSchema(optionSchema: unknown): string {
    if (!optionSchema) return '';

    if (typeof optionSchema === 'string') {
      return optionSchema;
    }

    try {
      return JSON.stringify(optionSchema);
    } catch {
      return '';
    }
  }

  private stringifyVariants(
    variants: Array<{
      name?: string | null;
      value1?: string | null;
      value2?: string | null;
      value3?: string | null;
      value4?: string | null;
      value5?: string | null;
    }>,
  ): string {
    return variants
      .flatMap((variant) => [
        variant.name,
        variant.value1,
        variant.value2,
        variant.value3,
        variant.value4,
        variant.value5,
      ])
      .filter(Boolean)
      .join(' ');
  }
}