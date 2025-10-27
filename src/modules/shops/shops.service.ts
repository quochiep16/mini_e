import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Not, Repository } from 'typeorm';
import { Shop, ShopStatus } from './entities/shop.entity';
import { ShopStats } from './entities/shop-stats.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { User, UserRole } from '.././users/entities/user.entity';

@Injectable()
export class ShopsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(ShopStats) private readonly statsRepo: Repository<ShopStats>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  private slugify(input: string): string {
    const base = (input ?? '')
      .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    return base || 'shop';
  }

  private async ensureUniqueSlug(base: string, ignoreId?: number) {
    let slug = this.slugify(base);
    let i = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const found = await this.shopsRepo.findOne({
        where: ignoreId
          ? { slug, id: Not(ignoreId) }
          : { slug },
        select: { id: true },
      });
      if (!found) return slug;
      slug = `${this.slugify(base)}-${i++}`;
    }
  }

  /** Kiểm tra trùng tên (không phân biệt hoa/thường) */
  async nameExists(name: string, ignoreId?: number) {
    const found = await this.shopsRepo.findOne({
      where: ignoreId
        ? { name: ILike(name), id: Not(ignoreId) }
        : { name: ILike(name) },
      select: { id: true },
    });
    return !!found;
  }

  /** Đăng ký shop: kiểm tra tên, tạo shop + stats, đổi role -> SELLER */
  async registerForUser(userId: number, dto: CreateShopDto) {
    // 1 user chỉ có 1 shop
    const existed = await this.shopsRepo.findOne({ where: { userId } });
    if (existed) throw new ConflictException('Bạn đã có shop.');

    // kiểm tra trùng tên
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
        userId, name: dto.name, email: dto.email, description: dto.description,
        slug, status: ShopStatus.PENDING,
      });
      await shopRepo.save(shop);

      const stats = statsRepo.create({ shopId: shop.id });
      await statsRepo.save(stats);

      if (user.role !== UserRole.SELLER) {
        user.role = UserRole.SELLER;
        await userRepo.save(user);
      }

      return { ...shop, stats };
    });
  }

  /** Lấy danh sách shop (phân trang + lọc) */
  async findAll(query: QueryShopDto) {
    const { q, status, page = 1, limit = 10 } = query;
    const where: any = {};
    if (q) where.name = ILike(`%${q}%`);
    if (status) where.status = status;
    const [items, total] = await this.shopsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total };
  }

  /** Lấy shop của tài khoản đang login */
  async findMine(userId: number) {
    const shop = await this.shopsRepo.findOne({ where: { userId } });
    if (!shop) throw new NotFoundException('Bạn chưa có shop.');
    return shop;
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

    // Nếu đổi name -> kiểm tra trùng + cập nhật slug duy nhất
    if (dto.name && dto.name.trim() && dto.name.trim() !== shop.name) {
      if (await this.nameExists(dto.name, id)) {
        throw new ConflictException('Tên shop đã tồn tại.');
      }
      shop.name = dto.name.trim();
      shop.slug = await this.ensureUniqueSlug(shop.name, id);
    }

    if (dto.email !== undefined) shop.email = dto.email;
    if (dto.description !== undefined) shop.description = dto.description;

    // Chỉ ADMIN được đổi status
    if (dto.status !== undefined) {
      if (!isAdmin) throw new ForbiddenException('Chỉ ADMIN được đổi trạng thái shop.');
      shop.status = dto.status;
    }

    await this.shopsRepo.save(shop);
    return shop;
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

      // Xóa cứng shop -> FK CASCADE sẽ xóa toàn bộ products/images/variants & shop_stats
      await shopRepo.delete({ id });

      // Đổi role của chủ shop về USER nếu đang là SELLER
      const owner = await userRepo.findOne({ where: { id: shop.userId } });
      if (owner && owner.role === UserRole.SELLER) {
        owner.role = UserRole.USER;
        await userRepo.save(owner);
      }
    });

    return { success: true };
  }
}
