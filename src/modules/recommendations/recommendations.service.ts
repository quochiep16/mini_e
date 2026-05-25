import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { CreateInteractionDto } from './dto/create-interaction.dto';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { InteractionEvent } from './enums/interaction-event.enum';
import { TagExtractorService } from './services/tag-extractor.service';

const EVENT_WEIGHTS: Record<InteractionEvent, number> = {
  [InteractionEvent.CLICK]: 1,
  [InteractionEvent.VIEW_DETAIL]: 2,
  [InteractionEvent.ADD_TO_CART]: 5,
  [InteractionEvent.FAVORITE]: 7,
  [InteractionEvent.UNFAVORITE]: -3,
  [InteractionEvent.PURCHASE]: 10,
};

const TRENDING_THRESHOLD = 20;

type SyncProductTagInput = {
  id: number;
  title?: string | null;
  description?: string | null;
  optionSchema?: unknown;
  category?: {
    id?: number;
    name?: string | null;
  } | null;
  variants?: Array<{
    id?: number;
    name?: string | null;
    value1?: string | null;
    value2?: string | null;
    value3?: string | null;
    value4?: string | null;
    value5?: string | null;
  }>;
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tagExtractorService: TagExtractorService,
  ) {}

  /**
   * ProductService sẽ gọi hàm này sau khi tạo/sửa sản phẩm hoặc biến thể.
   * Nhiệm vụ:
   * - Tách tag từ title, description, category, optionSchema, variants.
   * - Xóa tag cũ của product.
   * - Lưu tag mới vào product_tags.
   */
  async syncProductTags(product: SyncProductTagInput) {
    if (!product?.id) {
      return {
        message: 'Không có product id để đồng bộ tag',
        data: {
          productId: null,
          totalTags: 0,
        },
      };
    }

    const tags = this.tagExtractorService.extractProductTags({
      title: product.title,
      description: product.description,
      categoryName: product.category?.name,
      optionSchema: product.optionSchema,
      variants: product.variants ?? [],
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        DELETE FROM product_tags
        WHERE product_id = ?
        `,
        [product.id],
      );

      if (!tags.length) return;

      const valuesSql = tags
        .map(() => `(?, ?, ?, ?, ?, NOW(6), NOW(6))`)
        .join(', ');

      const params = tags.flatMap((item) => [
        product.id,
        item.tag,
        item.tagNorm,
        item.weight,
        JSON.stringify(item.sources ?? []),
      ]);

      await manager.query(
        `
        INSERT INTO product_tags
          (product_id, tag, tag_norm, weight, sources, created_at, updated_at)
        VALUES
          ${valuesSql}
        `,
        params,
      );
    });

    return {
      message: 'Đã đồng bộ tag cho sản phẩm',
      data: {
        productId: product.id,
        totalTags: tags.length,
        tags,
      },
    };
  }

  /**
   * Lấy thông tin sản phẩm bằng SQL trực tiếp để tránh lệch tên field trong ProductEntity.
   */
  private async findProductForInteraction(productId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT
        id,
        shop_id AS shopId,
        category_id AS categoryId,
        title,
        status,
        stock,
        deleted_at AS deletedAt
      FROM products
      WHERE id = ?
      LIMIT 1
      `,
      [productId],
    );

    return rows[0] ?? null;
  }

  private getWeight(eventType: InteractionEvent): number {
    return EVENT_WEIGHTS[eventType] ?? 1;
  }

  /**
   * Ghi nhận hành vi người dùng:
   * - Lưu product_interactions
   * - Cộng user_category_preferences
   * - Cộng user_tag_preferences
   * - Cập nhật product_trending
   */
  async recordEvent(userId: number, dto: CreateInteractionDto) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const product = await this.findProductForInteraction(dto.productId);

    if (!product || product.deletedAt) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    const weight = this.getWeight(dto.eventType);
    const categoryId = product.categoryId ?? null;
    const shopId = product.shopId ?? null;

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        INSERT INTO product_interactions
          (user_id, product_id, category_id, shop_id, event_type, weight, metadata)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          dto.productId,
          categoryId,
          shopId,
          dto.eventType,
          weight,
          dto.metadata ? JSON.stringify(dto.metadata) : null,
        ],
      );

      if (categoryId) {
        await this.increaseUserCategoryPreference(
          manager,
          userId,
          categoryId,
          weight,
        );
      }

      await this.increaseUserTagPreferences(
        manager,
        userId,
        dto.productId,
        weight,
      );

      await this.updateProductTrending(
        manager,
        dto.productId,
        dto.eventType,
        weight,
      );
    });

    return {
      message: 'Đã ghi nhận hành vi người dùng',
      data: {
        userId,
        productId: dto.productId,
        categoryId,
        shopId,
        eventType: dto.eventType,
        weight,
      },
    };
  }

  private async increaseUserCategoryPreference(
    manager: EntityManager,
    userId: number,
    categoryId: number,
    weight: number,
  ) {
    await manager.query(
      `
      INSERT INTO user_category_preferences
        (user_id, category_id, score, last_interacted_at, created_at, updated_at)
      VALUES
        (?, ?, ?, NOW(6), NOW(6), NOW(6))
      ON DUPLICATE KEY UPDATE
        score = GREATEST(score + VALUES(score), 0),
        last_interacted_at = NOW(6),
        updated_at = NOW(6)
      `,
      [userId, categoryId, weight],
    );
  }

  private async increaseUserTagPreferences(
    manager: EntityManager,
    userId: number,
    productId: number,
    eventWeight: number,
  ) {
    const productTags = await manager.query(
      `
      SELECT
        tag_norm AS tagNorm,
        weight
      FROM product_tags
      WHERE product_id = ?
      `,
      [productId],
    );

    if (!productTags.length) return;

    const valuesSql = productTags
      .map(() => `(?, ?, ?, NOW(6), NOW(6), NOW(6))`)
      .join(', ');

    const params = productTags.flatMap((item: any) => {
      const tagWeight = Number(item.weight ?? 1);
      const scoreDelta = eventWeight * tagWeight;

      return [userId, item.tagNorm, scoreDelta];
    });

    await manager.query(
      `
      INSERT INTO user_tag_preferences
        (user_id, tag_norm, score, last_interacted_at, created_at, updated_at)
      VALUES
        ${valuesSql}
      ON DUPLICATE KEY UPDATE
        score = GREATEST(score + VALUES(score), 0),
        last_interacted_at = NOW(6),
        updated_at = NOW(6)
      `,
      params,
    );
  }

  private async updateProductTrending(
    manager: EntityManager,
    productId: number,
    eventType: InteractionEvent,
    weight: number,
  ) {
    if (eventType === InteractionEvent.UNFAVORITE) {
      await manager.query(
        `
        UPDATE product_trending
        SET
          score_24h = GREATEST(score_24h + ?, 0),
          score_7d = GREATEST(score_7d + ?, 0),
          score_30d = GREATEST(score_30d + ?, 0),
          favorite_count_7d = GREATEST(favorite_count_7d - 1, 0),
          is_trending = IF(GREATEST(score_7d + ?, 0) >= ?, 1, 0),
          last_interacted_at = NOW(6),
          updated_at = NOW(6)
        WHERE product_id = ?
        `,
        [weight, weight, weight, weight, TRENDING_THRESHOLD, productId],
      );

      return;
    }

    const clickCount = eventType === InteractionEvent.CLICK ? 1 : 0;
    const viewCount = eventType === InteractionEvent.VIEW_DETAIL ? 1 : 0;
    const addToCartCount = eventType === InteractionEvent.ADD_TO_CART ? 1 : 0;
    const favoriteCount = eventType === InteractionEvent.FAVORITE ? 1 : 0;
    const purchaseCount = eventType === InteractionEvent.PURCHASE ? 1 : 0;

    await manager.query(
      `
      INSERT INTO product_trending
        (
          product_id,
          score_24h,
          score_7d,
          score_30d,
          click_count_7d,
          view_count_7d,
          add_to_cart_count_7d,
          favorite_count_7d,
          purchase_count_7d,
          is_trending,
          last_interacted_at,
          last_calculated_at,
          created_at,
          updated_at
        )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? >= ?, 1, 0), NOW(6), NOW(6), NOW(6), NOW(6))
      ON DUPLICATE KEY UPDATE
        score_24h = GREATEST(score_24h + VALUES(score_24h), 0),
        score_7d = GREATEST(score_7d + VALUES(score_7d), 0),
        score_30d = GREATEST(score_30d + VALUES(score_30d), 0),

        click_count_7d = GREATEST(click_count_7d + VALUES(click_count_7d), 0),
        view_count_7d = GREATEST(view_count_7d + VALUES(view_count_7d), 0),
        add_to_cart_count_7d = GREATEST(add_to_cart_count_7d + VALUES(add_to_cart_count_7d), 0),
        favorite_count_7d = GREATEST(favorite_count_7d + VALUES(favorite_count_7d), 0),
        purchase_count_7d = GREATEST(purchase_count_7d + VALUES(purchase_count_7d), 0),

        is_trending = IF(GREATEST(score_7d + VALUES(score_7d), 0) >= ?, 1, 0),
        last_interacted_at = NOW(6),
        last_calculated_at = NOW(6),
        updated_at = NOW(6)
      `,
      [
        productId,
        weight,
        weight,
        weight,
        clickCount,
        viewCount,
        addToCartCount,
        favoriteCount,
        purchaseCount,
        weight,
        TRENDING_THRESHOLD,
        TRENDING_THRESHOLD,
      ],
    );
  }

  /**
   * Thêm sản phẩm vào danh sách yêu thích.
   */
  async addFavorite(userId: number, productId: number) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const product = await this.findProductForInteraction(productId);

    if (!product || product.deletedAt) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    const existed = await this.dataSource.query(
      `
      SELECT id
      FROM product_favorites
      WHERE user_id = ? AND product_id = ?
      LIMIT 1
      `,
      [userId, productId],
    );

    if (existed.length > 0) {
      return {
        message: 'Sản phẩm đã có trong danh sách yêu thích',
        data: {
          productId,
          isFavorite: true,
        },
      };
    }

    await this.dataSource.query(
      `
      INSERT INTO product_favorites
        (user_id, product_id)
      VALUES
        (?, ?)
      `,
      [userId, productId],
    );

    await this.recordEvent(userId, {
      productId,
      eventType: InteractionEvent.FAVORITE,
      metadata: {
        source: 'favorite_button',
      },
    });

    return {
      message: 'Đã thêm sản phẩm vào danh sách yêu thích',
      data: {
        productId,
        isFavorite: true,
      },
    };
  }

  /**
   * Bỏ sản phẩm khỏi danh sách yêu thích.
   */
  async removeFavorite(userId: number, productId: number) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const existed = await this.dataSource.query(
      `
      SELECT id
      FROM product_favorites
      WHERE user_id = ? AND product_id = ?
      LIMIT 1
      `,
      [userId, productId],
    );

    if (existed.length === 0) {
      return {
        message: 'Sản phẩm chưa có trong danh sách yêu thích',
        data: {
          productId,
          isFavorite: false,
        },
      };
    }

    await this.dataSource.query(
      `
      DELETE FROM product_favorites
      WHERE user_id = ? AND product_id = ?
      `,
      [userId, productId],
    );

    const product = await this.findProductForInteraction(productId);

    if (product && !product.deletedAt) {
      await this.recordEvent(userId, {
        productId,
        eventType: InteractionEvent.UNFAVORITE,
        metadata: {
          source: 'favorite_button',
        },
      });
    }

    return {
      message: 'Đã bỏ sản phẩm khỏi danh sách yêu thích',
      data: {
        productId,
        isFavorite: false,
      },
    };
  }

  /**
   * Lấy danh sách sản phẩm user đã yêu thích.
   */
  async getFavorites(userId: number, query: RecommendationQueryDto) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const offset = (page - 1) * limit;

    const items = await this.dataSource.query(
      `
      SELECT
        p.id,
        p.shop_id AS shopId,
        p.category_id AS categoryId,
        p.title,
        p.slug,
        p.description,
        p.price,
        p.compare_at_price AS compareAtPrice,
        p.currency,
        p.stock,
        p.sold,
        p.status,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,

        s.name AS shopName,
        c.name AS categoryName,

        (
          SELECT pi.url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.is_main DESC, pi.position ASC, pi.id ASC
          LIMIT 1
        ) AS imageUrl,

        1 AS isFavorite,
        f.created_at AS favoritedAt

      FROM product_favorites f
      INNER JOIN products p
        ON p.id = f.product_id
      LEFT JOIN shops s
        ON s.id = p.shop_id
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE f.user_id = ?
        AND p.deleted_at IS NULL
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [userId, limit, offset],
    );

    return {
      page,
      limit,
      items,
    };
  }

  /**
   * Lấy sản phẩm gợi ý cho user.
   *
   * Công thức mới:
   * - category match: +3 và cộng nhẹ theo score category
   * - tag match: user_tag_preferences.score * product_tags.weight
   * - trending true: +2
   * - product_trending.score_7d: cộng nhẹ
   */
  async getRecommendedProducts(userId: number, query: RecommendationQueryDto) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const offset = (page - 1) * limit;

    const preferenceRows = await this.dataSource.query(
      `
      SELECT
        (
          EXISTS (
            SELECT 1
            FROM user_category_preferences
            WHERE user_id = ?
            LIMIT 1
          )
          OR
          EXISTS (
            SELECT 1
            FROM user_tag_preferences
            WHERE user_id = ?
            LIMIT 1
          )
        ) AS hasPreference
      `,
      [userId, userId],
    );

    const hasPreference = Number(preferenceRows?.[0]?.hasPreference ?? 0) === 1;

    const items = await this.dataSource.query(
      `
      SELECT
        p.id,
        p.shop_id AS shopId,
        p.category_id AS categoryId,
        p.title,
        p.slug,
        p.description,
        p.price,
        p.compare_at_price AS compareAtPrice,
        p.currency,
        p.stock,
        p.sold,
        p.status,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,

        s.name AS shopName,
        c.name AS categoryName,

        (
          SELECT pi.url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.is_main DESC, pi.position ASC, pi.id ASC
          LIMIT 1
        ) AS imageUrl,

        CASE
          WHEN pf.id IS NULL THEN 0
          ELSE 1
        END AS isFavorite,

        COALESCE(rs.categoryScore, 0) AS categoryScore,
        COALESCE(rs.tagScore, 0) AS tagScore,

        CASE
          WHEN ptg.is_trending = 1 THEN 2
          ELSE 0
        END AS trendingBonus,

        COALESCE(ptg.score_7d, 0) AS trendingScore,

        (
          COALESCE(rs.categoryScore, 0)
          + COALESCE(rs.tagScore, 0)
          + CASE WHEN ptg.is_trending = 1 THEN 2 ELSE 0 END
          + COALESCE(ptg.score_7d, 0) * 0.05
        ) AS recommendationScore

      FROM products p

      LEFT JOIN (
        SELECT
          p2.id AS productId,

          MAX(
            CASE
              WHEN ucp.id IS NULL THEN 0
              ELSE 3 + LEAST(ucp.score, 50) * 0.1
            END
          ) AS categoryScore,

          LEAST(
            COALESCE(
              SUM(
                CASE
                  WHEN utp.id IS NULL THEN 0
                  ELSE LEAST(utp.score, 100) * LEAST(product_tags.weight, 10)
                END
              ),
              0
            ) * 0.02,
            80
          ) AS tagScore

        FROM products p2

        LEFT JOIN user_category_preferences ucp
          ON ucp.user_id = ?
          AND ucp.category_id = p2.category_id

        LEFT JOIN product_tags
          ON product_tags.product_id = p2.id

        LEFT JOIN user_tag_preferences utp
          ON utp.user_id = ?
          AND utp.tag_norm = product_tags.tag_norm

        WHERE p2.deleted_at IS NULL
          AND p2.stock > 0
          AND p2.status = 'ACTIVE'

        GROUP BY p2.id
      ) rs
        ON rs.productId = p.id

      LEFT JOIN product_trending ptg
        ON ptg.product_id = p.id

      LEFT JOIN shops s
        ON s.id = p.shop_id

      LEFT JOIN categories c
        ON c.id = p.category_id

      LEFT JOIN product_favorites pf
        ON pf.product_id = p.id
        AND pf.user_id = ?

      WHERE p.deleted_at IS NULL
        AND p.stock > 0
        AND p.status = 'ACTIVE'

      ORDER BY
        recommendationScore DESC,
        COALESCE(ptg.score_7d, 0) DESC,
        p.sold DESC,
        p.created_at DESC

      LIMIT ? OFFSET ?
      `,
      [userId, userId, userId, limit, offset],
    );

    return {
      page,
      limit,
      source: hasPreference ? 'personalized' : 'fallback',
      message: hasPreference
        ? 'Gợi ý dựa trên category, tag, trending và hành vi người dùng'
        : 'User chưa có dữ liệu sở thích, trả về sản phẩm phổ biến',
      items,
    };
  }

  /**
   * API test preference.
   * Giữ nguyên tên hàm để controller hiện tại không cần sửa.
   */
  async getMyCategoryPreferences(userId: number) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const categoryPreferences = await this.dataSource.query(
      `
      SELECT
        ucp.id,
        ucp.user_id AS userId,
        ucp.category_id AS categoryId,
        c.name AS categoryName,
        c.slug AS categorySlug,
        c.image_url AS categoryImageUrl,
        ucp.score,
        ucp.last_interacted_at AS lastInteractedAt,
        ucp.created_at AS createdAt,
        ucp.updated_at AS updatedAt
      FROM user_category_preferences ucp
      INNER JOIN categories c
        ON c.id = ucp.category_id
      WHERE ucp.user_id = ?
      ORDER BY ucp.score DESC, ucp.last_interacted_at DESC
      `,
      [userId],
    );

    const tagPreferences = await this.dataSource.query(
      `
      SELECT
        id,
        user_id AS userId,
        tag_norm AS tagNorm,
        score,
        last_interacted_at AS lastInteractedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM user_tag_preferences
      WHERE user_id = ?
      ORDER BY score DESC, last_interacted_at DESC
      LIMIT 100
      `,
      [userId],
    );

    return {
      items: categoryPreferences,
      categoryPreferences,
      tagPreferences,
    };
  }
}