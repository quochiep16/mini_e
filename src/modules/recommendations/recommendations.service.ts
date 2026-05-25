import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tagExtractorService: TagExtractorService,
  ) {}

  /**
   * Chạy mỗi 30 phút.
   */
  @Cron('0 */30 * * * *')
  async recalculateProductTrendingCron() {
    try {
      const result = await this.recalculateProductTrending();

      this.logger.log(
        `Đã tính lại product_trending: ${result.data.totalTrendingProducts} sản phẩm`,
      );
    } catch (error) {
      this.logger.error('Lỗi khi tính lại product_trending', error);
    }
  }

  /**
   * Tính lại bảng product_trending từ product_interactions trong 7 ngày gần nhất.
   *
   * Logic:
   * - Top 20 sản phẩm: trending_bonus = 2
   * - Rank 21 - 70: trending_bonus = 1
   * - Còn lại không được insert vào product_trending
   *
   * Lưu ý:
   * - Không cộng dồn score_7d.
   * - Mỗi lần chạy là xóa bảng product_trending rồi tính lại từ log.
   */
  async recalculateProductTrending() {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`DELETE FROM product_trending`);

      await manager.query(`
        INSERT INTO product_trending
          (
            product_id,
            score_7d,
            click_count_7d,
            view_count_7d,
            add_to_cart_count_7d,
            favorite_count_7d,
            purchase_count_7d,
            trending_rank,
            trending_bonus,
            is_trending,
            last_interacted_at,
            last_calculated_at,
            created_at,
            updated_at
          )
        SELECT
          ranked.product_id,
          ranked.score_7d,
          ranked.click_count_7d,
          ranked.view_count_7d,
          ranked.add_to_cart_count_7d,
          ranked.favorite_count_7d,
          ranked.purchase_count_7d,
          ranked.trending_rank,

          CASE
            WHEN ranked.trending_rank <= 20 THEN 2
            WHEN ranked.trending_rank <= 70 THEN 1
            ELSE 0
          END AS trending_bonus,

          CASE
            WHEN ranked.trending_rank <= 70 THEN 1
            ELSE 0
          END AS is_trending,

          ranked.last_interacted_at,
          NOW(6),
          NOW(6),
          NOW(6)

        FROM (
          SELECT
            raw_scores.*,
            ROW_NUMBER() OVER (
              ORDER BY
                raw_scores.score_7d DESC,
                raw_scores.purchase_count_7d DESC,
                raw_scores.add_to_cart_count_7d DESC,
                raw_scores.favorite_count_7d DESC,
                raw_scores.view_count_7d DESC,
                raw_scores.last_interacted_at DESC
            ) AS trending_rank

          FROM (
            SELECT
              pi.product_id,

              GREATEST(COALESCE(SUM(pi.weight), 0), 0) AS score_7d,

              SUM(CASE WHEN pi.event_type = 'CLICK' THEN 1 ELSE 0 END) AS click_count_7d,
              SUM(CASE WHEN pi.event_type = 'VIEW_DETAIL' THEN 1 ELSE 0 END) AS view_count_7d,
              SUM(CASE WHEN pi.event_type = 'ADD_TO_CART' THEN 1 ELSE 0 END) AS add_to_cart_count_7d,
              SUM(CASE WHEN pi.event_type = 'FAVORITE' THEN 1 ELSE 0 END) AS favorite_count_7d,
              SUM(CASE WHEN pi.event_type = 'PURCHASE' THEN 1 ELSE 0 END) AS purchase_count_7d,

              MAX(pi.created_at) AS last_interacted_at

            FROM product_interactions pi
            INNER JOIN products p
              ON p.id = pi.product_id

            WHERE pi.created_at >= DATE_SUB(NOW(6), INTERVAL 7 DAY)
              AND p.deleted_at IS NULL
              AND p.stock > 0
              AND p.status = 'ACTIVE'

            GROUP BY pi.product_id

            HAVING score_7d > 0
          ) raw_scores
        ) ranked

        WHERE ranked.trending_rank <= 70
      `);
    });

    const rows = await this.dataSource.query(`
      SELECT COUNT(*) AS total
      FROM product_trending
    `);

    return {
      message: 'Đã tính lại bảng product_trending',
      data: {
        totalTrendingProducts: Number(rows?.[0]?.total ?? 0),
      },
    };
  }

  /**
   * ProductService sẽ gọi hàm này sau khi tạo/sửa sản phẩm hoặc biến thể.
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
   * Ghi nhận hành vi người dùng.
   *
   * Lưu ý:
   * - Hàm này KHÔNG cộng trực tiếp product_trending nữa.
   * - product_trending sẽ do cron job tính lại mỗi 30 phút từ product_interactions.
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
        trendingNote:
          'product_trending sẽ được cron job tính lại mỗi 30 phút',
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
   * Recommend mới:
   *
   * recommendationScore =
   *   categoryScore
   * + tagScore
   * + trendingBonus
   *
   * Không cộng score_7d trực tiếp để tránh sản phẩm trend trôi lên quá mạnh.
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
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_category_preferences
            WHERE user_id = ?
            LIMIT 1
          )
          OR EXISTS (
            SELECT 1
            FROM user_tag_preferences
            WHERE user_id = ?
            LIMIT 1
          )
          THEN 1
          ELSE 0
        END AS hasPreference
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

        COALESCE(ptg.trending_bonus, 0) AS trendingBonus,
        COALESCE(ptg.trending_rank, NULL) AS trendingRank,
        COALESCE(ptg.score_7d, 0) AS trendingScore7d,

        (
          COALESCE(rs.categoryScore, 0)
          + COALESCE(rs.tagScore, 0)
          + COALESCE(ptg.trending_bonus, 0)
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
        COALESCE(ptg.trending_rank, 999999) ASC,
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
        ? 'Gợi ý dựa trên category, tag và trending bonus cố định'
        : 'User chưa có dữ liệu sở thích, trả về sản phẩm phổ biến/trending',
      trendingRule: {
        top20Bonus: 2,
        rank21To70Bonus: 1,
        recalculatedEveryMinutes: 30,
      },
      items,
    };
  }

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