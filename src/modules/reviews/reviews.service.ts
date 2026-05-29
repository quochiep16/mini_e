import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ProductReview } from './entities/product-review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  Order,
  OrderStatus,
  ShippingStatus,
} from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';

type ReviewRow = {
  id: string;
  orderId: string;
  userId: number | null;
  userNameSnapshot?: string | null;
  userAvatarSnapshot?: string | null;

  productId: number;
  rating: number;
  comment: string | null;
  images: any;

  createdAt: Date | string;
  updatedAt: Date | string;

  productTitle?: string | null;
  productSlug?: string | null;

  userName?: string | null;
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(ProductReview)
    private readonly reviewRepo: Repository<ProductReview>,

    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
  ) {}

  private normalizePageLimit(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    return {
      page: safePage,
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit,
    };
  }

  private parseImages(images: any): string[] | null {
    if (!images) return null;

    if (Array.isArray(images)) {
      const arr = images
        .map((url) => String(url || '').trim())
        .filter(Boolean);

      return arr.length ? arr : null;
    }

    if (typeof images === 'string') {
      const trimmed = images.trim();

      if (!trimmed) return null;

      try {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          const arr = parsed
            .map((url) => String(url || '').trim())
            .filter(Boolean);

          return arr.length ? arr : null;
        }
      } catch {
        return [trimmed];
      }

      return [trimmed];
    }

    return null;
  }

  private buildRatingSql(rating?: number) {
    if (!rating) {
      return {
        sql: '',
        params: [] as any[],
      };
    }

    return {
      sql: ' AND pr.rating = ? ',
      params: [rating] as any[],
    };
  }

  private mapReviewRow(row: ReviewRow) {
    const userName =
      row.userNameSnapshot || row.userName || 'Người dùng Mochi';

    return {
      id: row.id,
      orderId: row.orderId,
      userId: row.userId ?? null,

      userNameSnapshot: row.userNameSnapshot ?? null,
      userAvatarSnapshot: row.userAvatarSnapshot ?? null,

      productId: Number(row.productId),
      rating: Number(row.rating),
      comment: row.comment ?? null,
      images: this.parseImages(row.images),

      createdAt: row.createdAt,
      updatedAt: row.updatedAt,

      product: {
        id: Number(row.productId),
        title: row.productTitle || `Sản phẩm #${row.productId}`,
        slug: row.productSlug ?? null,
      },

      user: {
        id: row.userId ?? null,
        name: userName,
        avatarUrl: row.userAvatarSnapshot ?? null,
        isDeleted: !row.userId,
      },
    };
  }

  private async getUserNameSnapshot(userId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT name
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId],
    );

    return rows?.[0]?.name ?? null;
  }

  private async getShopIdByOwnerId(userId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT id
      FROM shops
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId],
    );

    const shopId = Number(rows?.[0]?.id ?? 0);

    if (!shopId) {
      throw new NotFoundException('Bạn chưa có shop.');
    }

    return shopId;
  }

  private async getShopIdByProductId(productId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT shop_id AS shopId
      FROM products
      WHERE id = ?
      LIMIT 1
      `,
      [productId],
    );

    const shopId = Number(rows?.[0]?.shopId ?? 0);
    return shopId > 0 ? shopId : null;
  }

  private async recalculateShopRatingByProductId(productId: number) {
    const shopId = await this.getShopIdByProductId(productId);

    if (!shopId) return;

    await this.recalculateShopRating(shopId);
  }

  private async recalculateShopRating(shopId: number) {
    const raw = await this.dataSource.query(
      `
      SELECT
        COUNT(pr.id) AS reviewCount,
        COALESCE(ROUND(AVG(pr.rating), 2), 0) AS ratingAvg
      FROM product_reviews pr
      INNER JOIN products p ON p.id = pr.product_id
      WHERE p.shop_id = ?
      `,
      [shopId],
    );

    const reviewCount = Number(raw?.[0]?.reviewCount ?? 0);
    const ratingAvg = Number(raw?.[0]?.ratingAvg ?? 0);

    await this.dataSource.query(
      `
      UPDATE shop_stats
      SET
        review_count = ?,
        rating_avg = ?,
        updated_at = NOW()
      WHERE shop_id = ?
      `,
      [reviewCount, ratingAvg, shopId],
    );

    return {
      reviewCount,
      ratingAvg,
    };
  }

  async createForOrder(userId: number, orderId: string, dto: CreateReviewDto) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền đánh giá đơn hàng này');
    }

    if (
      order.shippingStatus === ShippingStatus.RETURNED ||
      order.shippingStatus === ShippingStatus.CANCELED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Đơn hàng đã hủy hoặc hoàn hàng nên không thể tạo đánh giá mới',
      );
    }

    const canReview =
      order.status === OrderStatus.COMPLETED &&
      order.shippingStatus === ShippingStatus.DELIVERED;

    if (!canReview) {
      throw new BadRequestException(
        'Chỉ được đánh giá sau khi bạn đã xác nhận nhận hàng',
      );
    }

    const items = await this.itemRepo.find({
      where: { orderId },
    });

    if (!items.length) {
      throw new BadRequestException('Đơn hàng không có sản phẩm để đánh giá');
    }

    let productId = dto.productId;

    const uniqueProductIds = Array.from(
      new Set(items.map((item) => item.productId)),
    );

    if (!productId) {
      if (uniqueProductIds.length === 1) {
        productId = uniqueProductIds[0];
      } else {
        throw new BadRequestException(
          'Đơn hàng có nhiều sản phẩm, vui lòng truyền productId cần đánh giá',
        );
      }
    }

    const itemInOrder = items.some((item) => item.productId === productId);

    if (!itemInOrder) {
      throw new BadRequestException(
        'Sản phẩm này không thuộc đơn hàng của bạn',
      );
    }

    const existed = await this.reviewRepo.exists({
      where: {
        orderId,
        productId,
      },
    });

    if (existed) {
      throw new BadRequestException(
        'Bạn đã đánh giá sản phẩm này trong đơn hàng rồi',
      );
    }

    const rawComment = dto.comment ?? dto.content ?? null;
    const comment = rawComment?.trim() ? rawComment.trim() : null;

    const images =
      dto.images
        ?.filter((url) => typeof url === 'string' && url.trim())
        .map((url) => url.trim()) ?? [];

    const userNameSnapshot = await this.getUserNameSnapshot(userId);

    const review = this.reviewRepo.create({
      orderId,
      userId,
      productId,
      rating: dto.rating,
      comment,
      images: images.length ? images : null,

      userNameSnapshot,
      userAvatarSnapshot: null,
    } as any);

    const saved = await this.reviewRepo.save(review);

    await this.recalculateShopRatingByProductId(productId);

    return saved;
  }

  async getByOrder(userId: number, orderId: string, productId?: number) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem đánh giá đơn này');
    }

    if (productId) {
      return this.reviewRepo.findOne({
        where: {
          orderId,
          productId,
        },
      });
    }

    return this.reviewRepo.find({
      where: { orderId },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async listByProduct(productId: number, page = 1, limit = 20) {
    const safeProductId = Number(productId);

    if (!Number.isInteger(safeProductId) || safeProductId <= 0) {
      throw new BadRequestException('productId không hợp lệ');
    }

    const { page: safePage, limit: safeLimit, offset } =
      this.normalizePageLimit(page, limit);

    const itemsRaw = await this.dataSource.query(
      `
      SELECT
        pr.id AS id,
        pr.order_id AS orderId,
        pr.user_id AS userId,
        pr.user_name_snapshot AS userNameSnapshot,
        pr.user_avatar_snapshot AS userAvatarSnapshot,
        pr.product_id AS productId,
        pr.rating AS rating,
        pr.comment AS comment,
        pr.images AS images,
        pr.created_at AS createdAt,
        pr.updated_at AS updatedAt,

        p.title AS productTitle,
        p.slug AS productSlug,

        u.name AS userName
      FROM product_reviews pr
      INNER JOIN products p ON p.id = pr.product_id
      LEFT JOIN users u ON u.id = pr.user_id
      WHERE pr.product_id = ?
      ORDER BY pr.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [safeProductId, safeLimit, offset],
    );

    const totalRaw = await this.dataSource.query(
      `
      SELECT COUNT(pr.id) AS total
      FROM product_reviews pr
      WHERE pr.product_id = ?
      `,
      [safeProductId],
    );

    const summaryRaw = await this.dataSource.query(
      `
      SELECT
        COUNT(pr.id) AS count,
        COALESCE(ROUND(AVG(pr.rating), 2), 0) AS avg
      FROM product_reviews pr
      WHERE pr.product_id = ?
      `,
      [safeProductId],
    );

    return {
      summary: {
        count: Number(summaryRaw?.[0]?.count ?? 0),
        avg: Number(summaryRaw?.[0]?.avg ?? 0),
      },
      items: (itemsRaw as ReviewRow[]).map((row) => this.mapReviewRow(row)),
      page: safePage,
      limit: safeLimit,
      total: Number(totalRaw?.[0]?.total ?? 0),
    };
  }

  /**
   * Shop đang đăng nhập xem review của shop mình.
   *
   * GET /api/reviews/shop/me
   */
  async listByMyShop(
    userId: number,
    page = 1,
    limit = 20,
    rating?: number,
  ) {
    if (!userId) {
      throw new ForbiddenException('Không xác định được user từ token.');
    }

    const shopId = await this.getShopIdByOwnerId(userId);

    return this.listByShop(shopId, page, limit, rating);
  }

  /**
   * User/public xem review của shop theo shopId.
   *
   * GET /api/reviews/shop/:shopId
   */
  async listByShop(
    shopId: number,
    page = 1,
    limit = 20,
    rating?: number,
  ) {
    const safeShopId = Number(shopId);

    if (!Number.isInteger(safeShopId) || safeShopId <= 0) {
      throw new BadRequestException('shopId không hợp lệ');
    }

    const { page: safePage, limit: safeLimit, offset } =
      this.normalizePageLimit(page, limit);

    const ratingFilter = this.buildRatingSql(rating);

    const itemsRaw = await this.dataSource.query(
      `
      SELECT
        pr.id AS id,
        pr.order_id AS orderId,
        pr.user_id AS userId,
        pr.user_name_snapshot AS userNameSnapshot,
        pr.user_avatar_snapshot AS userAvatarSnapshot,
        pr.product_id AS productId,
        pr.rating AS rating,
        pr.comment AS comment,
        pr.images AS images,
        pr.created_at AS createdAt,
        pr.updated_at AS updatedAt,

        p.title AS productTitle,
        p.slug AS productSlug,

        u.name AS userName
      FROM product_reviews pr
      INNER JOIN products p ON p.id = pr.product_id
      LEFT JOIN users u ON u.id = pr.user_id
      WHERE p.shop_id = ?
      ${ratingFilter.sql}
      ORDER BY pr.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [safeShopId, ...ratingFilter.params, safeLimit, offset],
    );

    const totalRaw = await this.dataSource.query(
      `
      SELECT COUNT(pr.id) AS total
      FROM product_reviews pr
      INNER JOIN products p ON p.id = pr.product_id
      WHERE p.shop_id = ?
      ${ratingFilter.sql}
      `,
      [safeShopId, ...ratingFilter.params],
    );

    const summaryRaw = await this.dataSource.query(
      `
      SELECT
        COUNT(pr.id) AS reviewCount,
        COALESCE(ROUND(AVG(pr.rating), 2), 0) AS ratingAvg
      FROM product_reviews pr
      INNER JOIN products p ON p.id = pr.product_id
      WHERE p.shop_id = ?
      `,
      [safeShopId],
    );

    const ratingAvg = Number(summaryRaw?.[0]?.ratingAvg ?? 0);
    const reviewCount = Number(summaryRaw?.[0]?.reviewCount ?? 0);

    return {
      summary: {
        ratingAvg,
        reviewCount,

        avg: ratingAvg,
        count: reviewCount,
      },
      items: (itemsRaw as ReviewRow[]).map((row) => this.mapReviewRow(row)),
      page: safePage,
      limit: safeLimit,
      total: Number(totalRaw?.[0]?.total ?? 0),
    };
  }
}