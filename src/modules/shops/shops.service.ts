import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Shop, ShopStatus } from './entities/shop.entity';
import { ShopStats } from './entities/shop-stats.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';

@Injectable()
export class ShopsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(ShopStats) private readonly statsRepo: Repository<ShopStats>,
  ) {}

  private slugify(input: string): string {
    const base = (input ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    return base || 'shop';
  }

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = this.slugify(base);
    let i = 1;
    while (await this.shopsRepo.findOne({ where: { slug } })) {
      slug = `${this.slugify(base)}-${i++}`;
    }
    return slug;
  }

  private toFixedOrNull(v?: number, digits = 7): string | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(digits);
    return null;
  }

  async register(userId: number, dto: CreateShopDto) {
    // 1 user chỉ 1 shop
    const existedByUser = await this.shopsRepo.findOne({ where: { userId } });
    if (existedByUser) throw new ConflictException('Bạn đã có shop.');

    // Tên shop duy nhất
    const existedByName = await this.shopsRepo.findOne({ where: { name: dto.name } });
    if (existedByName) throw new ConflictException('Tên shop đã tồn tại.');

    const slug = await this.ensureUniqueSlug(dto.name);

    return this.dataSource.transaction(async (trx) => {
      const shopRepo = trx.getRepository(Shop);
      const userRepo = trx.getRepository(User);
      const statsRepo = trx.getRepository(ShopStats);

      const shop = shopRepo.create({
        userId,
        name: dto.name,
        slug,
        description: dto.description ?? null,
        email: dto.email ?? null,
        status: ShopStatus.PENDING,

        shopAddress: dto.shopAddress ?? null,
        shopLat: this.toFixedOrNull(dto.shopLat),
        shopLng: this.toFixedOrNull(dto.shopLng),
        shopPlaceId: dto.shopPlaceId ?? null,
        shopPhone: dto.shopPhone ?? null,
      });

      const saved = await shopRepo.save(shop);

      // tạo stats mặc định
      const stats = statsRepo.create({ shopId: saved.id, productCount: 0, totalSold: 0 });
      await statsRepo.save(stats);

      // nâng role USER -> SELLER
      await userRepo.update({ id: userId }, { role: UserRole.SELLER });

      return saved;
    });
  }

  async findAll(q: QueryShopDto) {
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 20);

    const where: any = {};
    if (q.q) where.name = ILike(`%${q.q}%`);
    if (q.status) where.status = q.status;

    const [items, total] = await this.shopsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total };
  }

  async findMine(userId: number) {
    const shop = await this.shopsRepo.findOne({ where: { userId } });
    if (!shop) throw new NotFoundException('Bạn chưa có shop.');
    return shop;
  }

  async update(shopId: number, actorId: number, actorRole: UserRole, dto: UpdateShopDto) {
    const shop = await this.shopsRepo.findOne({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop không tồn tại');

    const isOwner = shop.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền sửa shop này');

    if (dto.name && dto.name !== shop.name) {
      const dup = await this.shopsRepo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException('Tên shop đã tồn tại');
      shop.name = dto.name;
      // Không tự đổi slug khi đổi tên để tránh vỡ link
    }

    shop.email = dto.email ?? shop.email ?? null;
    shop.description = dto.description ?? shop.description ?? null;

    shop.shopAddress = dto.shopAddress ?? shop.shopAddress ?? null;
    shop.shopLat = dto.shopLat !== undefined ? this.toFixedOrNull(dto.shopLat) : shop.shopLat ?? null;
    shop.shopLng = dto.shopLng !== undefined ? this.toFixedOrNull(dto.shopLng) : shop.shopLng ?? null;
    shop.shopPlaceId = dto.shopPlaceId ?? shop.shopPlaceId ?? null;
    shop.shopPhone = dto.shopPhone ?? shop.shopPhone ?? null;

    return this.shopsRepo.save(shop);
  }

  async remove(shopId: number, actorId: number, actorRole: UserRole) {
    const shop = await this.shopsRepo.findOne({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop không tồn tại');

    const isOwner = shop.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền xoá shop này');

    await this.dataSource.transaction(async (trx) => {
      const shopRepo = trx.getRepository(Shop);
      const prodRepo = trx.getRepository(Product);
      const statsRepo = trx.getRepository(ShopStats);
      const userRepo = trx.getRepository(User);

      // Xoá toàn bộ products thuộc shop
      await prodRepo.delete({ shopId: shop.id });

      // Xoá stats (nếu không ràng buộc cascade)
      await statsRepo.delete({ shopId: shop.id });

      // Xoá shop
      await shopRepo.delete({ id: shop.id });

      // Trả role về USER
      await userRepo.update({ id: shop.userId }, { role: UserRole.USER });
    });
  }
}
