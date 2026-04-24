import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, Not, Repository } from 'typeorm';

import { Shop, ShopStatus } from './entities/shop.entity';
import { ShopStats } from './entities/shop-stats.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';

import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../users/enums/user.enum';

import {
  Order,
  OrderStatus,
  ShippingStatus,
} from '../../modules/orders/entities/order.entity';

@Injectable()
export class ShopsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(ShopStats) private readonly statsRepo: Repository<ShopStats>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
  ) {}

  // ---------------- common utils ----------------

  private slugify(input: string): string {
    const base = (input ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    return base || 'shop';
  }

  private async ensureUniqueSlug(base: string, ignoreId?: number) {
    let slug = this.slugify(base);
    let i = 1;

    while (true) {
      const found = await this.shopsRepo.findOne({
        where: ignoreId ? { slug, id: Not(ignoreId) } : { slug },
        select: { id: true },
      });

      if (!found) return slug;
      slug = `${this.slugify(base)}-${i++}`;
    }
  }

  async nameExists(name: string, ignoreId?: number) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return false;

    const found = await this.shopsRepo.findOne({
      where: ignoreId
        ? { name: ILike(cleanName), id: Not(ignoreId) }
        : { name: ILike(cleanName) },
      select: { id: true },
    });

    return !!found;
  }

  private toFixedOrNull(v?: number, digits = 7): string | null {
    return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : null;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

  private async getShopOrThrow(id: number) {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Không tìm thấy shop.');
    return shop;
  }

  private async ensureStatsForShop(shop: Shop) {
    if (shop.stats) return shop.stats;

    const stats = this.statsRepo.create({
      shopId: shop.id,
      productCount: 0,
      totalSold: 0,
      totalRevenue: 0,
      totalOrders: 0,
    });

    shop.stats = await this.statsRepo.save(stats);
    return shop.stats;
  }

  private mapShopWithStats(shop: Shop, includeRevenue = true) {
    const stats = (shop.stats ?? null) as any;
    const { stats: _ignored, ...plainShop } = shop as any;

    const productCount = stats?.productCount ?? 0;
    const totalOrders = stats?.totalOrders ?? 0;
    const totalSold = stats?.totalSold ?? 0;

    if (!includeRevenue) {
      const { totalRevenue, ...statsPublic } = stats || {};
      return {
        ...plainShop,
        stats: statsPublic,
        productCount,
        totalOrders,
        totalSold,
      };
    }

    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    return {
      ...plainShop,
      stats,
      productCount,
      totalRevenue,
      totalOrders,
      totalSold,
    };
  }

  private async syncOwnerRoleByShopStatus(
    trx: EntityManager,
    shop: Shop,
    nextStatus: ShopStatus,
  ) {
    const userRepo = trx.getRepository(User);
    const owner = await userRepo.findOne({ where: { id: shop.userId } });

    if (!owner) return;

    if (nextStatus === ShopStatus.ACTIVE) {
      shop.verifiedAt = shop.verifiedAt ?? new Date();

      if (owner.role !== UserRole.SELLER) {
        owner.role = UserRole.SELLER;
        await userRepo.save(owner);
      }
      return;
    }

    // PENDING hoặc SUSPENDED thì chưa được bán
    shop.verifiedAt = null;

    if (owner.role === UserRole.SELLER) {
      owner.role = UserRole.USER;
      await userRepo.save(owner);
    }
  }

  // ---------------- shop order management ----------------

  async listMyShopOrders(userId: number, page = 1, limit = 20) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      select: { id: true } as any,
    });
    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    const shopId = Number((shop as any).id);

    const idRows = await this.dataSource
      .createQueryBuilder()
      .select('o.id', 'id')
      .addSelect('MAX(o.created_at)', 'createdAt')
      .from('orders', 'o')
      .innerJoin('order_items', 'oi', 'oi.order_id = o.id')
      .innerJoin('products', 'p', 'p.id = oi.product_id')
      .where('p.shop_id = :shopId', { shopId })
      .groupBy('o.id')
      .orderBy('createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{ id: string; createdAt: string }>();

    const ids = idRows.map((r) => r.id);

    const totalRow = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(DISTINCT o.id)', 'cnt')
      .from('orders', 'o')
      .innerJoin('order_items', 'oi', 'oi.order_id = o.id')
      .innerJoin('products', 'p', 'p.id = oi.product_id')
      .where('p.shop_id = :shopId', { shopId })
      .getRawOne<{ cnt: string }>();

    const total = Number(totalRow?.cnt || 0);

    if (!ids.length) {
      return { items: [], page, limit, total };
    }

    const orders = await this.ordersRepo.find({
      where: { id: In(ids) } as any,
      relations: { items: true },
    });

    const map = new Map(orders.map((o) => [o.id, o]));
    const ordered = ids.map((id) => map.get(id)).filter(Boolean);

    return { items: ordered, page, limit, total };
  }

  private async getMyShopIdOrThrow(userId: number): Promise<number> {
    const shop = await this.shopsRepo.findOne({
      where: { userId },
      select: { id: true } as any,
    });

    if (!shop) throw new NotFoundException('Bạn chưa có shop.');
    return Number((shop as any).id);
  }

  private async assertOrderBelongsToShop(orderId: string, shopId: number) {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(oi.id)', 'cnt')
      .from('order_items', 'oi')
      .innerJoin('products', 'p', 'p.id = oi.product_id')
      .where('oi.order_id = :orderId', { orderId })
      .andWhere('p.shop_id = :shopId', { shopId })
      .getRawOne<{ cnt: string }>();

    const cnt = Number(row?.cnt || 0);
    if (cnt <= 0) {
      throw new NotFoundException('Không tìm thấy đơn hàng thuộc shop của bạn.');
    }
  }

  async getMyShopOrderDetail(userId: number, orderId: string) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shopId = await this.getMyShopIdOrThrow(userId);
    await this.assertOrderBelongsToShop(orderId, shopId);

    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: { items: true } as any,
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return order;
  }

  private isValidNextShipping(prev: ShippingStatus, next: ShippingStatus) {
    const allow: Record<string, ShippingStatus[]> = {
      PENDING: [ShippingStatus.PICKED, ShippingStatus.CANCELED],
      PICKED: [ShippingStatus.IN_TRANSIT, ShippingStatus.CANCELED],
      IN_TRANSIT: [],
      DELIVERED: [],
      RETURNED: [],
      CANCELED: [],
    };

    return (allow[String(prev)] ?? []).includes(next);
  }

  async updateMyShopOrderShippingStatus(
    userId: number,
    orderId: string,
    shippingStatus: ShippingStatus,
  ) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shopId = await this.getMyShopIdOrThrow(userId);
    await this.assertOrderBelongsToShop(orderId, shopId);

    const order = await this.ordersRepo.findOne({ where: { id: orderId } as any });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Đơn hàng đã kết thúc, không thể cập nhật trạng thái.');
    }

    const prev = order.shippingStatus as ShippingStatus;
    if (prev === shippingStatus) return order;

    if (!this.isValidNextShipping(prev, shippingStatus)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${prev} sang ${shippingStatus}`,
      );
    }

    order.shippingStatus = shippingStatus as any;

    if (shippingStatus === ShippingStatus.PICKED) {
      order.status = OrderStatus.PROCESSING;
    } else if (shippingStatus === ShippingStatus.IN_TRANSIT) {
      order.status = OrderStatus.SHIPPED;
    } else if (shippingStatus === ShippingStatus.CANCELED) {
      order.status = OrderStatus.CANCELLED;
    }

    return this.ordersRepo.save(order as any);
  }

  // ---------------- shop register / read / update / delete ----------------

  async registerForUser(userId: number, dto: CreateShopDto) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const existed = await this.shopsRepo.findOne({ where: { userId } });
    if (existed) {
      throw new ConflictException('Bạn đã có shop và đang chờ duyệt hoặc đã được tạo trước đó.');
    }

    const cleanName = String(dto.name || '').trim();
    if (!cleanName) {
      throw new BadRequestException('Tên shop không được để trống.');
    }

    if (await this.nameExists(cleanName)) {
      throw new ConflictException('Tên shop đã tồn tại.');
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy user.');

    const slug = await this.ensureUniqueSlug(cleanName);

    return this.dataSource.transaction(async (trx) => {
      const shopRepo = trx.getRepository(Shop);
      const statsRepo = trx.getRepository(ShopStats);

      const shop = shopRepo.create({
        userId,
        name: cleanName,
        email: this.normalizeOptionalText(dto.email),
        description: this.normalizeOptionalText(dto.description),
        slug,
        status: ShopStatus.PENDING,
        verifiedAt: null,

        shopAddress: this.normalizeOptionalText(dto.shopAddress),
        shopLat: this.toFixedOrNull(dto.shopLat),
        shopLng: this.toFixedOrNull(dto.shopLng),
        shopPlaceId: this.normalizeOptionalText(dto.shopPlaceId),
        shopPhone: this.normalizeOptionalText(dto.shopPhone),
      });

      await shopRepo.save(shop);

      const stats = statsRepo.create({
        shopId: shop.id,
        productCount: 0,
        totalSold: 0,
        totalRevenue: 0,
        totalOrders: 0,
      });

      shop.stats = await statsRepo.save(stats);

      // KHÔNG đổi role sang SELLER ở đây.
      // Chỉ khi ADMIN duyệt ACTIVE mới đổi role.

      return this.mapShopWithStats(shop, true);
    });
  }

  async findAll(query: QueryShopDto) {
    const { q, status, page = 1, limit = 20 } = query;

    const likeInsensitive = (s: string) => ILike(`%${s}%`);

    const where = q
      ? [
          { name: likeInsensitive(q), ...(status ? { status } : {}) },
          { email: likeInsensitive(q), ...(status ? { status } : {}) },
          { shopAddress: likeInsensitive(q), ...(status ? { status } : {}) },
          { shopPhone: likeInsensitive(q), ...(status ? { status } : {}) },
        ]
      : status
        ? { status }
        : {};

    const [items, total] = await this.shopsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { stats: true },
    });

    const mapped = items.map((shop) => this.mapShopWithStats(shop, false));
    return { items: mapped, page, limit, total };
  }

  async findMine(userId: number) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      relations: { stats: true },
    });

    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    await this.ensureStatsForShop(shop);
    return this.mapShopWithStats(shop, true);
  }

  async findOnePublic(id: number) {
    const shop = await this.shopsRepo.findOne({
      where: { id, status: ShopStatus.ACTIVE },
      relations: { stats: true },
    });

    if (!shop) throw new NotFoundException('Không tìm thấy shop.');

    await this.ensureStatsForShop(shop);
    return this.mapShopWithStats(shop, false);
  }

  async updateShopAsOwner(id: number, ownerId: number, dto: UpdateShopDto) {
    const shop = await this.getShopOrThrow(id);

    if (shop.userId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa shop này.');
    }

    const { status, ...safeDto } = dto as any;
    await this.applyUpdate(shop, safeDto, id);

    return this.withStats(shop.id, true);
  }

  async updateShopAsAdmin(id: number, dto: UpdateShopDto) {
    const shop = await this.getShopOrThrow(id);

    await this.dataSource.transaction(async (trx) => {
      if (dto.status !== undefined && dto.status !== shop.status) {
        await this.syncOwnerRoleByShopStatus(trx, shop, dto.status);
      }

      await this.applyUpdate(shop, dto, id, trx);
    });

    return this.withStats(id, true);
  }

  private async applyUpdate(
    shop: Shop,
    dto: UpdateShopDto,
    id: number,
    trx?: EntityManager,
  ) {
    const shopRepo = trx?.getRepository(Shop) ?? this.shopsRepo;

    if (dto.name !== undefined) {
      const cleanName = String(dto.name || '').trim();

      if (!cleanName) {
        throw new BadRequestException('Tên shop không được để trống.');
      }

      if (cleanName !== shop.name) {
        if (await this.nameExists(cleanName, id)) {
          throw new ConflictException('Tên shop đã tồn tại.');
        }

        shop.name = cleanName;
        shop.slug = await this.ensureUniqueSlug(cleanName, id);
      }
    }

    if (dto.email !== undefined) {
      shop.email = this.normalizeOptionalText(dto.email);
    }

    if (dto.description !== undefined) {
      shop.description = this.normalizeOptionalText(dto.description);
    }

    if (dto.shopAddress !== undefined) {
      shop.shopAddress = this.normalizeOptionalText(dto.shopAddress);
    }

    if (dto.shopLat !== undefined) {
      shop.shopLat = this.toFixedOrNull(dto.shopLat);
    }

    if (dto.shopLng !== undefined) {
      shop.shopLng = this.toFixedOrNull(dto.shopLng);
    }

    if (dto.shopPlaceId !== undefined) {
      shop.shopPlaceId = this.normalizeOptionalText(dto.shopPlaceId);
    }

    if (dto.shopPhone !== undefined) {
      shop.shopPhone = this.normalizeOptionalText(dto.shopPhone);
    }

    if (dto.status !== undefined) {
      shop.status = dto.status;
    }

    await shopRepo.save(shop);
  }

  async removeShopAsOwner(id: number, ownerId: number) {
    const shop = await this.getShopOrThrow(id);

    if (shop.userId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền xóa shop này.');
    }

    await this.removeAndRevertRole(shop);
    return { success: true };
  }

  async removeShopAsAdmin(id: number) {
    const shop = await this.getShopOrThrow(id);
    await this.removeAndRevertRole(shop);
    return { success: true };
  }

  private async removeAndRevertRole(shop: Shop) {
    await this.dataSource.transaction(async (trx) => {
      const shopRepo = trx.getRepository(Shop);
      const userRepo = trx.getRepository(User);

      await shopRepo.delete({ id: shop.id });

      const owner = await userRepo.findOne({ where: { id: shop.userId } });
      if (owner && owner.role === UserRole.SELLER) {
        owner.role = UserRole.USER;
        await userRepo.save(owner);
      }
    });
  }

  private async withStats(shopId: number, includeRevenue: boolean) {
    const shop = await this.shopsRepo.findOne({
      where: { id: shopId },
      relations: { stats: true },
    });

    if (!shop) throw new NotFoundException('Không tìm thấy shop.');

    await this.ensureStatsForShop(shop);
    return this.mapShopWithStats(shop, includeRevenue);
  }

  async updateLogoUrl(userId: number, logoUrl: string) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      relations: { stats: true },
    });

    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    shop.logoUrl = logoUrl;
    await this.shopsRepo.save(shop);

    await this.ensureStatsForShop(shop);
    return this.mapShopWithStats(shop, true);
  }

  async updateCoverUrl(userId: number, coverUrl: string) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      relations: { stats: true },
    });

    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    shop.coverUrl = coverUrl;
    await this.shopsRepo.save(shop);

    await this.ensureStatsForShop(shop);
    return this.mapShopWithStats(shop, true);
  }
}