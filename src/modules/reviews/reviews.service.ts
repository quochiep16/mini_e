import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductReview } from './entities/product-review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  Order,
  OrderStatus,
  ShippingStatus,
} from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ProductReview)
    private readonly reviewRepo: Repository<ProductReview>,

    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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

    /**
     * Lấy thông tin user để lưu snapshot tên/avatar.
     * Snapshot giúp review vẫn hiển thị được thông tin người đánh giá
     * kể cả khi user bị xóa cứng sau này.
     */
    const reviewer = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!reviewer) {
      throw new NotFoundException('Không tìm thấy người đánh giá');
    }

    /**
     * Check đơn hủy/hoàn trước.
     */
    if (
      order.shippingStatus === ShippingStatus.RETURNED ||
      order.shippingStatus === ShippingStatus.CANCELED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Đơn hàng đã hủy hoặc hoàn hàng nên không thể tạo đánh giá mới',
      );
    }

    /**
     * Với flow order hiện tại:
     * - Shop giao hàng: shippingStatus = DELIVERED
     * - User xác nhận nhận hàng: status = COMPLETED
     *
     * Nên review chỉ mở sau khi user xác nhận nhận hàng.
     */
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

    /**
     * Tương thích API cũ:
     * Nếu FE cũ chưa gửi productId mà order chỉ có đúng 1 product
     * thì tự lấy productId đó.
     */
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

    const review = this.reviewRepo.create({
      orderId,
      userId,
      productId,
      rating: dto.rating,
      comment,
      images: images.length ? images : null,

      /**
       * Snapshot user tại thời điểm tạo review.
       */
      userNameSnapshot: reviewer.name ?? null,
      userAvatarSnapshot: reviewer.avatarUrl ?? null,
    });

    return this.reviewRepo.save(review);
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
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u', 'u.deletedAt IS NULL')
      .where('r.product_id = :productId', { productId })
      .orderBy('r.created_at', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .select([
        'r.id',
        'r.orderId',
        'r.userId',
        'r.userNameSnapshot',
        'r.userAvatarSnapshot',
        'r.productId',
        'r.rating',
        'r.comment',
        'r.images',
        'r.createdAt',
        'r.updatedAt',
        'u.id',
        'u.name',
        'u.avatarUrl',
      ]);

    const [rows, total] = await qb.getManyAndCount();

    const items = rows.map((review) => {
      const displayName =
        review.userNameSnapshot ?? review.user?.name ?? 'Người dùng đã xóa';

      const displayAvatarUrl =
        review.userAvatarSnapshot ?? review.user?.avatarUrl ?? null;

      return {
        id: review.id,
        orderId: review.orderId,
        userId: review.user?.id ?? review.userId ?? null,
        productId: review.productId,
        rating: review.rating,
        comment: review.comment,
        images: review.images,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,

        /**
         * user vẫn trả về để FE cũ dùng được.
         * Nếu user đã bị xóa cứng, vẫn có name/avatar từ snapshot.
         */
        user: {
          id: review.user?.id ?? review.userId ?? null,
          name: displayName,
          avatarUrl: displayAvatarUrl,
          isDeleted: !review.user,
        },
      };
    });

    const raw = await this.reviewRepo
      .createQueryBuilder('r')
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.rating)', 'avg')
      .where('r.product_id = :productId', { productId })
      .getRawOne();

    const count = Number(raw?.count ?? 0);
    const avg = raw?.avg != null ? Number(raw.avg) : 0;

    return {
      summary: {
        count,
        avg: Number(avg.toFixed(2)),
      },
      items,
      page: safePage,
      limit: safeLimit,
      total,
    };
  }
}