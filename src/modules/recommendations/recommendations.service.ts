import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { InteractionEvent } from './enums/interaction-event.enum';

const EVENT_WEIGHTS: Record<InteractionEvent, number> = {
  [InteractionEvent.CLICK]: 1,
  [InteractionEvent.VIEW_DETAIL]: 2,
  [InteractionEvent.ADD_TO_CART]: 5,
  [InteractionEvent.FAVORITE]: 7,
  [InteractionEvent.UNFAVORITE]: -3,
  [InteractionEvent.PURCHASE]: 10,
};

@Injectable()
export class RecommendationsService {
  constructor(private readonly dataSource: DataSource) {}

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

  /**
   * Lấy điểm theo loại hành vi.
   */
  private getWeight(eventType: InteractionEvent): number {
    return EVENT_WEIGHTS[eventType] ?? 1;
  }

  /**
   * Ghi nhận hành vi người dùng:
   * CLICK, VIEW_DETAIL, ADD_TO_CART, FAVORITE, UNFAVORITE, PURCHASE.
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

    await this.dataSource.query(
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

    /**
     * Nếu sản phẩm có category thì cộng điểm vào bảng user_category_preferences.
     * GREATEST(..., 0) để điểm không bị âm khi user bỏ yêu thích.
     */
    if (categoryId) {
      await this.dataSource.query(
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
      INNER JOIN products p ON p.id = f.product_id
      LEFT JOIN shops s ON s.id = p.shop_id
      LEFT JOIN categories c ON c.id = p.category_id
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
   * Nếu user đã có điểm sở thích category:
   * - Lấy sản phẩm theo category user quan tâm nhất.
   *
   * Nếu user chưa có dữ liệu:
   * - Fallback sang sản phẩm bán chạy / mới nhất.
   */
  async getRecommendedProducts(userId: number, query: RecommendationQueryDto) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const offset = (page - 1) * limit;

    const personalizedItems = await this.dataSource.query(
      `
      SELECT DISTINCT
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

        ucp.score AS recommendationScore,

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
        END AS isFavorite

      FROM products p
      INNER JOIN user_category_preferences ucp
        ON ucp.category_id = p.category_id
      LEFT JOIN shops s
        ON s.id = p.shop_id
      LEFT JOIN categories c
        ON c.id = p.category_id
      LEFT JOIN product_favorites pf
        ON pf.product_id = p.id AND pf.user_id = ?

      WHERE ucp.user_id = ?
        AND p.deleted_at IS NULL
        AND p.stock > 0
        AND p.status NOT IN ('DRAFT', 'HIDDEN', 'DELETED', 'INACTIVE')

      ORDER BY
        ucp.score DESC,
        p.sold DESC,
        p.created_at DESC

      LIMIT ? OFFSET ?
      `,
      [userId, userId, limit, offset],
    );

    if (personalizedItems.length > 0) {
      return {
        page,
        limit,
        source: 'personalized',
        message: 'Gợi ý dựa trên hành vi người dùng',
        items: personalizedItems,
      };
    }

    const fallbackItems = await this.dataSource.query(
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

        0 AS recommendationScore,

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
        END AS isFavorite

      FROM products p
      LEFT JOIN shops s
        ON s.id = p.shop_id
      LEFT JOIN categories c
        ON c.id = p.category_id
      LEFT JOIN product_favorites pf
        ON pf.product_id = p.id AND pf.user_id = ?

      WHERE p.deleted_at IS NULL
        AND p.stock > 0
        AND p.status NOT IN ('DRAFT', 'HIDDEN', 'DELETED', 'INACTIVE')

      ORDER BY
        p.sold DESC,
        p.created_at DESC

      LIMIT ? OFFSET ?
      `,
      [userId, limit, offset],
    );

    return {
      page,
      limit,
      source: 'fallback',
      message: 'User chưa có dữ liệu hành vi, trả về sản phẩm phổ biến',
      items: fallbackItems,
    };
  }

  /**
   * Xem điểm sở thích theo danh mục của user.
   * API này hữu ích để test phần recommendation.
   */
  async getMyCategoryPreferences(userId: number) {
    if (!userId) {
      throw new BadRequestException('Không xác định được người dùng');
    }

    const items = await this.dataSource.query(
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

    return {
      items,
    };
  }
}