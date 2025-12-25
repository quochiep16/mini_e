import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductReview } from './entities/product-review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { Order, OrderStatus, ShippingStatus } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ProductReview) private readonly reviewRepo: Repository<ProductReview>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
  ) {}

  async createForOrder(userId: number, orderId: string, dto: CreateReviewDto) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (order.userId !== userId) throw new ForbiddenException('Bạn không có quyền review đơn này');

    // ✅ Cho phép review khi đã giao (DELIVERED) hoặc đã nhận hàng (COMPLETED)
    const ok =
      order.shippingStatus === ShippingStatus.DELIVERED || order.status === OrderStatus.COMPLETED;

    if (!ok) {
      throw new BadRequestException('Chỉ được đánh giá sau khi đơn đã giao (DELIVERED) hoặc đã nhận hàng (COMPLETED)');
    }

    const existed = await this.reviewRepo.exists({ where: { orderId } as any });
    if (existed) throw new BadRequestException('Đơn hàng này đã được đánh giá rồi');

    const items = await this.itemRepo.find({ where: { orderId } });
    if (!items.length) throw new BadRequestException('Đơn hàng không có items');

    const productId = items[0].productId;
    const different = items.some((i) => i.productId !== productId);
    if (different) {
      throw new BadRequestException('Order này chứa nhiều productId — không phù hợp rule 1 order = 1 product');
    }

    const review = this.reviewRepo.create({
      orderId,
      userId,
      productId,
      rating: dto.rating,
      comment: dto.comment?.trim() ? dto.comment.trim() : null,
      images: dto.images?.length ? dto.images : null,
    });

    return this.reviewRepo.save(review);
  }

  async getByOrder(userId: number, orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.userId !== userId) throw new ForbiddenException('Bạn không có quyền xem review của đơn này');

    const review = await this.reviewRepo.findOne({ where: { orderId } as any });
    return review ?? null;
  }

  // ✅ Public: list reviews theo product + trả thêm user {id,name,avatarUrl}
  async listByProduct(productId: number, page = 1, limit = 20) {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u', 'u.deletedAt IS NULL')
      .where('r.productId = :pid', { pid: productId })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      // ✅ chỉ chọn field cần thiết (không lộ email/role/...)
      .select([
        'r.id',
        'r.orderId',
        'r.userId',
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

    const items = rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      userId: r.userId,
      productId: r.productId,
      rating: r.rating,
      comment: r.comment,
      images: r.images,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.user ? { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? null } : null,
    }));

    const raw = await this.reviewRepo
      .createQueryBuilder('r')
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.rating)', 'avg')
      .where('r.productId = :pid', { pid: productId })
      .getRawOne();

    const count = Number(raw?.count ?? 0);
    const avg = raw?.avg != null ? Number(raw.avg) : 0;

    return {
      summary: { count, avg: Number(avg.toFixed(2)) },
      items,
      page,
      limit,
      total,
    };
  }
}
