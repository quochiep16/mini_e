import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CATEGORY_SUGGESTION_RULES,
  PARENT_CATEGORY_SUGGESTION_RULES,
  CategorySuggestionRule,
} from '../dictionaries/category-suggestion.dictionary';

export type SuggestCategoryInput = {
  title?: string;
  description?: string;
  optionText?: string;
  optionSchema?: unknown;
  variantText?: string;
  variants?: unknown;
  limit?: number;
};

type CategoryRow = {
  id: number;
  name: string;
  parentId: number | null;
  parentName: string | null;
};

type SuggestionItem = {
  categoryId: number;
  parentId: number | null;
  parentName: string | null;
  categoryName: string;
  score: number;
  confidence: number;
  level: 'strong' | 'medium' | 'weak';
  matchedKeywords: string[];
  matchedStrongKeywords: string[];
};

type ParentFallbackItem = {
  parentId: number;
  parentName: string;
  score: number;
  confidence: number;
  matchedKeywords: string[];
  children: Array<{
    categoryId: number;
    categoryName: string;
  }>;
};

@Injectable()
export class CategorySuggestionService {
  constructor(private readonly dataSource: DataSource) {}

  async suggest(input: SuggestCategoryInput) {
    const limit = this.normalizeLimit(input.limit);
    const rawText = this.buildRawText(input);
    const textNorm = this.normalizeText(rawText);

    if (!textNorm) {
      return {
        success: true,
        inputText: rawText,
        normalizedText: textNorm,
        items: [],
        parentFallbacks: [],
        message: 'Chưa có đủ dữ liệu để gợi ý danh mục',
      };
    }

    const categories = await this.loadActiveCategories();

    const items = this.scoreChildCategories(textNorm, categories, limit);

    const parentFallbacks = this.scoreParentFallbacks(
      textNorm,
      categories,
      items,
    );

    return {
      success: true,
      inputText: rawText,
      normalizedText: textNorm,
      items,
      parentFallbacks,
      message: items.length
        ? 'Đã gợi ý danh mục phù hợp'
        : parentFallbacks.length
          ? 'Chưa đủ chắc để chọn danh mục con, hãy chọn cụ thể trong nhóm gợi ý'
          : 'Chưa tìm thấy danh mục phù hợp',
    };
  }

