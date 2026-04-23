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
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';

import { Product, ProductStatus } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';

import { Shop, ShopStatus } from '../../modules/shops/entities/shop.entity';
import { ShopStats } from '../../modules/shops/entities/shop-stats.entity';
import { Category } from '../categories/entities/category.entity';
import { UserRole } from '../users/enums/user.enum';

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

  private isUniqueViolation(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || /unique/i.test(e?.message ?? '');
  }

  private slugify(input: string): string {
    const base = (input ?? '')
      .trim()
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

  private mergeOptionSchema(oldSchema: Opt[], incoming: Opt[]): Opt[] {
    const byKey = new Map<
      string,
      { displayName: string; values: string[]; valueSet: Set<string> }
    >();

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

  private async resolveCategoryId(input: any): Promise<number | null | undefined> {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const id = Number(input);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('categoryId không hợp lệ');
    }

    const cat = await this.categoriesRepo.findOne({
      where: { id, isActive: true, deletedAt: IsNull() } as any,
    });

    if (!cat) {
      throw new BadRequestException('categoryId không tồn tại hoặc đang bị tắt');
    }

    return cat.id;
  }

  private async attachMainImage(items: Product[]) {
    if (!items.length) return [];

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

    return items.map((p) => ({
      ...p,
      mainImageUrl: map.get(p.id) ?? null,
    }));
  }

  private mapVariantRows(schema: Opt[], variants: ProductVariant[]) {
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

  private async assertCanManageProduct(
    productId: number,
    actorId: number,
    actorRole: UserRole,
  ) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    if (actorRole === UserRole.ADMIN) return product;

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    if (!isOwner) throw new ForbiddenException('Bạn không có quyền');

    return product;
  }

  private async assertPublicProduct(productId: number) {
    const product = await this.productsRepo.findOne({
      where: { id: productId, status: ProductStatus.ACTIVE },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    if (!shop || shop.status !== ShopStatus.ACTIVE) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    return product;
  }

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
          title: dto.title.trim(),
          slug,
          description: dto.description?.trim() || null,
          price: Number((+dto.price).toFixed(2)),
          stock: dto.stock ?? 0,
          status: ProductStatus.ACTIVE,
          optionSchema: null,
          publishedAt: new Date(),
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
      if (this.isUniqueViolation(e)) {
        throw new ConflictException('Slug hoặc SKU đã tồn tại.');
      }
      throw e;
    }
  }

  async findAllBasic(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page || 1));
    const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));

    const [items, total] = await this.productsRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      items: await this.attachMainImage(items),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async findPublic(query: QueryProductsDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const q = (query.q ?? '').trim();

    const qb = this.productsRepo
      .createQueryBuilder('p')
      .innerJoin(Shop, 'shop', 'shop.id = p.shopId')
      .where('p.status = :productStatus', { productStatus: ProductStatus.ACTIVE })
      .andWhere('shop.status = :shopStatus', { shopStatus: ShopStatus.ACTIVE });

    if (query.shopId) {
      qb.andWhere('p.shopId = :shopId', { shopId: query.shopId });
    }

    if (query.categoryId) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    }

    if (q) {
      qb.andWhere('(p.title LIKE :q OR p.slug LIKE :q)', { q: `%${q}%` });
    }

    qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: await this.attachMainImage(items),
      page,
      limit,
      total,
    };
  }

  async findByShop(shopId: number, page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page || 1));
    const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));

    const [items, total] = await this.productsRepo.findAndCount({
      where: { shopId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      items: await this.attachMainImage(items),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async findOnePublic(id: number) {
    const product = await this.assertPublicProduct(id);

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
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    if ((patch as any).categoryId !== undefined) {
      const resolved = await this.resolveCategoryId((patch as any).categoryId);
      product.categoryId = resolved === undefined ? product.categoryId : resolved;
    }

    if (patch.title !== undefined && patch.title.trim()) {
      product.title = patch.title.trim();
      if (!patch.slug) {
        product.slug = await this.ensureUniqueSlug(product.title, product.id);
      }
    }

    if (patch.slug !== undefined && patch.slug.trim()) {
      product.slug = await this.ensureUniqueSlug(patch.slug.trim(), product.id);
    }

    if (patch.description !== undefined) {
      product.description = patch.description?.trim() || null;
    }

    if (patch.price !== undefined) {
      product.price = Number((+patch.price).toFixed(2));
    }

    if (patch.stock !== undefined) {
      product.stock = +patch.stock;
    }

    if (patch.status !== undefined) {
      product.status = patch.status;

      if (patch.status === ProductStatus.ACTIVE && !product.publishedAt) {
        product.publishedAt = new Date();
      }

      if (patch.status === ProductStatus.DRAFT) {
        product.publishedAt = null;
      }
    }

    try {
      return await this.productsRepo.save(product);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Slug đã tồn tại');
      throw e;
    }
  }

  async removeProduct(id: number, actorId: number, actorRole: UserRole) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    if (!shop) throw new NotFoundException('Không tìm thấy shop');

    await this.dataSource.transaction(async (trx) => {
      const productRepo = trx.getRepository(Product);
      const statsRepo = trx.getRepository(ShopStats);

      await productRepo.delete({ id });

      const stats = await statsRepo.findOne({ where: { shopId: shop.id } });
      if (stats && stats.productCount > 0) {
        stats.productCount -= 1;
        await statsRepo.save(stats);
      }
    });

    return { success: true };
  }

  async generateVariants(
    productId: number,
    actorId: number,
    actorRole: UserRole,
    dto: GenerateVariantsDto,
  ) {
    const product = await this.assertCanManageProduct(productId, actorId, actorRole);

    const incoming = this.normalizeOptions(dto.options ?? []);
    if (!incoming.length) {
      throw new BadRequestException('Danh sách option không hợp lệ');
    }

    const defaultImage =
      (await this.imagesRepo.findOne({
        where: { productId, isMain: true },
      })) ||
      (await this.imagesRepo.findOne({
        where: { productId },
        order: { id: 'ASC' },
      }));

    const defaultImageId = defaultImage?.id ?? null;
    const mode = dto.mode ?? 'replace';

    try {
      return await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const variantRepo = trx.getRepository(ProductVariant);

        const freshProduct = await productRepo.findOne({ where: { id: productId } });
        if (!freshProduct) throw new NotFoundException('Không tìm thấy sản phẩm');

        const currentSchema: Opt[] = Array.isArray(freshProduct.optionSchema)
          ? (freshProduct.optionSchema as Opt[])
          : [];

        const mergedSchema =
          mode === 'replace'
            ? incoming
            : this.mergeOptionSchema(currentSchema, incoming);

        freshProduct.optionSchema = mergedSchema;
        await productRepo.save(freshProduct);

        if (mode === 'replace') {
          await variantRepo.delete({ product: { id: productId } as any });
        }

        const existing = await variantRepo.find({
          where: { product: { id: productId } },
          order: { id: 'ASC' },
        });

        const existingKeys = new Set(
          existing.map((v) =>
            this.buildCombKey([v.value1, v.value2, v.value3, v.value4, v.value5]),
          ),
        );

        const combos = this.cartesian(mergedSchema.map((o) => o.values));
        const filteredCombos =
          mode === 'add'
            ? combos.filter((c) => !existingKeys.has(this.buildCombKey(c)))
            : combos;

        if (filteredCombos.length > 5000) {
          throw new BadRequestException('Quá nhiều biến thể (tối đa 5000).');
        }

        let skuCounter = existing.reduce((max, v) => {
          const match = v.sku?.match(new RegExp(`^P${productId}-(\\d+)$`));
          const seq = match ? Number(match[1]) : 0;
          return Math.max(max, seq);
        }, 0);

        const newVariants = filteredCombos.map((combo) => {
          skuCounter += 1;

          const [v1, v2, v3, v4, v5] = combo;
          const name = combo.join(' / ');

          return variantRepo.create({
            product: freshProduct,
            sku: `P${productId}-${String(skuCounter).padStart(4, '0')}`,
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

        const schema: Opt[] = Array.isArray(freshProduct.optionSchema)
          ? (freshProduct.optionSchema as Opt[])
          : [];

        return this.mapVariantRows(schema, all as ProductVariant[]);
      });
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại.');
      }
      throw e;
    }
  }

  async listPublicVariants(productId: number) {
    const product = await this.assertPublicProduct(productId);

    const schema: Opt[] = Array.isArray(product.optionSchema)
      ? (product.optionSchema as Opt[])
      : [];

    const variants = await this.variantsRepo.find({
      where: { product: { id: productId } },
      order: { id: 'ASC' },
    });

    return this.mapVariantRows(schema, variants as ProductVariant[]);
  }

  async listVariants(productId: number, actorId: number, actorRole: UserRole) {
    const product = await this.assertCanManageProduct(productId, actorId, actorRole);

    const schema: Opt[] = Array.isArray(product.optionSchema)
      ? (product.optionSchema as Opt[])
      : [];

    const variants = await this.variantsRepo.find({
      where: { product: { id: productId } },
      order: { id: 'ASC' },
    });

    return this.mapVariantRows(schema, variants as ProductVariant[]);
  }

  async updateVariant(
    productId: number,
    variantId: number,
    actorId: number,
    actorRole: UserRole,
    dto: UpdateVariantDto,
  ) {
    await this.assertCanManageProduct(productId, actorId, actorRole);

    const variant = await this.variantsRepo.findOne({
      where: { id: variantId, product: { id: productId } },
    });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể');

    if (dto.name !== undefined) variant.name = dto.name.trim();
    if (dto.sku !== undefined) variant.sku = dto.sku.trim();
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
        if (img.productId !== productId) {
          throw new BadRequestException('Ảnh không thuộc sản phẩm này');
        }

        variant.imageId = dto.imageId;
      }
    }

    try {
      return await this.variantsRepo.save(variant);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      }
      throw e;
    }
  }
}