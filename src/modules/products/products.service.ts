import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { Product, ProductStatus } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Shop, ShopStatus } from '../../modules/shops/entities/shop.entity';
import { ShopStats } from '../../modules/shops/entities/shop-stats.entity';
import { UserRole } from '../../modules/users/entities/user.entity';
import { UpdateProductDto } from './dto/search-product.dto';
import { Category } from '../categories/entities/category.entity';
import { QueryProductsDto } from './dto/query-products.dto';

// Kiểu option đơn giản dùng trong service
type Opt = { name: string; values: string[] };

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductImage) private readonly imagesRepo: Repository<ProductImage>,
    @InjectRepository(ProductVariant) private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(ShopStats) private readonly statsRepo: Repository<ShopStats>,
    @InjectRepository(Category) private readonly categoriesRepo: Repository<Category>,
  ) {}

  // ===== helpers =====
  private isUniqueViolation(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || /unique/i.test(e?.message ?? '');
  }

  private slugify(input: string): string {
    const base = (input ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'product';
  }

  private async ensureUniqueSlug(base: string, ignoreId?: number): Promise<string> {
    const slugBase = this.slugify(base);
    let candidate = slugBase;
    let suffix = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await this.productsRepo.exists({
        where: {
          slug: candidate,
          ...(ignoreId ? { id: Not(ignoreId) } : {}),
        },
      });
      if (!exists) return candidate;
      suffix += 1;
      candidate = `${slugBase}-${suffix}`;
    }
  }

  private cartesian<T>(lists: T[][]): T[][] {
    if (!lists.length) return [];
    return lists.reduce<T[][]>(
      (acc, curr) =>
        acc
          .map((a) => curr.map((b) => [...a, b]))
          .reduce((p, c) => [...p, ...c], []),
      [[]],
    );
  }

  private normForMatch(input: string | null | undefined): string | null {
    if (!input) return null;
    return input
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private buildCombKey(values: (string | null | undefined)[]) {
    return values.map((v) => this.normForMatch(v ?? '') ?? '').join('#');
  }

  private normalizeOptions(input: Opt[]): Opt[] {
    const cleaned = (input ?? [])
      .map((o) => ({
        name: (o.name ?? '').trim(),
        values: (o.values ?? [])
          .map((v) => (v ?? '').trim())
          .filter(Boolean),
      }))
      .filter((o) => o.name && o.values.length > 0);

    const byKey = new Map<string, { displayName: string; values: string[] }>();

    for (const o of cleaned) {
      const key = this.normForMatch(o.name)!;
      if (!byKey.has(key)) {
        byKey.set(key, { displayName: o.name, values: [] });
      }
      const bucket = byKey.get(key)!;
      const seen = new Set(bucket.values.map((v) => this.normForMatch(v)!));
      for (const v of o.values) {
        const k = this.normForMatch(v)!;
        if (seen.has(k)) continue;
        seen.add(k);
        bucket.values.push(v);
      }
    }

    return Array.from(byKey.values())
      .slice(0, 5)
      .map((b) => ({ name: b.displayName, values: b.values }));
  }

  // Hợp nhất schema cũ + mới theo tên option (so khớp không phân biệt hoa/thường)
  private mergeOptionSchema(oldSchema: Opt[], incoming: Opt[]): Opt[] {
    const byKey = new Map<
      string,
      { displayName: string; values: string[]; valueSet: Set<string> }
    >();

    // nạp schema cũ
    for (const o of oldSchema.slice(0, 5)) {
      const k = this.normForMatch(o.name)!;
      const seen = new Set<string>();
      const values: string[] = [];
      for (const v of o.values) {
        const key = this.normForMatch(v);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        values.push(v);
      }
      byKey.set(k, { displayName: o.name, values, valueSet: seen });
    }

    // nạp thêm từ schema mới
    for (const o of incoming.slice(0, 5)) {
      const key = this.normForMatch(o.name);
      if (!key) continue;

      if (!byKey.has(key)) {
        const seen = new Set<string>();
        const values: string[] = [];
        for (const v of o.values) {
          const k2 = this.normForMatch(v);
          if (!k2 || seen.has(k2)) continue;
          seen.add(k2);
          values.push(v);
        }
        byKey.set(key, { displayName: o.name, values, valueSet: seen });
        continue;
      }

      const bucket = byKey.get(key)!;
      for (const v of o.values) {
        const k2 = this.normForMatch(v);
        if (!k2 || bucket.valueSet.has(k2)) continue;
        bucket.valueSet.add(k2);
        bucket.values.push(v);
      }
    }

    return Array.from(byKey.values())
      .slice(0, 5)
      .map((b) => ({ name: b.displayName, values: b.values }));
  }

  /**
   * Validate categoryId:
   * - undefined => không đổi / không set
   * - null => gỡ category
   * - number => phải tồn tại + isActive + chưa soft-delete
   */
  private async resolveCategoryId(input: any): Promise<number | null | undefined> {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const id = Number(input);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('categoryId không hợp lệ');
    }

    // Nếu bạn dùng soft-delete, TS không cho deletedAt: null -> dùng IsNull()
    const cat = await this.categoriesRepo.findOne({
      where: { id, isActive: true, deletedAt: IsNull() } as any,
    });

    // Nếu bạn không có deletedAt trong Category entity, dùng cái này thay:
    // const cat = await this.categoriesRepo.findOne({ where: { id, isActive: true } });

    if (!cat) {
      throw new BadRequestException('categoryId không tồn tại hoặc đang bị tắt');
    }
    return cat.id;
  }

  // ===== product =====

  async createBySeller(userId: number, dto: CreateProductDto) {
    const shop = await this.shopsRepo.findOne({ where: { userId } });
    if (!shop) throw new ForbiddenException('Bạn chưa có shop.');
    if (shop.status !== ShopStatus.ACTIVE) {
      throw new ForbiddenException('Shop của bạn đang chờ ADMIN phê duyệt hoặc đang bị tạm khoá.');
    }

    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.title);
    const categoryId = await this.resolveCategoryId((dto as any).categoryId);

    try {
      return await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const imageRepo = trx.getRepository(ProductImage);
        const statsRepo = trx.getRepository(ShopStats);

        const product = productRepo.create({
          shopId: shop.id,
          categoryId: categoryId ?? null,
          title: dto.title,
          slug,
          description: dto.description ?? null,
          price: Number((+dto.price).toFixed(2)),
          stock: dto.stock ?? 0,
          status: ProductStatus.ACTIVE,
          optionSchema: null,
        });

        const saved = await productRepo.save(product);

        if (dto.images?.length) {
          const images = dto.images.map((url, idx) =>
            imageRepo.create({
              productId: saved.id,
              url,
              position: idx,
              isMain: idx === 0,
            }),
          );
          await imageRepo.save(images);
        }

        let stats = await statsRepo.findOne({ where: { shopId: shop.id } });
        if (!stats) {
          stats = statsRepo.create({
            shopId: shop.id,
            productCount: 0,
            totalSold: 0,
            totalRevenue: 0,
            totalOrders: 0,
          });
        }
        stats.productCount += 1;
        await statsRepo.save(stats);

        return saved;
      });
    } catch (e) {
      if (this.isUniqueViolation(e))
        throw new ConflictException('Slug hoặc SKU đã tồn tại.');
      throw e;
    }
  }

  // Lấy danh sách sản phẩm kèm ảnh đại diện (isMain) – dùng cho trang list
  async findAllBasic(page = 1, limit = 20) {
    const [items, total] = await this.productsRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (!items.length) {
      return { items: [], page, limit, total };
    }

    const ids = items.map((p) => p.id);
    const mainImages = await this.imagesRepo.find({
      where: { productId: In(ids), isMain: true },
    });

    const map = new Map<number, string>();
    for (const img of mainImages) {
      if (!map.has(img.productId)) {
        map.set(img.productId, img.url);
      }
    }

    const itemsWithImage = items.map((p) => ({
      ...p,
      mainImageUrl: map.get(p.id) ?? null,
    }));

    return { items: itemsWithImage, page, limit, total };
  }

  // Public list có filter theo query (q/status/shopId/categoryId)
  async findPublic(query: QueryProductsDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));

    const qb = this.productsRepo.createQueryBuilder('p');

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.shopId) {
      qb.andWhere('p.shopId = :shopId', { shopId: query.shopId });
    }
    if (query.categoryId) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    }

    const q = (query.q ?? '').trim();
    if (q) {
      qb.andWhere('(p.title LIKE :q OR p.slug LIKE :q)', { q: `%${q}%` });
    }

    qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    if (!items.length) return { items: [], page, limit, total };

    const ids = items.map((p) => p.id);
    const mainImages = await this.imagesRepo.find({
      where: { productId: In(ids), isMain: true },
    });

    const map = new Map<number, string>();
    for (const img of mainImages) {
      if (!map.has(img.productId)) map.set(img.productId, img.url);
    }

    const itemsWithImage = items.map((p) => ({
      ...p,
      mainImageUrl: map.get(p.id) ?? null,
    }));

    return { items: itemsWithImage, page, limit, total };
  }

  // Lấy danh sách sản phẩm theo shopId, cũng kèm ảnh đại diện
  async findByShop(shopId: number, page = 1, limit = 20) {
    const [items, total] = await this.productsRepo.findAndCount({
      where: { shopId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (!items.length) {
      return { items: [], page, limit, total };
    }

    const ids = items.map((p) => p.id);
    const mainImages = await this.imagesRepo.find({
      where: { productId: In(ids), isMain: true },
    });

    const map = new Map<number, string>();
    for (const img of mainImages) {
      if (!map.has(img.productId)) {
        map.set(img.productId, img.url);
      }
    }

    const itemsWithImage = items.map((p) => ({
      ...p,
      mainImageUrl: map.get(p.id) ?? null,
    }));

    return { items: itemsWithImage, page, limit, total };
  }

  // Lấy chi tiết 1 sản phẩm + toàn bộ images
  async findOnePublic(id: number) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const images = await this.imagesRepo.find({
      where: { productId: id },
      order: { position: 'ASC', id: 'ASC' },
    });

    return { ...product, images };
  }

  async updateProduct(
    id: number,
    actorId: number,
    actorRole: UserRole,
    patch: UpdateProductDto & { categoryId?: number | null },
  ) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({
      where: { id: product.shopId },
    });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    // category
    if ((patch as any).categoryId !== undefined) {
      const resolved = await this.resolveCategoryId((patch as any).categoryId);
      // resolved undefined sẽ không vào đây vì patch.categoryId !== undefined
      product.categoryId = resolved === undefined ? product.categoryId : resolved;
    }

    if (patch.title && patch.title.trim()) {
      product.title = patch.title.trim();
      if (!patch.slug) {
        product.slug = await this.ensureUniqueSlug(product.title, product.id);
      }
    }
    if (patch.slug && patch.slug.trim()) {
      product.slug = await this.ensureUniqueSlug(patch.slug, product.id);
    }
    if (patch.description !== undefined) product.description = patch.description;
    if (patch.price !== undefined) product.price = Number((+patch.price).toFixed(2));
    if (patch.stock !== undefined) product.stock = +patch.stock;
    if (patch.status !== undefined) product.status = patch.status;

    try {
      return await this.productsRepo.save(product);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Slug đã tồn tại');
      throw e;
    }
  }

  async removeProduct(id: number, actorId: number, actorRole: UserRole) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    await this.dataSource.transaction(async (trx) => {
      const productRepo = trx.getRepository(Product);
      const statsRepo = trx.getRepository(ShopStats);

      await productRepo.delete({ id });

      const stats = await statsRepo.findOne({ where: { shopId: shop!.id } });
      if (stats && stats.productCount > 0) {
        stats.productCount -= 1;
        await statsRepo.save(stats);
      }
    });

    return { success: true };
  }

  // ===== variants =====

  async generateVariants(
    productId: number,
    actorId: number,
    actorRole: UserRole,
    dto: GenerateVariantsDto,
  ) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    const incoming = this.normalizeOptions(dto.options ?? []);
    if (!incoming.length) throw new BadRequestException('Danh sách option không hợp lệ');

    const defaultImage = await this.imagesRepo.findOne({
      where: { productId },
      order: { id: 'ASC' },
    });
    const defaultImageId = defaultImage?.id ?? null;

    const mode = dto.mode ?? 'replace';

    try {
      return await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const variantRepo = trx.getRepository(ProductVariant);

        const freshProduct = await productRepo.findOne({ where: { id: productId } });
        if (!freshProduct) throw new NotFoundException('Không tìm thấy sản phẩm');

        const currentSchema: Opt[] = (freshProduct.optionSchema as any) ?? [];
        let mergedSchema: Opt[];

        if (mode === 'replace') {
          mergedSchema = incoming;
        } else {
          mergedSchema = this.mergeOptionSchema(currentSchema, incoming);
        }

        freshProduct.optionSchema = mergedSchema;
        await productRepo.save(freshProduct);

        // Nếu replace → xoá hết variants cũ theo product
        if (mode === 'replace') {
          await variantRepo.delete({
            product: { id: productId } as any,
          });
        }

        // Lấy các variant hiện tại để tránh trùng tổ hợp
        const existing = await variantRepo.find({
          where: { product: { id: productId } },
        });

        const existingKeys = new Set(
          existing.map((v) =>
            this.buildCombKey([v.value1, v.value2, v.value3, v.value4, v.value5]),
          ),
        );

        const lists = mergedSchema.map((o) => o.values);
        const combos = this.cartesian(lists);

        let filteredCombos = combos;
        if (mode === 'add') {
          filteredCombos = combos.filter((c) => {
            const key = this.buildCombKey(c);
            return !existingKeys.has(key);
          });
        }

        if (filteredCombos.length > 5000) {
          throw new BadRequestException('Quá nhiều biến thể (tối đa 5000).');
        }

        const currentCount = await variantRepo.count({
          where: { product: { id: productId } },
        });
        let counter = currentCount;

        const newVariants = filteredCombos.map((combo) => {
          counter += 1;
          const sku = `P${productId}-${String(counter).padStart(4, '0')}`;
          const [v1, v2, v3, v4, v5] = combo;
          const name = combo.join(' / ');

          return variantRepo.create({
            product: freshProduct, // dùng quan hệ, không dùng productId
            sku,
            name,
            price:
              freshProduct.price !== null && freshProduct.price !== undefined
                ? String(freshProduct.price)
                : null,
            stock: 0,
            imageId: defaultImageId,
            value1: v1 ?? null,
            value2: v2 ?? null,
            value3: v3 ?? null,
            value4: v4 ?? null,
            value5: v5 ?? null,
          });
        });

        if (newVariants.length) {
          await variantRepo.save(newVariants);
        }

        const all = await variantRepo.find({
          where: { product: { id: productId } },
          order: { id: 'ASC' },
        });

        return all;
      });
    } catch (e) {
      if (this.isUniqueViolation(e))
        throw new ConflictException('Slug hoặc SKU đã tồn tại.');
      throw e;
    }
  }

  async listVariants(productId: number, actorId: number, actorRole: UserRole) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const schema: Opt[] = (product.optionSchema as any) ?? [];
    const variants = await this.variantsRepo.find({
      where: { product: { id: productId } },
      order: { id: 'ASC' },
    });

    return variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      price: v.price,
      stock: v.stock,
      imageId: v.imageId,
      options: schema.map((opt, idx) => ({
        option: opt.name,
        value: [v.value1, v.value2, v.value3, v.value4, v.value5][idx] ?? null,
      })),
    }));
  }

  async updateVariant(
    productId: number,
    variantId: number,
    actorId: number,
    actorRole: UserRole,
    dto: UpdateVariantDto,
  ) {
    const variant = await this.variantsRepo.findOne({
      where: { id: variantId, product: { id: productId } },
    });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể');

    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    if (dto.name !== undefined) variant.name = dto.name;
    if (dto.sku !== undefined) variant.sku = dto.sku;
    if (dto.price !== undefined) variant.price = (+dto.price as any).toFixed(2);  
    if (dto.stock !== undefined) variant.stock = +dto.stock;

    if (dto.imageId !== undefined) {
      if (dto.imageId === null) {
        variant.imageId = null;
      } else {
        const img = await this.imagesRepo.findOne({
          where: { id: dto.imageId },
        });
        if (!img) throw new NotFoundException('Không tìm thấy ảnh');
        if (img.productId !== productId)
          throw new BadRequestException('Ảnh không thuộc sản phẩm này');
        variant.imageId = dto.imageId;
      }
    }

    try {
      return await this.variantsRepo.save(variant);
    } catch (e: any) {
      if (this.isUniqueViolation(e))
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      throw e;
    }
  }
}
