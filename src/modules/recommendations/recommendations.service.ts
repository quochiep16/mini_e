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
  [InteractionEvent.CLICK]: 0,
  [InteractionEvent.VIEW_DETAIL]: 2,
  [InteractionEvent.ADD_TO_CART]: 3,
  [InteractionEvent.FAVORITE]: 4,
  [InteractionEvent.UNFAVORITE]: -3,
  [InteractionEvent.PURCHASE]: 4,
};

const PRODUCT_SCORE_MAX = 40;
const CATEGORY_SCORE_MAX = 8;
const TAG_SCORE_MAX = 80;
const TAG_SCORE_LOG_MULTIPLIER = 15;

const TRENDING_TOP_BONUS = 2;
const TRENDING_NORMAL_BONUS = 1;

// Sau mỗi 10 ngày không tương tác thì effective score còn 95%.
const DECAY_BASE = 0.95;
const DECAY_DAYS = 10;

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
            WHEN ranked.trending_rank <= 20 THEN ${TRENDING_TOP_BONUS}
            WHEN ranked.trending_rank <= 70 THEN ${TRENDING_NORMAL_BONUS}
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
    return EVENT_WEIGHTS[eventType] ?? 0;
  }

  private async getCategoryAndDescendantIds(
    categoryId: number,
  ): Promise<number[]> {
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return [];
    }

    const rootRows = await this.dataSource.query(
      `
      SELECT id
      FROM categories
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [categoryId],
    );

    if (!rootRows.length) {
      return [];
    }

    const ids = new Set<number>([categoryId]);
    let currentLevel = [categoryId];

    while (currentLevel.length > 0) {
      const children = await this.dataSource.query(
        `
        SELECT id
        FROM categories
        WHERE parent_id IN (?)
          AND deleted_at IS NULL
        `,
        [currentLevel],
      );

      const nextLevel = children
        .map((item: any) => Number(item.id))
        .filter((id: number) => Number.isInteger(id) && id > 0 && !ids.has(id));

      for (const id of nextLevel) {
        ids.add(id);
      }

      currentLevel = nextLevel;
    }

    return Array.from(ids);
  }

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

      if (weight !== 0 && categoryId) {
        await this.increaseUserCategoryPreference(
          manager,
          userId,
          categoryId,
          weight,
        );
      }

      if (weight !== 0) {
        await this.increaseUserTagPreferences(
          manager,
          userId,
          dto.productId,
          weight,
        );

        await this.increaseUserProductPreference(
          manager,
          userId,
          dto.productId,
          weight,
        );
      }
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
        note:
          'CLICK hiện có weight = 0. FE nên gửi VIEW_DETAIL khi trang chi tiết load thành công.',
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
        pt.tag_norm AS tagNorm,
        pt.weight AS productTagWeight,
        COALESCE(tpc.productCount, 1) AS productCount,
        1 / LOG10(COALESCE(tpc.productCount, 1) + 10) AS rarityFactor
      FROM product_tags pt
      LEFT JOIN (
        SELECT
          tag_norm,
          COUNT(DISTINCT product_id) AS productCount
        FROM product_tags
        GROUP BY tag_norm
      ) tpc
        ON tpc.tag_norm = pt.tag_norm
      WHERE pt.product_id = ?
      `,
      [productId],
    );

    if (!productTags.length) return;

    const values: Array<[number, string, number]> = [];

    for (const item of productTags) {
      const productTagWeight = Number(item.productTagWeight ?? 1);
      const rarityFactor = Number(item.rarityFactor ?? 1);
      const scoreDelta = Number(
        (eventWeight * productTagWeight * rarityFactor).toFixed(2),
      );

      if (scoreDelta === 0) continue;

      values.push([userId, item.tagNorm, scoreDelta]);
    }

    if (!values.length) return;

    const valuesSql = values
      .map(() => `(?, ?, ?, NOW(6), NOW(6), NOW(6))`)
      .join(', ');

    const params = values.flatMap((item) => item);

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

  private async increaseUserProductPreference(
    manager: EntityManager,
    userId: number,
    productId: number,
    weight: number,
  ) {
    await manager.query(
      `
      INSERT INTO user_product_preferences
        (user_id, product_id, score, last_interacted_at, created_at, updated_at)
      VALUES
        (?, ?, ?, NOW(6), NOW(6), NOW(6))
      ON DUPLICATE KEY UPDATE
        score = GREATEST(score + VALUES(score), 0),
        last_interacted_at = NOW(6),
        updated_at = NOW(6)
      `,
      [userId, productId, weight],
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


  async getTrendingProducts(
    userId: number | null,
    query: RecommendationQueryDto,
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Number(query.limit ?? 20));
    const offset = (page - 1) * limit;

    const safeUserId = userId ?? 0;

    const categoryId = query.categoryId ? Number(query.categoryId) : null;
    const categoryIds = categoryId
      ? await this.getCategoryAndDescendantIds(categoryId)
      : [];

    if (categoryId && categoryIds.length === 0) {
      return {
        page,
        limit,
        total: 0,
        pageCount: 1,
        source: 'category_not_found',
        message: 'Không tìm thấy category',
        categoryId,
        categoryIds: [],
        items: [],
      };
    }

    const categoryFilterSql = categoryIds.length
      ? 'AND p.category_id IN (?)'
      : '';

    const totalRows = await this.dataSource.query(
      `
      SELECT COUNT(*) AS total
      FROM product_trending ptg
      INNER JOIN products p
        ON p.id = ptg.product_id
      WHERE ptg.is_trending = 1
        AND p.deleted_at IS NULL
        AND p.stock > 0
        AND p.status = 'ACTIVE'
        ${categoryFilterSql}
      `,
      [...(categoryIds.length ? [categoryIds] : [])],
    );

    const total = Number(totalRows?.[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / limit));

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
          WHEN ? > 0 AND pf.id IS NOT NULL THEN 1
          ELSE 0
        END AS isFavorite,

        ptg.trending_bonus AS trendingBonus,
        ptg.trending_rank AS trendingRank,
        ptg.score_7d AS trendingScore7d,
        ptg.click_count_7d AS clickCount7d,
        ptg.view_count_7d AS viewCount7d,
        ptg.add_to_cart_count_7d AS addToCartCount7d,
        ptg.favorite_count_7d AS favoriteCount7d,
        ptg.purchase_count_7d AS purchaseCount7d,
        ptg.last_interacted_at AS lastInteractedAt

      FROM product_trending ptg
      INNER JOIN products p
        ON p.id = ptg.product_id

      LEFT JOIN shops s
        ON s.id = p.shop_id

      LEFT JOIN categories c
        ON c.id = p.category_id

      LEFT JOIN product_favorites pf
        ON pf.product_id = p.id
        AND pf.user_id = ?

      WHERE ptg.is_trending = 1
        AND p.deleted_at IS NULL
        AND p.stock > 0
        AND p.status = 'ACTIVE'
        ${categoryFilterSql}

      ORDER BY
        ptg.trending_rank ASC,
        ptg.score_7d DESC,
        p.sold DESC,
        p.created_at DESC

      LIMIT ? OFFSET ?
      `,
      [
        safeUserId,
        safeUserId,
        ...(categoryIds.length ? [categoryIds] : []),
        limit,
        offset,
      ],
    );

    return {
      page,
      limit,
      total,
      pageCount,
      source: 'trending',
      message: 'Danh sách sản phẩm đang trend trong 7 ngày gần nhất',
      categoryId,
      categoryIds,
      items,
    };
  }

  async getRecommendedProducts(userId: number, query: RecommendationQueryDto) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const offset = (page - 1) * limit;

    const categoryId = query.categoryId ? Number(query.categoryId) : null;
    const categoryIds = categoryId
      ? await this.getCategoryAndDescendantIds(categoryId)
      : [];

    if (categoryId && categoryIds.length === 0) {
      return {
        page,
        limit,
        total: 0,
        pageCount: 1,
        source: 'category_not_found',
        message: 'Không tìm thấy category',
        categoryId,
        categoryIds: [],
        items: [],
      };
    }

    const categoryFilterSql = categoryIds.length
      ? 'AND p.category_id IN (?)'
      : '';

    const totalRows = await this.dataSource.query(
      `
      SELECT COUNT(*) AS total
      FROM products p
      WHERE p.deleted_at IS NULL
        AND p.stock > 0
        AND p.status = 'ACTIVE'
        ${categoryFilterSql}
      `,
      [...(categoryIds.length ? [categoryIds] : [])],
    );

    const total = Number(totalRows?.[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / limit));

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
          OR EXISTS (
            SELECT 1
            FROM user_product_preferences
            WHERE user_id = ?
            LIMIT 1
          )
          THEN 1
          ELSE 0
        END AS hasPreference
      `,
      [userId, userId, userId],
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

        LEAST(
          COALESCE(upp.score, 0)
          *
          POW(
            ${DECAY_BASE},
            GREATEST(
              TIMESTAMPDIFF(
                DAY,
                COALESCE(upp.last_interacted_at, upp.updated_at, NOW(6)),
                NOW(6)
              ),
              0
            ) / ${DECAY_DAYS}
          ),
          ${PRODUCT_SCORE_MAX}
        ) AS productScore,

        COALESCE(rs.categoryScore, 0) AS categoryScore,
        COALESCE(rs.tagScore, 0) AS tagScore,

        COALESCE(ptg.trending_bonus, 0) AS trendingBonus,
        ptg.trending_rank AS trendingRank,
        COALESCE(ptg.score_7d, 0) AS trendingScore7d,

        (
          LEAST(
            COALESCE(upp.score, 0)
            *
            POW(
              ${DECAY_BASE},
              GREATEST(
                TIMESTAMPDIFF(
                  DAY,
                  COALESCE(upp.last_interacted_at, upp.updated_at, NOW(6)),
                  NOW(6)
                ),
                0
              ) / ${DECAY_DAYS}
            ),
            ${PRODUCT_SCORE_MAX}
          )
          + COALESCE(rs.categoryScore, 0)
          + COALESCE(rs.tagScore, 0)
          + COALESCE(ptg.trending_bonus, 0)
        ) AS recommendationScore

      FROM products p

      LEFT JOIN user_product_preferences upp
        ON upp.user_id = ?
        AND upp.product_id = p.id

      LEFT JOIN (
        SELECT
          base.productId,
          base.categoryScore,
          base.rawTagScore,
          LEAST(
            LOG10(base.rawTagScore + 1) * ${TAG_SCORE_LOG_MULTIPLIER},
            ${TAG_SCORE_MAX}
          ) AS tagScore

        FROM (
          SELECT
            p2.id AS productId,

            MAX(
              CASE
                WHEN ucp.id IS NULL THEN 0
                ELSE LEAST(
                  3 + LEAST(
                    COALESCE(ucp.score, 0)
                    *
                    POW(
                      ${DECAY_BASE},
                      GREATEST(
                        TIMESTAMPDIFF(
                          DAY,
                          COALESCE(ucp.last_interacted_at, ucp.updated_at, NOW(6)),
                          NOW(6)
                        ),
                        0
                      ) / ${DECAY_DAYS}
                    ),
                    50
                  ) * 0.1,
                  ${CATEGORY_SCORE_MAX}
                )
              END
            ) AS categoryScore,

            COALESCE(
              SUM(
                CASE
                  WHEN utp.id IS NULL THEN 0
                  ELSE
                    LEAST(
                      COALESCE(utp.score, 0)
                      *
                      POW(
                        ${DECAY_BASE},
                        GREATEST(
                          TIMESTAMPDIFF(
                            DAY,
                            COALESCE(utp.last_interacted_at, utp.updated_at, NOW(6)),
                            NOW(6)
                          ),
                          0
                        ) / ${DECAY_DAYS}
                      ),
                      100
                    )
                    * LEAST(pt.weight, 10)
                    * (1 / LOG10(COALESCE(tpc.productCount, 1) + 10))
                END
              ),
              0
            ) AS rawTagScore

          FROM products p2

          LEFT JOIN user_category_preferences ucp
            ON ucp.user_id = ?
            AND ucp.category_id = p2.category_id

          LEFT JOIN product_tags pt
            ON pt.product_id = p2.id

          LEFT JOIN (
            SELECT
              tag_norm,
              COUNT(DISTINCT product_id) AS productCount
            FROM product_tags
            GROUP BY tag_norm
          ) tpc
            ON tpc.tag_norm = pt.tag_norm

          LEFT JOIN user_tag_preferences utp
            ON utp.user_id = ?
            AND utp.tag_norm = pt.tag_norm

          WHERE p2.deleted_at IS NULL
            AND p2.stock > 0
            AND p2.status = 'ACTIVE'

          GROUP BY p2.id
        ) base
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
        ${categoryFilterSql}

      ORDER BY
        recommendationScore DESC,
        COALESCE(ptg.trending_rank, 999999) ASC,
        p.sold DESC,
        p.created_at DESC

      LIMIT ? OFFSET ?
      `,
      [
        userId,
        userId,
        userId,
        userId,
        ...(categoryIds.length ? [categoryIds] : []),
        limit,
        offset,
      ],
    );

    return {
      page,
      limit,
      total,
      pageCount,
      categoryId,
      categoryIds,
      source: hasPreference ? 'personalized' : 'fallback',
      message: categoryId
        ? 'Gợi ý sản phẩm trong category đã chọn, đã bao gồm category con'
        : hasPreference
          ? 'Gợi ý dựa trên productScore, categoryScore, tagScore và trendingBonus'
          : 'User chưa có dữ liệu sở thích, trả về sản phẩm phổ biến/trending',
      formula: {
        recommendationScore:
          'productScore + categoryScore + tagScore + trendingBonus',
        productScore: `min(effective_user_product_score, ${PRODUCT_SCORE_MAX})`,
        categoryScore:
          '3 + min(effective_user_category_score, 50) * 0.1, max 8',
        rawTagScore:
          'sum(min(effective_user_tag_score, 100) * min(product_tag_weight, 10) * rarityFactor)',
        tagScore: `min(log10(rawTagScore + 1) * ${TAG_SCORE_LOG_MULTIPLIER}, ${TAG_SCORE_MAX})`,
        decay: `effectiveScore = score * ${DECAY_BASE}^(daysSinceLastInteraction / ${DECAY_DAYS})`,
        trendingBonus: 'Top 20 = 2, rank 21-70 = 1',
      },
      items,
    };
  }

  async getRecommendationProductScores(
    userId: number,
    query: RecommendationQueryDto,
  ) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const offset = (page - 1) * limit;

    const categoryId = query.categoryId ? Number(query.categoryId) : null;
    const categoryIds = categoryId
      ? await this.getCategoryAndDescendantIds(categoryId)
      : [];

    if (categoryId && categoryIds.length === 0) {
      return {
        page,
        limit,
        userId,
        categoryId,
        categoryIds: [],
        formula: {
          recommendationScore:
            'productScore + categoryScore + tagScore + trendingBonus',
        },
        items: [],
      };
    }

    const categoryFilterSql = categoryIds.length
      ? 'AND p.category_id IN (?)'
      : '';

    const rows = await this.dataSource.query(
      `
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY
            scored.recommendationScore DESC,
            scored.trendingRankSort ASC,
            scored.sold DESC,
            scored.createdAt DESC
        ) AS displayRank,

        scored.productId,
        scored.title,
        scored.categoryId,
        scored.categoryName,
        scored.shopId,
        scored.shopName,
        scored.sold,
        scored.stock,
        scored.status,

        scored.productRawScore,
        scored.productScore,
        scored.categoryRawScore,
        scored.categoryScore,
        scored.rawTagScore,
        scored.tagScore,
        scored.trendingBonus,
        scored.trendingRank,
        scored.trendingScore7d,

        scored.recommendationScore,

        scored.matchedTagCount,
        scored.matchedTags,

        scored.createdAt

      FROM (
        SELECT
          p.id AS productId,
          p.title,
          p.category_id AS categoryId,
          c.name AS categoryName,
          p.shop_id AS shopId,
          s.name AS shopName,
          p.sold,
          p.stock,
          p.status,
          p.created_at AS createdAt,

          COALESCE(upp.score, 0) AS productRawScore,

          LEAST(
            COALESCE(upp.score, 0)
            *
            POW(
              ${DECAY_BASE},
              GREATEST(
                TIMESTAMPDIFF(
                  DAY,
                  COALESCE(upp.last_interacted_at, upp.updated_at, NOW(6)),
                  NOW(6)
                ),
                0
              ) / ${DECAY_DAYS}
            ),
            ${PRODUCT_SCORE_MAX}
          ) AS productScore,

          COALESCE(rs.categoryRawScore, 0) AS categoryRawScore,
          COALESCE(rs.categoryScore, 0) AS categoryScore,
          COALESCE(rs.rawTagScore, 0) AS rawTagScore,
          COALESCE(rs.tagScore, 0) AS tagScore,

          COALESCE(ptg.trending_bonus, 0) AS trendingBonus,
          ptg.trending_rank AS trendingRank,
          COALESCE(ptg.trending_rank, 999999) AS trendingRankSort,
          COALESCE(ptg.score_7d, 0) AS trendingScore7d,

          (
            LEAST(
              COALESCE(upp.score, 0)
              *
              POW(
                ${DECAY_BASE},
                GREATEST(
                  TIMESTAMPDIFF(
                    DAY,
                    COALESCE(upp.last_interacted_at, upp.updated_at, NOW(6)),
                    NOW(6)
                  ),
                  0
                ) / ${DECAY_DAYS}
              ),
              ${PRODUCT_SCORE_MAX}
            )
            + COALESCE(rs.categoryScore, 0)
            + COALESCE(rs.tagScore, 0)
            + COALESCE(ptg.trending_bonus, 0)
          ) AS recommendationScore,

          COALESCE(rs.matchedTagCount, 0) AS matchedTagCount,
          COALESCE(rs.matchedTags, '') AS matchedTags

        FROM products p

        LEFT JOIN user_product_preferences upp
          ON upp.user_id = ?
          AND upp.product_id = p.id

        LEFT JOIN (
          SELECT
            base.productId,
            base.categoryRawScore,
            base.categoryScore,
            base.rawTagScore,
            LEAST(
              LOG10(base.rawTagScore + 1) * ${TAG_SCORE_LOG_MULTIPLIER},
              ${TAG_SCORE_MAX}
            ) AS tagScore,
            base.matchedTagCount,
            base.matchedTags

          FROM (
            SELECT
              p2.id AS productId,

              MAX(COALESCE(ucp.score, 0)) AS categoryRawScore,

              MAX(
                CASE
                  WHEN ucp.id IS NULL THEN 0
                  ELSE LEAST(
                    3 + LEAST(
                      COALESCE(ucp.score, 0)
                      *
                      POW(
                        ${DECAY_BASE},
                        GREATEST(
                          TIMESTAMPDIFF(
                            DAY,
                            COALESCE(ucp.last_interacted_at, ucp.updated_at, NOW(6)),
                            NOW(6)
                          ),
                          0
                        ) / ${DECAY_DAYS}
                      ),
                      50
                    ) * 0.1,
                    ${CATEGORY_SCORE_MAX}
                  )
                END
              ) AS categoryScore,

              COALESCE(
                SUM(
                  CASE
                    WHEN utp.id IS NULL THEN 0
                    ELSE
                      LEAST(
                        COALESCE(utp.score, 0)
                        *
                        POW(
                          ${DECAY_BASE},
                          GREATEST(
                            TIMESTAMPDIFF(
                              DAY,
                              COALESCE(utp.last_interacted_at, utp.updated_at, NOW(6)),
                              NOW(6)
                            ),
                            0
                          ) / ${DECAY_DAYS}
                        ),
                        100
                      )
                      * LEAST(pt.weight, 10)
                      * (1 / LOG10(COALESCE(tpc.productCount, 1) + 10))
                  END
                ),
                0
              ) AS rawTagScore,

              COUNT(
                DISTINCT CASE
                  WHEN utp.id IS NULL THEN NULL
                  ELSE pt.tag_norm
                END
              ) AS matchedTagCount,

              GROUP_CONCAT(
                DISTINCT CASE
                  WHEN utp.id IS NULL THEN NULL
                  ELSE CONCAT(
                    pt.tag_norm,
                    ': userRawScore=',
                    utp.score,
                    ', productWeight=',
                    pt.weight,
                    ', productCount=',
                    COALESCE(tpc.productCount, 1),
                    ', rarity=',
                    ROUND(1 / LOG10(COALESCE(tpc.productCount, 1) + 10), 4)
                  )
                END
                ORDER BY pt.tag_norm ASC
                SEPARATOR ' | '
              ) AS matchedTags

            FROM products p2

            LEFT JOIN user_category_preferences ucp
              ON ucp.user_id = ?
              AND ucp.category_id = p2.category_id

            LEFT JOIN product_tags pt
              ON pt.product_id = p2.id

            LEFT JOIN (
              SELECT
                tag_norm,
                COUNT(DISTINCT product_id) AS productCount
              FROM product_tags
              GROUP BY tag_norm
            ) tpc
              ON tpc.tag_norm = pt.tag_norm

            LEFT JOIN user_tag_preferences utp
              ON utp.user_id = ?
              AND utp.tag_norm = pt.tag_norm

            WHERE p2.deleted_at IS NULL
              AND p2.stock > 0
              AND p2.status = 'ACTIVE'

            GROUP BY p2.id
          ) base
        ) rs
          ON rs.productId = p.id

        LEFT JOIN product_trending ptg
          ON ptg.product_id = p.id

        LEFT JOIN shops s
          ON s.id = p.shop_id

        LEFT JOIN categories c
          ON c.id = p.category_id

        WHERE p.deleted_at IS NULL
          AND p.stock > 0
          AND p.status = 'ACTIVE'
          ${categoryFilterSql}
      ) scored

      ORDER BY
        scored.recommendationScore DESC,
        scored.trendingRankSort ASC,
        scored.sold DESC,
        scored.createdAt DESC

      LIMIT ? OFFSET ?
      `,
      [
        userId,
        userId,
        userId,
        ...(categoryIds.length ? [categoryIds] : []),
        limit,
        offset,
      ],
    );

    return {
      page,
      limit,
      userId,
      categoryId,
      categoryIds,
      formula: {
        recommendationScore:
          'productScore + categoryScore + tagScore + trendingBonus',
        productScore: `min(effective_user_product_score, ${PRODUCT_SCORE_MAX})`,
        categoryScore:
          'Nếu match category: 3 + min(effective_user_category_score, 50) * 0.1',
        rawTagScore:
          'sum(min(effective_user_tag_score, 100) * min(product_tag_weight, 10) * rarityFactor)',
        tagScore: `min(log10(rawTagScore + 1) * ${TAG_SCORE_LOG_MULTIPLIER}, ${TAG_SCORE_MAX})`,
        decay: `effectiveScore = score * ${DECAY_BASE}^(daysSinceLastInteraction / ${DECAY_DAYS})`,
        trendingBonus:
          'Top 20 trending = 2, rank 21-70 = 1, còn lại = 0',
      },
      items: rows,
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

    const productPreferences = await this.dataSource.query(
      `
      SELECT
        upp.id,
        upp.user_id AS userId,
        upp.product_id AS productId,
        p.title AS productTitle,
        upp.score,
        upp.last_interacted_at AS lastInteractedAt,
        upp.created_at AS createdAt,
        upp.updated_at AS updatedAt
      FROM user_product_preferences upp
      INNER JOIN products p
        ON p.id = upp.product_id
      WHERE upp.user_id = ?
      ORDER BY upp.score DESC, upp.last_interacted_at DESC
      LIMIT 100
      `,
      [userId],
    );

    return {
      items: categoryPreferences,
      categoryPreferences,
      tagPreferences,
      productPreferences,
    };
  }
}