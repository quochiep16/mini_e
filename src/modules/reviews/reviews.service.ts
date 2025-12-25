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

  // ✅ tạo review theo orderId
  async createForOrder(userId: number, orderId: string, dto: CreateReviewDto) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (order.userId !== userId) throw new ForbiddenException('Bạn không có quyền review đơn này');

    /**
     * ✅ Rule mới bạn chốt:
     * - Shop cập nhật shippingStatus = DELIVERED thì user mới được review
     *
     * Nếu bạn vẫn muốn “nhận hàng = COMPLETED”, bạn có thể đổi điều kiện thành:
     * if (order.status !== OrderStatus.COMPLETED) ...
     *
     * Mình để “DELIVERED hoặc COMPLETED” cho chắc chắn trong giai đoạn chuyển đổi.
     */
    const ok =
      order.shippingStatus === ShippingStatus.DELIVERED || order.status === OrderStatus.COMPLETED;
    if (!ok) {
      throw new BadRequestException('Chỉ được đánh giá sau khi đơn đã giao (DELIVERED) hoặc đã nhận hàng (COMPLETED)');
    }

    const existed = await this.reviewRepo.exists({ where: { orderId } as any });
    if (existed) throw new BadRequestException('Đơn hàng này đã được đánh giá rồi');

    // Lấy productId từ order_items
    const items = await this.itemRepo.find({ where: { orderId } });
    if (!items.length) throw new BadRequestException('Đơn hàng không có items');

    // Vì bạn thiết kế 1 order = 1 product
    const productId = items[0].productId;
    const different = items.some((i) => i.productId !== productId);
    if (different) {
      throw new BadRequestException('Order này chứa nhiều productId — không phù hợp rule 1 order = 1 product');
    }

    const comment = (dto.content ?? dto.comment)?.trim() || null;

    const review = this.reviewRepo.create({
      orderId,
      userId,
      productId,
      rating: dto.rating,
      comment,
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

  // Public: list reviews theo product
  async listByProduct(productId: number, page = 1, limit = 20) {
    const [items, total] = await this.reviewRepo.findAndCount({
      where: { productId } as any,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const raw = await this.reviewRepo
      .createQueryBuilder('r')
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.rating)', 'avg')
      .where('r.product_id = :pid', { pid: productId })
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