  private async loadActiveCategories(): Promise<CategoryRow[]> {
    const rows = await this.dataSource.query(`
      SELECT
        c.id AS id,
        c.name AS name,
        c.parent_id AS parent_id,
        p.name AS parent_name
      FROM categories c
      LEFT JOIN categories p
        ON p.id = c.parent_id
      WHERE c.deleted_at IS NULL
        AND c.is_active = 1
      ORDER BY
        COALESCE(p.sort_order, c.sort_order) ASC,
        c.sort_order ASC,
        c.id ASC
    `);

    return rows.map((row: any) => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      parentId:
        row.parent_id === null || row.parent_id === undefined
          ? null
          : Number(row.parent_id),
      parentName: row.parent_name ? String(row.parent_name) : null,
    }));
  }

  private scoreChildCategories(
    textNorm: string,
    categories: CategoryRow[],
    limit: number,
  ): SuggestionItem[] {
    const scored: SuggestionItem[] = [];
    const usedCategoryIds = new Set<number>();

    for (const rule of CATEGORY_SUGGESTION_RULES) {
      const category = this.findCategoryForRule(categories, rule);

      if (!category) continue;
      if (usedCategoryIds.has(category.id)) continue;

      const scoreResult = this.scoreRule(textNorm, rule);
      if (scoreResult.score <= 0) continue;

      usedCategoryIds.add(category.id);

      scored.push({
        categoryId: category.id,
        parentId: category.parentId,
        parentName: category.parentName,
        categoryName: category.name,
        score: scoreResult.score,
        confidence: this.scoreToConfidence(scoreResult.score),
        level: this.getLevel(scoreResult.score),
        matchedKeywords: scoreResult.matchedKeywords,
        matchedStrongKeywords: scoreResult.matchedStrongKeywords,
      });
    }

    return scored
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        if (b.matchedStrongKeywords.length !== a.matchedStrongKeywords.length) {
          return b.matchedStrongKeywords.length - a.matchedStrongKeywords.length;
        }

        return b.matchedKeywords.length - a.matchedKeywords.length;
      })
      .slice(0, limit);
  }

  private findCategoryForRule(
    categories: CategoryRow[],
    rule: CategorySuggestionRule,
  ): CategoryRow | null {
    const ruleCategoryNorm = this.normalizeText(rule.categoryName);
    const ruleParentNorm = this.normalizeText(rule.parentName);

    const childrenByName = categories.filter((category) => {
      if (!category.parentId) return false;

      return this.normalizeText(category.name) === ruleCategoryNorm;
    });

    if (!childrenByName.length) {
      return null;
    }

    const exactParent = childrenByName.find((category) => {
      return this.normalizeText(category.parentName) === ruleParentNorm;
    });

    if (exactParent) {
      return exactParent;
    }

    // Fallback: nếu tên category con đúng nhưng tên cha trong DB lệch nhẹ,
    // vẫn cho match theo category con để tránh items rỗng.
    return childrenByName[0];
  }

  private scoreParentFallbacks(
    textNorm: string,
    categories: CategoryRow[],
    childItems: SuggestionItem[],
  ): ParentFallbackItem[] {
    if (childItems.some((item) => item.score >= 12)) {
      return [];
    }

    const parentRows = categories.filter((item) => !item.parentId);
    const childRows = categories.filter((item) => item.parentId);

    const parentFallbacks: ParentFallbackItem[] = [];

    for (const rule of PARENT_CATEGORY_SUGGESTION_RULES) {
      const parent = this.findParentCategory(parentRows, rule.parentName);

      if (!parent) continue;

      const matchedKeywords = rule.keywords.filter((keyword) =>
        this.containsPhrase(textNorm, this.normalizeText(keyword)),
      );

      const parentNameNorm = this.normalizeText(rule.parentName);
      const score =
        matchedKeywords.length * 2 +
        (this.containsPhrase(textNorm, parentNameNorm) ? 6 : 0);

      if (score <= 0) continue;

      const children = childRows
        .filter((item) => item.parentId === parent.id)
        .map((item) => ({
          categoryId: item.id,
          categoryName: item.name,
        }));

      if (!children.length) continue;

      parentFallbacks.push({
        parentId: parent.id,
        parentName: parent.name,
        score,
        confidence: this.scoreToConfidence(score),
        matchedKeywords,
        children,
      });
    }

    return parentFallbacks
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  private findParentCategory(
    parentRows: CategoryRow[],
    parentName: string,
  ): CategoryRow | null {
    const parentNorm = this.normalizeText(parentName);

    const exact = parentRows.find(
      (item) => this.normalizeText(item.name) === parentNorm,
    );

    if (exact) return exact;

    return null;
  }

  private scoreRule(textNorm: string, rule: CategorySuggestionRule) {
    let score = 0;
    const matchedKeywords: string[] = [];
    const matchedStrongKeywords: string[] = [];

    const parentNorm = this.normalizeText(rule.parentName);
    const categoryNorm = this.normalizeText(rule.categoryName);

    if (this.containsPhrase(textNorm, categoryNorm)) {
      score += 12;
      matchedStrongKeywords.push(rule.categoryName);
    }

    if (this.containsPhrase(textNorm, parentNorm)) {
      score += 2;
      matchedKeywords.push(rule.parentName);
    }

    for (const keyword of rule.strongKeywords ?? []) {
      const keywordNorm = this.normalizeText(keyword);
      if (!keywordNorm) continue;

      if (this.containsPhrase(textNorm, keywordNorm)) {
        score += 8;
        matchedStrongKeywords.push(keyword);
      }
    }

    for (const keyword of rule.keywords ?? []) {
      const keywordNorm = this.normalizeText(keyword);
      if (!keywordNorm) continue;

      if (this.containsPhrase(textNorm, keywordNorm)) {
        score += 3;
        matchedKeywords.push(keyword);
      }
    }

    for (const keyword of rule.negativeKeywords ?? []) {
      const keywordNorm = this.normalizeText(keyword);
      if (!keywordNorm) continue;

      if (this.containsPhrase(textNorm, keywordNorm)) {
        score -= 10;
      }
    }

    return {
      score: Math.max(0, score),
      matchedKeywords: this.unique(matchedKeywords),
      matchedStrongKeywords: this.unique(matchedStrongKeywords),
    };
  }

  private buildRawText(input: SuggestCategoryInput): string {
    return [input.title]
        .filter(Boolean)
        .join(' ');
    }

  private stringifyUnknown(value: unknown): string {
    if (!value) return '';

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.stringifyUnknown(item)).join(' ');
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }

    return String(value);
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s&+./-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private containsPhrase(textNorm: string, keywordNorm: string): boolean {
    if (!textNorm || !keywordNorm) return false;

    const escaped = keywordNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (/[^a-z0-9\s]/.test(keywordNorm)) {
      return textNorm.includes(keywordNorm);
    }

    const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
    return regex.test(textNorm);
  }

  private scoreToConfidence(score: number): number {
    return Math.max(1, Math.min(99, Math.round((score / 24) * 100)));
  }

  private getLevel(score: number): 'strong' | 'medium' | 'weak' {
    if (score >= 12) return 'strong';
    if (score >= 6) return 'medium';
    return 'weak';
  }

  private normalizeLimit(limit: unknown): number {
    const value = Number(limit ?? 5);

    if (!Number.isFinite(value)) return 5;

    return Math.max(1, Math.min(10, Math.floor(value)));
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values));
  }
}