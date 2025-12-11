import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Not, Repository } from 'typeorm';

import { Shop, ShopStatus } from './entities/shop.entity';
import { ShopStats } from './entities/shop-stats.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { User, UserRole } from '../../modules/users/entities/user.entity';

@Injectable()
export class ShopsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(ShopStats) private readonly statsRepo: Repository<ShopStats>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const found = await this.shopsRepo.findOne({
        where: ignoreId ? { slug, id: Not(ignoreId) } : { slug },
        select: { id: true },
      });
      if (!found) return slug;
      slug = `${this.slugify(base)}-${i++}`;
    }
  }

  /** So sánh tên không phân biệt hoa/thường (chính xác theo chuỗi) */
  async nameExists(name: string, ignoreId?: number) {
    const found = await this.shopsRepo.findOne({
      where: ignoreId ? { name: ILike(name), id: Not(ignoreId) } : { name: ILike(name) },
      select: { id: true },
    });
    return !!found;
  }

  private toFixedOrNull(v?: number, digits = 7): string | null {
    return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : null;
  }
  // ------------------------------------------------

  /** Đăng ký shop: kiểm tra tên, tạo shop + stats, đổi role -> SELLER */
  async registerForUser(userId: number, dto: CreateShopDto) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const existed = await this.shopsRepo.findOne({ where: { userId } });
    if (existed) throw new ConflictException('Bạn đã có shop.');

    if (await this.nameExists(dto.name)) {
      throw new ConflictException('Tên shop đã tồn tại.');
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy user.');

    const slug = await this.ensureUniqueSlug(dto.name);

    return this.dataSource.transaction(async (trx) => {
      const shopRepo = trx.getRepository(Shop);
      const statsRepo = trx.getRepository(ShopStats);
      const userRepo = trx.getRepository(User);

      const shop = shopRepo.create({
        userId,
        name: dto.name,
        email: dto.email,
        description: dto.description,
        slug,
        status: ShopStatus.PENDING,
        // ---- address fields ----
        shopAddress: dto.shopAddress,
        shopLat: this.toFixedOrNull(dto.shopLat),
        shopLng: this.toFixedOrNull(dto.shopLng),
        shopPlaceId: dto.shopPlaceId,
        shopPhone: dto.shopPhone,
      });
      await shopRepo.save(shop);

      const stats = statsRepo.create({
        shopId: shop.id,
        productCount: 0,
        totalSold: 0,
      });
      await statsRepo.save(stats);

      if (user.role !== UserRole.SELLER) {
        user.role = UserRole.SELLER;
        await userRepo.save(user);
      }

      const productCount = stats.productCount ?? 0;
      const totalRevenue = Number(stats.totalRevenue ?? 0);
      const totalOrders = stats.totalOrders ?? 0;
      const totalSold = stats.totalSold ?? 0;

      return {
        ...shop,
        stats,
        productCount,
        totalRevenue,
        totalOrders,
        totalSold,
      };
    });
  }

  /** Danh sách shop (phân trang + search) + kèm stats */
  async findAll(query: QueryShopDto) {
    const { q, status, page = 1, limit = 20 } = query;

    const LikeInsensitive = (s: string) => ILike(`%${s}%`);

    const where = q
      ? [
          { name: LikeInsensitive(q),        ...(status ? { status } : {}) },
          { email: LikeInsensitive(q),       ...(status ? { status } : {}) },
          { shopAddress: LikeInsensitive(q), ...(status ? { status } : {}) },
          { shopPhone: LikeInsensitive(q),   ...(status ? { status } : {}) },
        ]
      : (status ? { status } : {});

    const [items, total] = await this.shopsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { stats: true },
    });

    const mapped = items.map((shop) => {
      const stats = shop.stats;
      const { stats: _ignored, ...plainShop } = shop as any;

      const productCount = stats?.productCount ?? 0;
      const totalRevenue = Number(stats?.totalRevenue ?? 0);
      const totalOrders = stats?.totalOrders ?? 0;
      const totalSold = stats?.totalSold ?? 0;

      return {
        ...plainShop,
        stats,
        productCount,
        totalRevenue,
        totalOrders,
        totalSold,
      };
    });

    return { items: mapped, page, limit, total };
  }

  /** Shop của tài khoản đang login (kèm thống kê) */
  async findMine(userId: number) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      relations: { stats: true },
    });
    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    if (!shop.stats) {
      const stats = this.statsRepo.create({
        shopId: shop.id,
        productCount: 0,
        totalSold: 0,
        totalRevenue: 0,
        totalOrders: 0,
      });
      shop.stats = await this.statsRepo.save(stats);
    }

    const stats = shop.stats;
    const { stats: _ignored, ...plainShop } = shop as any;

    const productCount = stats?.productCount ?? 0;
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const totalOrders = stats?.totalOrders ?? 0;
    const totalSold = stats?.totalSold ?? 0;

    return {
      ...plainShop,
      stats,
      productCount,
      totalRevenue,
      totalOrders,
      totalSold,
    };
  }

  /** Lấy 1 shop theo id (kèm stats) */
  async findOne(id: number) {
    const shop = await this.shopsRepo.findOne({
      where: { id },
      relations: { stats: true },
    });
    if (!shop) throw new NotFoundException('Không tìm thấy shop.');

    const stats = shop.stats;
    const { stats: _ignored, ...plainShop } = shop as any;

    const productCount = stats?.productCount ?? 0;
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const totalOrders = stats?.totalOrders ?? 0;
    const totalSold = stats?.totalSold ?? 0;

    return {
      ...plainShop,
      stats,
      productCount,
      totalRevenue,
      totalOrders,
      totalSold,
    };
  }

  /** Cập nhật shop: chỉ chủ shop hoặc ADMIN */
  async updateShop(id: number, actorId: number, actorRole: UserRole, dto: UpdateShopDto) {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Không tìm thấy shop.');

    const isOwner = shop.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa shop này.');
    }

    if (dto.name && dto.name.trim() && dto.name.trim() !== shop.name) {
      if (await this.nameExists(dto.name, id)) {
        throw new ConflictException('Tên shop đã tồn tại.');
      }
      shop.name = dto.name.trim();
      shop.slug = await this.ensureUniqueSlug(shop.name, id);
    }

    if (dto.email !== undefined)       shop.email = dto.email;
    if (dto.description !== undefined) shop.description = dto.description;

    if (dto.shopAddress !== undefined) shop.shopAddress = dto.shopAddress;
    if (dto.shopLat !== undefined)     shop.shopLat     = this.toFixedOrNull(dto.shopLat);
    if (dto.shopLng !== undefined)     shop.shopLng     = this.toFixedOrNull(dto.shopLng);
    if (dto.shopPlaceId !== undefined) shop.shopPlaceId = dto.shopPlaceId;
    if (dto.shopPhone !== undefined)   shop.shopPhone   = dto.shopPhone;

    if (dto.status !== undefined) {
      if (!isAdmin) throw new ForbiddenException('Chỉ ADMIN được đổi trạng thái shop.');
      shop.status = dto.status;
    }

    await this.shopsRepo.save(shop);

    const stats = await this.statsRepo.findOne({ where: { shopId: shop.id } });

    const productCount = stats?.productCount ?? 0;
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const totalOrders = stats?.totalOrders ?? 0;
    const totalSold = stats?.totalSold ?? 0;

    return {
      ...shop,
      stats,
      productCount,
      totalRevenue,
      totalOrders,
      totalSold,
    };
  }

  /** Xóa shop (hard delete) -> CASCADE xóa products/images/variants, đổi role SELLER -> USER */
  async removeShop(id: number, actorId: number, actorRole: UserRole) {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Không tìm thấy shop.');

    const isOwner = shop.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền xóa shop này.');
    }

    await this.dataSource.transaction(async (trx) => {
      const shopRepo = trx.getRepository(Shop);
      const userRepo = trx.getRepository(User);

      await shopRepo.delete({ id });

      const owner = await userRepo.findOne({ where: { id: shop.userId } });
      if (owner && owner.role === UserRole.SELLER) {
        owner.role = UserRole.USER;
        await userRepo.save(owner);
      }
    });

    return { success: true };
  }

  /** Chỉ cập nhật URL logo (đã được upload ở controller) */
  async updateLogoUrl(userId: number, logoUrl: string) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      relations: { stats: true },
    });
    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    shop.logoUrl = logoUrl;
    await this.shopsRepo.save(shop);

    const stats = shop.stats;
    const productCount = stats?.productCount ?? 0;
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const totalOrders = stats?.totalOrders ?? 0;
    const totalSold = stats?.totalSold ?? 0;

    return {
      ...shop,
      stats,
      productCount,
      totalRevenue,
      totalOrders,
      totalSold,
    };
  }

  /** Chỉ cập nhật URL cover (đã được upload ở controller) */
  async updateCoverUrl(userId: number, coverUrl: string) {
    if (!userId) throw new ForbiddenException('Không xác định được user từ token.');

    const shop = await this.shopsRepo.findOne({
      where: { userId },
      relations: { stats: true },
    });
    if (!shop) throw new NotFoundException('Bạn chưa có shop.');

    shop.coverUrl = coverUrl;
    await this.shopsRepo.save(shop);

    const stats = shop.stats;
    const productCount = stats?.productCount ?? 0;
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const totalOrders = stats?.totalOrders ?? 0;
    const totalSold = stats?.totalSold ?? 0;

    return {
      ...shop,
      stats,
      productCount,
      totalRevenue,
      totalOrders,
      totalSold,
    };
  }
}
