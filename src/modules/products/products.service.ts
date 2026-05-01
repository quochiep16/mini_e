import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  DeepPartial,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';

import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

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
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(Shop)
    private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(ShopStats)
    private readonly statsRepo: Repository<ShopStats>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  private isUniqueViolation(error: any) {
    return error?.code === 'ER_DUP_ENTRY' || /unique/i.test(error?.message ?? '');
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
          .reduce((prev, next) => [...prev, ...next], []),
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

    for (const option of cleaned) {
      const key = this.normForMatch(option.name)!;

      if (!byKey.has(key)) {
        byKey.set(key, { displayName: option.name, values: [] });
      }

      const bucket = byKey.get(key)!;
      const seen = new Set(bucket.values.map((v) => this.normForMatch(v)!));

      for (const value of option.values) {
        const valueKey = this.normForMatch(value)!;
        if (seen.has(valueKey)) continue;
        seen.add(valueKey);
        bucket.values.push(value);
      }
    }

    return Array.from(byKey.values())
      .slice(0, 5)
      .map((item) => ({
        name: item.displayName,
        values: item.values,
      }));
  }

  private mergeOptionSchema(oldSchema: Opt[], incoming: Opt[]): Opt[] {
    const byKey = new Map<
      string,
      { displayName: string; values: string[]; valueSet: Set<string> }
    >();

    for (const option of oldSchema.slice(0, 5)) {
      const key = this.normForMatch(option.name)!;
      const seen = new Set<string>();
      const values: string[] = [];

      for (const value of option.values) {
        const valueKey = this.normForMatch(value);
        if (!valueKey || seen.has(valueKey)) continue;
        seen.add(valueKey);
        values.push(value);
      }

      byKey.set(key, {
        displayName: option.name,
        values,
        valueSet: seen,
      });
    }

    for (const option of incoming.slice(0, 5)) {
      const key = this.normForMatch(option.name);
      if (!key) continue;

      if (!byKey.has(key)) {
        const seen = new Set<string>();
        const values: string[] = [];

        for (const value of option.values) {
          const valueKey = this.normForMatch(value);
          if (!valueKey || seen.has(valueKey)) continue;
          seen.add(valueKey);
          values.push(value);
        }

        byKey.set(key, {
          displayName: option.name,
          values,
          valueSet: seen,
        });
        continue;
      }

      const bucket = byKey.get(key)!;
      for (const value of option.values) {
        const valueKey = this.normForMatch(value);
        if (!valueKey || bucket.valueSet.has(valueKey)) continue;
        bucket.valueSet.add(valueKey);
        bucket.values.push(value);
      }
    }

    return Array.from(byKey.values())
      .slice(0, 5)
      .map((item) => ({
        name: item.displayName,
        values: item.values,
      }));
  }

  private async resolveCategoryId(input: any): Promise<number | null | undefined> {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const id = Number(input);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('categoryId không hợp lệ');
    }

    const category = await this.categoriesRepo.findOne({
      where: { id, isActive: true, deletedAt: IsNull() } as any,
    });

    if (!category) {
      throw new BadRequestException('categoryId không tồn tại hoặc đang bị tắt');
    }

    return category.id;
  }

  private async getMainImageMap(productIds: number[]) {
    if (!productIds.length) return new Map<number, string>();

    const mainImages = await this.imagesRepo.find({
      where: { productId: In(productIds), isMain: true },
    });

    const map = new Map<number, string>();
    for (const image of mainImages) {
      if (!map.has(image.productId)) {
        map.set(image.productId, image.url);
      }
    }

    return map;
  }

  private async attachMainImage(items: Product[]) {
    if (!items.length) return [];

    const ids = items.map((item) => item.id);
    const imageMap = await this.getMainImageMap(ids);

    return items.map((item) => ({
      ...item,
      mainImageUrl: imageMap.get(item.id) ?? null,
    }));
  }

  private mapVariantRows(schema: Opt[], variants: ProductVariant[]) {
    return variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price: variant.price,
      stock: variant.stock,
      imageId: variant.imageId,
      options: schema.map((option, index) => ({
        option: option.name,
        value: [
          variant.value1,
          variant.value2,
          variant.value3,
          variant.value4,
          variant.value5,
        ][index] ?? null,
      })),
    }));
  }

  private async assertCanManageProduct(
    productId: number,
    actorId: number,
    actorRole: UserRole,
  ) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    if (actorRole === UserRole.ADMIN) {
      return product;
    }

    const shop = await this.shopsRepo.findOne({
      where: { id: product.shopId },
    });

    if (!shop || shop.userId !== actorId) {
      throw new ForbiddenException('Bạn không có quyền');
    }

    return product;
  }

  private async assertPublicProduct(productId: number) {
    const product = await this.productsRepo.findOne({
      where: {
        id: productId,
        status: ProductStatus.ACTIVE,
      },
      relations: {
        shop: true,
      },
    });

    if (!product || !product.shop || product.shop.status !== ShopStatus.ACTIVE) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    return product;
  }

  private async syncProductStockFromVariants(
    productId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const variantsRepo = manager
      ? manager.getRepository(ProductVariant)
      : this.variantsRepo;

    const productsRepo = manager
      ? manager.getRepository(Product)
      : this.productsRepo;

    const variants = await variantsRepo.find({
      where: { productId } as any,
      order: { id: 'ASC' },
    });

    const totalStock = variants.reduce((sum, variant) => {
      const stock = Number(variant.stock ?? 0);
      return sum + (Number.isFinite(stock) && stock > 0 ? stock : 0);
    }, 0);

    await productsRepo.update({ id: productId } as any, {
      stock: totalStock,
    } as any);

    return totalStock;
  }

  async createBySeller(userId: number, dto: CreateProductDto) {
    const shop = await this.shopsRepo.findOne({ where: { userId } });

    if (!shop) {
      throw new ForbiddenException('Bạn chưa có shop');
    }

    if (shop.status !== ShopStatus.ACTIVE) {
      throw new ForbiddenException('Shop của bạn chưa được duyệt hoặc đang bị khóa');
    }

    const title = dto.title.trim();
    const slug = await this.ensureUniqueSlug(dto.slug ?? title);
    const categoryId = await this.resolveCategoryId((dto as any).categoryId);

    try {
      return await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const imageRepo = trx.getRepository(ProductImage);
        const statsRepo = trx.getRepository(ShopStats);

        const product = productRepo.create({
          shopId: shop.id,
          categoryId: categoryId ?? null,
          title,
          slug,
          description: dto.description?.trim() || null,
          price: Number(Number(dto.price).toFixed(2)),
          stock: 0,
          status: ProductStatus.ACTIVE,
          publishedAt: new Date(),
          optionSchema: null,
        });

        const saved = await productRepo.save(product);

        if (dto.images?.length) {
          const images = dto.images.map((url, index) =>
            imageRepo.create({
              productId: saved.id,
              url,
              position: index,
              isMain: index === 0,
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
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Slug sản phẩm đã tồn tại');
      }
      throw error;
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
      .innerJoin('p.shop', 'shop')
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

    const shop = await this.shopsRepo.findOne({
      where: {
        id: shopId,
        status: ShopStatus.ACTIVE,
      } as any,
    });

    if (!shop) {
      return {
        items: [],
        page: safePage,
        limit: safeLimit,
        total: 0,
      };
    }

    const [items, total] = await this.productsRepo.findAndCount({
      where: {
        shopId,
        status: ProductStatus.ACTIVE,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
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

    return {
      ...product,
      images,
    };
  }

  async listPublicVariants(productId: number) {
    const product = await this.assertPublicProduct(productId);

    const schema: Opt[] = Array.isArray(product.optionSchema)
      ? (product.optionSchema as Opt[])
      : [];

    const variants = await this.variantsRepo.find({
      where: { productId } as any,
      order: { id: 'ASC' },
    });

    return this.mapVariantRows(schema, variants);
  }

  async updateProduct(
    id: number,
    actorId: number,
    actorRole: UserRole,
    patch: UpdateProductDto,
  ) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    if ((patch as any).categoryId !== undefined) {
      const resolvedCategoryId = await this.resolveCategoryId((patch as any).categoryId);
      product.categoryId =
        resolvedCategoryId === undefined ? product.categoryId : resolvedCategoryId;
    }

    if (patch.title !== undefined) {
      const nextTitle = patch.title.trim();
      product.title = nextTitle;

      if (!patch.slug) {
        product.slug = await this.ensureUniqueSlug(nextTitle, product.id);
      }
    }

    if (patch.slug !== undefined) {
      product.slug = await this.ensureUniqueSlug(patch.slug.trim(), product.id);
    }

    if (patch.description !== undefined) {
      product.description = patch.description?.trim() || null;
    }

    if (patch.price !== undefined) {
      product.price = Number(Number(patch.price).toFixed(2));
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
    } catch (error: any) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Slug sản phẩm đã tồn tại');
      }
      throw error;
    }
  }

  async removeProduct(id: number, actorId: number, actorRole: UserRole) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    if (!shop) {
      throw new NotFoundException('Không tìm thấy shop của sản phẩm');
    }

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
    await this.assertCanManageProduct(productId, actorId, actorRole);

    const incoming = this.normalizeOptions(dto.options ?? []);
    if (!incoming.length) {
      throw new BadRequestException('Danh sách option không hợp lệ');
    }

    const mode = dto.mode ?? 'replace';

    try {
      return await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const variantRepo = trx.getRepository(ProductVariant);
        const imageRepo = trx.getRepository(ProductImage);

        const product = await productRepo.findOne({ where: { id: productId } });
        if (!product) {
          throw new NotFoundException('Không tìm thấy sản phẩm');
        }

        const currentSchema: Opt[] = Array.isArray(product.optionSchema)
          ? (product.optionSchema as Opt[])
          : [];

        const mergedSchema =
          mode === 'add'
            ? this.mergeOptionSchema(currentSchema, incoming)
            : incoming;

        const combos = this.cartesian(mergedSchema.map((item) => item.values));
        if (combos.length > 5000) {
          throw new BadRequestException('Quá nhiều biến thể, tối đa 5000 tổ hợp');
        }

        product.optionSchema = mergedSchema;
        await productRepo.save(product);

        let defaultImage = await imageRepo.findOne({
          where: { productId, isMain: true },
        });

        if (!defaultImage) {
          defaultImage = await imageRepo.findOne({
            where: { productId },
            order: { id: 'ASC' },
          });
        }

        const defaultImageId = defaultImage?.id ?? null;

        let existingVariants: ProductVariant[] = [];

        if (mode === 'replace') {
          await variantRepo.delete({ productId } as any);
        } else {
          existingVariants = await variantRepo.find({
            where: { productId } as any,
            order: { id: 'ASC' },
          });
        }

        const existingKeys = new Set(
          existingVariants.map((variant) =>
            this.buildCombKey([
              variant.value1,
              variant.value2,
              variant.value3,
              variant.value4,
              variant.value5,
            ]),
          ),
        );

        const filteredCombos =
          mode === 'add'
            ? combos.filter((combo) => !existingKeys.has(this.buildCombKey(combo)))
            : combos;

        if (!filteredCombos.length) {
          await this.syncProductStockFromVariants(productId, trx);

          return await variantRepo.find({
            where: { productId } as any,
            order: { id: 'ASC' },
          });
        }

        let skuCounter = existingVariants.reduce((max, variant) => {
          const match = variant.sku?.match(new RegExp(`^P${productId}-(\\d+)$`));
          const seq = match ? Number(match[1]) : 0;
          return Math.max(max, seq);
        }, 0);

        const newVariants: DeepPartial<ProductVariant>[] = filteredCombos.map((combo) => {
          skuCounter += 1;

          const [value1, value2, value3, value4, value5] = combo;

          return {
            productId,
            sku: `P${productId}-${String(skuCounter).padStart(4, '0')}`,
            name: combo.join(' / '),
            price:
              product.price !== null && product.price !== undefined
                ? String(product.price)
                : null,
            stock: 0,
            imageId: defaultImageId,
            value1: value1 ?? null,
            value2: value2 ?? null,
            value3: value3 ?? null,
            value4: value4 ?? null,
            value5: value5 ?? null,
          };
        });

        await variantRepo.save(newVariants);
        await this.syncProductStockFromVariants(productId, trx);

        return await variantRepo.find({
          where: { productId } as any,
          order: { id: 'ASC' },
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      }
      throw error;
    }
  }

  async listVariants(productId: number, actorId: number, actorRole: UserRole) {
    const product = await this.assertCanManageProduct(productId, actorId, actorRole);

    const schema: Opt[] = Array.isArray(product.optionSchema)
      ? (product.optionSchema as Opt[])
      : [];

    const variants = await this.variantsRepo.find({
      where: { productId } as any,
      order: { id: 'ASC' },
    });

    return this.mapVariantRows(schema, variants);
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
      where: { id: variantId, productId } as any,
    });

    if (!variant) {
      throw new NotFoundException('Không tìm thấy biến thể');
    }

    if (dto.name !== undefined) {
      variant.name = dto.name.trim();
    }

    if (dto.sku !== undefined) {
      variant.sku = dto.sku.trim().toUpperCase();
    }

    if (dto.price !== undefined) {
      variant.price = Number(dto.price).toFixed(2);
    }

    if (dto.stock !== undefined) {
      variant.stock = Number(dto.stock);
    }

    if (dto.imageId !== undefined) {
      if (dto.imageId === null) {
        variant.imageId = null;
      } else {
        const image = await this.imagesRepo.findOne({
          where: { id: dto.imageId },
        });

        if (!image) {
          throw new NotFoundException('Không tìm thấy ảnh');
        }

        if (image.productId !== productId) {
          throw new BadRequestException('Ảnh không thuộc sản phẩm này');
        }

        variant.imageId = dto.imageId;
      }
    }

    try {
      const saved = await this.variantsRepo.save(variant);
      await this.syncProductStockFromVariants(productId);
      return saved;
    } catch (error: any) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      }
      throw error;
    }
  }
}
