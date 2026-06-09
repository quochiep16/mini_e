import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  DeepPartial,
  EntityManager,
  In,
  IsNull,
  Repository,
} from 'typeorm';

import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

import { Product, ProductStatus } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';

import { Shop, ShopStatus } from '../../modules/shops/entities/shop.entity';
import { ShopStats } from '../../modules/shops/entities/shop-stats.entity';
import { Category } from '../categories/entities/category.entity';
import { UserRole } from '../users/enums/user.enum';
import { RecommendationsService } from '../recommendations/recommendations.service';

type Opt = { name: string; values: string[] };

type ProductWithImages = Product & {
  images?: ProductImage[];
  mainImageUrl?: string | null;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly maxProductImages = 10;

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

    @Optional()
    private readonly recommendationsService?: RecommendationsService,
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
      const qb = this.productsRepo
        .createQueryBuilder('p')
        .withDeleted()
        .where('p.slug = :candidate', { candidate });

      if (ignoreId) {
        qb.andWhere('p.id <> :ignoreId', { ignoreId });
      }

      const exists = await qb.getExists();

      if (!exists) {
        return candidate;
      }

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
        values: (o.values ?? []).map((v) => (v ?? '').trim()).filter(Boolean),
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

  private async getCategoryAndDescendantIds(categoryId: number): Promise<number[]> {
    const id = Number(categoryId);

    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('categoryId không hợp lệ');
    }

    const root = await this.categoriesRepo.findOne({
      where: {
        id,
        isActive: true,
        deletedAt: IsNull(),
      } as any,
    });

    if (!root) {
      throw new BadRequestException('categoryId không tồn tại hoặc đang bị tắt');
    }

    const ids = new Set<number>([id]);
    let currentLevelIds = [id];

    while (currentLevelIds.length > 0) {
      const children = await this.categoriesRepo.find({
        where: {
          parentId: In(currentLevelIds),
          isActive: true,
          deletedAt: IsNull(),
        } as any,
        select: ['id'] as any,
      });

      const nextLevelIds = children
        .map((category) => category.id)
        .filter((childId) => !ids.has(childId));

      for (const childId of nextLevelIds) {
        ids.add(childId);
      }

      currentLevelIds = nextLevelIds;
    }

    return Array.from(ids);
  }

  private quoteIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  private async tableExists(manager: EntityManager, tableName: string): Promise<boolean> {
    const rows = await manager.query(
      `
      SELECT 1 AS ok
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1
      `,
      [tableName],
    );

    return rows.length > 0;
  }

  private async getExistingColumnName(
    manager: EntityManager,
    tableName: string,
    candidates: string[],
  ): Promise<string | null> {
    const rows = await manager.query(
      `
      SELECT column_name AS columnName
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name IN (${candidates.map(() => '?').join(', ')})
      `,
      [tableName, ...candidates],
    );

    const existing = new Set(
      rows.map((row: any) => String(row.columnName ?? row.COLUMN_NAME)),
    );

    return candidates.find((candidate) => existing.has(candidate)) ?? null;
  }

  private async cleanupDeletedProductFromCarts(
    manager: EntityManager,
    productId: number,
  ): Promise<void> {
    const hasCartItems = await this.tableExists(manager, 'cart_items');

    if (!hasCartItems) return;

    const cartIdColumn = await this.getExistingColumnName(manager, 'cart_items', [
      'cartId',
      'cart_id',
    ]);
    const productIdColumn = await this.getExistingColumnName(manager, 'cart_items', [
      'productId',
      'product_id',
    ]);

    if (!cartIdColumn || !productIdColumn) return;

    const cartIdSql = this.quoteIdentifier(cartIdColumn);
    const productIdSql = this.quoteIdentifier(productIdColumn);

    const affectedCarts = await manager.query(
      `
      SELECT DISTINCT ${cartIdSql} AS cartId
      FROM cart_items
      WHERE ${productIdSql} = ?
      `,
      [productId],
    );

    const affectedCartIds = affectedCarts
      .map((row: any) => Number(row.cartId))
      .filter((cartId: number) => Number.isInteger(cartId) && cartId > 0);

    await manager.query(
      `
      DELETE FROM cart_items
      WHERE ${productIdSql} = ?
      `,
      [productId],
    );

    if (!affectedCartIds.length) return;

    const hasCarts = await this.tableExists(manager, 'carts');

    if (!hasCarts) return;

    const quantityColumn = await this.getExistingColumnName(manager, 'cart_items', [
      'quantity',
      'qty',
    ]);
    const priceColumn = await this.getExistingColumnName(manager, 'cart_items', [
      'price',
      'unitPrice',
      'unit_price',
    ]);

    const cartItemsCountColumn = await this.getExistingColumnName(manager, 'carts', [
      'itemsCount',
      'items_count',
    ]);
    const cartItemsQuantityColumn = await this.getExistingColumnName(manager, 'carts', [
      'itemsQuantity',
      'items_quantity',
      'totalQuantity',
      'total_quantity',
    ]);
    const cartSubtotalColumn = await this.getExistingColumnName(manager, 'carts', [
      'subtotal',
      'sub_total',
      'total',
      'totalPrice',
      'total_price',
    ]);

    for (const cartId of affectedCartIds) {
      const quantityExpr = quantityColumn
        ? `COALESCE(SUM(${this.quoteIdentifier(quantityColumn)}), 0)`
        : '0';

      const subtotalExpr =
        quantityColumn && priceColumn
          ? `COALESCE(SUM(${this.quoteIdentifier(priceColumn)} * ${this.quoteIdentifier(
              quantityColumn,
            )}), 0)`
          : '0';

      const [summary] = await manager.query(
        `
        SELECT
          COUNT(*) AS itemsCount,
          ${quantityExpr} AS itemsQuantity,
          ${subtotalExpr} AS subtotal
        FROM cart_items
        WHERE ${cartIdSql} = ?
        `,
        [cartId],
      );

      const sets: string[] = [];
      const params: any[] = [];

      if (cartItemsCountColumn) {
        sets.push(`${this.quoteIdentifier(cartItemsCountColumn)} = ?`);
        params.push(Number(summary?.itemsCount ?? 0));
      }

      if (cartItemsQuantityColumn) {
        sets.push(`${this.quoteIdentifier(cartItemsQuantityColumn)} = ?`);
        params.push(Number(summary?.itemsQuantity ?? 0));
      }

      if (cartSubtotalColumn) {
        sets.push(`${this.quoteIdentifier(cartSubtotalColumn)} = ?`);
        params.push(Number(summary?.subtotal ?? 0));
      }

      if (!sets.length) continue;

      params.push(cartId);

      await manager.query(
        `
        UPDATE carts
        SET ${sets.join(', ')}
        WHERE id = ?
        `,
        params,
      );
    }
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

    return items.map((item) => {
      const productWithImage = item as ProductWithImages;
      productWithImage.mainImageUrl = imageMap.get(item.id) ?? null;
      return productWithImage;
    });
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
        value:
          [
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
    const product = await this.productsRepo.findOne({
      where: { id: productId },
      relations: {
        shop: true,
      },
      withDeleted: true,
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    if (actorRole === UserRole.ADMIN) {
      return product;
    }

    if (!product.shop || product.shop.userId !== actorId) {
      throw new ForbiddenException('Bạn không có quyền');
    }

    return product;
  }

  private assertProductNotDeleted(product: Product) {
    if (product.deletedAt) {
      throw new BadRequestException('Sản phẩm đã bị xóa, không thể chỉnh sửa');
    }
  }

  private assertSellerCanEditProduct(product: Product, actorRole: UserRole) {
    if (actorRole !== UserRole.ADMIN && product.status === ProductStatus.LOCKED) {
      throw new ForbiddenException(
        'Sản phẩm đã bị admin khóa, shop không thể chỉnh sửa sản phẩm này',
      );
    }
  }

  private assertCanChangeStatus(actorRole: UserRole, nextStatus: ProductStatus) {
    if (actorRole === UserRole.ADMIN) {
      if (![ProductStatus.ACTIVE, ProductStatus.LOCKED].includes(nextStatus)) {
        throw new ForbiddenException(
          'Admin chỉ được chuyển sản phẩm sang đang bán hoặc đã khóa',
        );
      }

      return;
    }

    if (![ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK].includes(nextStatus)) {
      throw new ForbiddenException(
        'Shop chỉ được chuyển sản phẩm sang đang bán hoặc hết hàng',
      );
    }
  }

  private async assertPublicProduct(productId: number) {
    const publicStatuses = [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK];

    const product = await this.productsRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.shop', 'shop')
      .where('p.id = :productId', { productId })
      .andWhere('p.status IN (:...publicStatuses)', { publicStatuses })
      .andWhere('shop.status = :shopStatus', { shopStatus: ShopStatus.ACTIVE })
      .getOne();

    if (!product) {
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

    await productsRepo.update(
      { id: productId } as any,
      {
        stock: totalStock,
      } as any,
    );

    return totalStock;
  }

  private async syncRecommendationTagsForProduct(productId: number): Promise<void> {
    const service = this.recommendationsService as any;

    if (!service || typeof service.syncProductTags !== 'function') {
      return;
    }

    try {
      const product = await this.productsRepo.findOne({
        where: { id: productId } as any,
        withDeleted: true,
      });

      if (!product) return;

      const [category, variants] = await Promise.all([
        product.categoryId
          ? this.categoriesRepo.findOne({
              where: { id: product.categoryId } as any,
              withDeleted: true,
            } as any)
          : Promise.resolve(null),
        this.variantsRepo.find({
          where: { productId } as any,
          order: { id: 'ASC' },
        }),
      ]);

      await service.syncProductTags({
        id: product.id,
        title: product.title,
        description: product.description,
        category: category ? { name: category.name } : null,
        optionSchema: product.optionSchema,
        variants: variants.map((variant) => ({
          name: variant.name,
          value1: variant.value1,
          value2: variant.value2,
          value3: variant.value3,
          value4: variant.value4,
          value5: variant.value5,
        })),
      });
    } catch (error: any) {
      this.logger.warn(
        `Không thể đồng bộ product_tags cho product ${productId}: ${
          error?.message ?? error
        }`,
      );
    }
  }

  async findManageDetail(id: number, actorId: number, actorRole: UserRole) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    const images = await this.imagesRepo.find({
      where: { productId: id },
      order: { position: 'ASC', id: 'ASC' },
    });

    const productWithImages = product as ProductWithImages;

    productWithImages.images = images;
    productWithImages.mainImageUrl =
      images.find((image) => image.isMain)?.url ?? images[0]?.url ?? null;

    return productWithImages;
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
      const savedProduct = await this.dataSource.transaction(async (trx) => {
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

      await this.syncRecommendationTagsForProduct(savedProduct.id);

      return savedProduct;
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

    const publicStatuses = [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK];

    const qb = this.productsRepo
      .createQueryBuilder('p')
      .innerJoin('p.shop', 'shop')
      .where('shop.status = :shopStatus', { shopStatus: ShopStatus.ACTIVE });

    if (query.status) {
      if (!publicStatuses.includes(query.status)) {
        throw new BadRequestException('Trạng thái sản phẩm không hợp lệ');
      }

      qb.andWhere('p.status = :status', { status: query.status });
    } else {
      qb.andWhere('p.status IN (:...publicStatuses)', { publicStatuses });
    }

    if (query.shopId) {
      qb.andWhere('p.shopId = :shopId', { shopId: query.shopId });
    }

    if (query.categoryId) {
      const categoryIds = await this.getCategoryAndDescendantIds(
        Number(query.categoryId),
      );

      qb.andWhere('p.categoryId IN (:...categoryIds)', { categoryIds });
    }

    if (q) {
      qb.andWhere('(p.title LIKE :q OR p.slug LIKE :q)', { q: `%${q}%` });
    }

    if (query.sort === ProductSort.BEST_SELLING) {
      qb.orderBy('p.sold', 'DESC')
        .addOrderBy('p.createdAt', 'DESC')
        .addOrderBy('p.id', 'DESC');
    } else {
      qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC');
    }

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
        status: In([ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK]),
      } as any,
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

  async findMyShopProducts(userId: number, query: QueryProductsDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const q = (query.q ?? '').trim();

    const shop = await this.shopsRepo.findOne({
      where: { userId } as any,
    });

    if (!shop) {
      throw new ForbiddenException('Bạn chưa có shop');
    }

    const qb = this.productsRepo
      .createQueryBuilder('p')
      .where('p.shopId = :shopId', { shopId: shop.id });

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    } else {
      qb.andWhere('p.status IN (:...statuses)', {
        statuses: [
          ProductStatus.ACTIVE,
          ProductStatus.OUT_OF_STOCK,
          ProductStatus.LOCKED,
        ],
      });
    }

    if (query.categoryId) {
      const categoryIds = await this.getCategoryAndDescendantIds(
        Number(query.categoryId),
      );

      qb.andWhere('p.categoryId IN (:...categoryIds)', { categoryIds });
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

  async findAdminAll(actorRole: UserRole, query: QueryProductsDto) {
    if (actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ admin mới được xem danh sách này');
    }

    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const q = (query.q ?? '').trim();

    const qb = this.productsRepo
      .createQueryBuilder('p')
      .withDeleted()
      .leftJoinAndSelect('p.shop', 'shop');

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }

    if (query.shopId) {
      qb.andWhere('p.shopId = :shopId', { shopId: query.shopId });
    }

    if (query.categoryId) {
      const categoryIds = await this.getCategoryAndDescendantIds(
        Number(query.categoryId),
      );

      qb.andWhere('p.categoryId IN (:...categoryIds)', { categoryIds });
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

  async findOnePublic(id: number) {
    const product = await this.assertPublicProduct(id);

    const images = await this.imagesRepo.find({
      where: { productId: id },
      order: { position: 'ASC', id: 'ASC' },
    });

    const productWithImages = product as ProductWithImages;

    productWithImages.images = images;
    productWithImages.mainImageUrl =
      images.find((image) => image.isMain)?.url ?? images[0]?.url ?? null;

    return productWithImages;
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

  async getRemainingImageSlots(
    id: number,
    actorId: number,
    actorRole: UserRole,
  ) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    const currentCount = await this.imagesRepo.count({
      where: { productId: id },
    });

    return Math.max(0, this.maxProductImages - currentCount);
  }

  async addProductImages(
    id: number,
    actorId: number,
    actorRole: UserRole,
    urls: string[],
  ) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    const cleanUrls = (urls ?? [])
      .map((url) => String(url ?? '').trim())
      .filter(Boolean);

    if (!cleanUrls.length) {
      throw new BadRequestException('Danh sách ảnh không hợp lệ');
    }

    const existingImages = await this.imagesRepo.find({
      where: { productId: id },
      order: { position: 'ASC', id: 'ASC' },
    });

    if (existingImages.length + cleanUrls.length > this.maxProductImages) {
      throw new BadRequestException(
        `Sản phẩm chỉ được tối đa ${this.maxProductImages} ảnh`,
      );
    }

    const hasMainImage = existingImages.some((image) => image.isMain);
    const maxPosition = existingImages.reduce(
      (max, image) => Math.max(max, Number(image.position ?? 0)),
      existingImages.length ? 0 : -1,
    );

    const newImages = cleanUrls.map((url, index) =>
      this.imagesRepo.create({
        productId: id,
        url,
        position: maxPosition + index + 1,
        isMain: !hasMainImage && index === 0,
      }),
    );

    await this.imagesRepo.save(newImages);

    return this.findManageDetail(id, actorId, actorRole);
  }

  async deleteProductImage(
    productId: number,
    imageId: number,
    actorId: number,
    actorRole: UserRole,
  ) {
    const product = await this.assertCanManageProduct(
      productId,
      actorId,
      actorRole,
    );

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    const image = await this.imagesRepo.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new NotFoundException('Không tìm thấy ảnh của sản phẩm');
    }

    const wasMain = image.isMain;

    await this.dataSource.transaction(async (trx) => {
      const imageRepo = trx.getRepository(ProductImage);
      const variantRepo = trx.getRepository(ProductVariant);

      // Nếu biến thể đang dùng ảnh này thì bỏ liên kết imageId để tránh lỗi FK.
      await variantRepo.update({ productId, imageId } as any, {
        imageId: null,
      });

      await imageRepo.delete({ id: imageId, productId } as any);

      const remainingImages = await imageRepo.find({
        where: { productId },
        order: { position: 'ASC', id: 'ASC' },
      });

      for (let index = 0; index < remainingImages.length; index += 1) {
        remainingImages[index].position = index;
      }

      if (wasMain && remainingImages.length > 0) {
        remainingImages[0].isMain = true;

        for (let index = 1; index < remainingImages.length; index += 1) {
          remainingImages[index].isMain = false;
        }
      }

      if (remainingImages.length > 0) {
        await imageRepo.save(remainingImages);
      }
    });

    return this.findManageDetail(productId, actorId, actorRole);
  }

  async setMainProductImage(
    productId: number,
    imageId: number,
    actorId: number,
    actorRole: UserRole,
  ) {
    const product = await this.assertCanManageProduct(
      productId,
      actorId,
      actorRole,
    );

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    const image = await this.imagesRepo.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new NotFoundException('Không tìm thấy ảnh của sản phẩm');
    }

    await this.dataSource.transaction(async (trx) => {
      const imageRepo = trx.getRepository(ProductImage);

      await imageRepo.update({ productId } as any, { isMain: false });

      await imageRepo.update(
        { id: imageId, productId } as any,
        { isMain: true },
      );
    });

    return this.findManageDetail(productId, actorId, actorRole);
  }

  async reorderProductImages(
    productId: number,
    actorId: number,
    actorRole: UserRole,
    imageIds: number[],
  ) {
    const product = await this.assertCanManageProduct(
      productId,
      actorId,
      actorRole,
    );

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    if (!Array.isArray(imageIds) || !imageIds.length) {
      throw new BadRequestException('imageIds phải là mảng id ảnh');
    }

    const cleanIds = imageIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const uniqueIds = Array.from(new Set(cleanIds));

    if (uniqueIds.length !== imageIds.length) {
      throw new BadRequestException(
        'Danh sách imageIds không hợp lệ hoặc bị trùng',
      );
    }

    const images = await this.imagesRepo.find({
      where: { productId },
      order: { position: 'ASC', id: 'ASC' },
    });

    const existingIds = images.map((image) => image.id).sort((a, b) => a - b);
    const incomingIds = [...uniqueIds].sort((a, b) => a - b);

    if (
      existingIds.length !== incomingIds.length ||
      existingIds.some((id, index) => id !== incomingIds[index])
    ) {
      throw new BadRequestException(
        'imageIds phải chứa đầy đủ ảnh hiện tại của sản phẩm',
      );
    }

    const imageMap = new Map(images.map((image) => [image.id, image]));

    const reorderedImages = uniqueIds.map((id, index) => {
      const image = imageMap.get(id)!;
      image.position = index;
      return image;
    });

    await this.imagesRepo.save(reorderedImages);

    return this.findManageDetail(productId, actorId, actorRole);
  }

  async updateProduct(
    id: number,
    actorId: number,
    actorRole: UserRole,
    patch: UpdateProductDto,
  ) {
    const product = await this.assertCanManageProduct(id, actorId, actorRole);

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    if (patch.status !== undefined) {
      this.assertCanChangeStatus(actorRole, patch.status);
    }

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
    }

    try {
      const saved = await this.productsRepo.save(product);

      await this.syncRecommendationTagsForProduct(saved.id);

      return saved;
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

      await this.cleanupDeletedProductFromCarts(trx, id);

      const result = await productRepo.delete({ id });

      if (!result.affected) {
        throw new NotFoundException('Không tìm thấy sản phẩm');
      }

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

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

    const incoming = this.normalizeOptions(dto.options ?? []);

    if (!incoming.length) {
      throw new BadRequestException('Danh sách option không hợp lệ');
    }

    const mode = dto.mode ?? 'replace';

    try {
      const variants = await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const variantRepo = trx.getRepository(ProductVariant);
        const imageRepo = trx.getRepository(ProductImage);

        const productInTx = await productRepo.findOne({
          where: { id: productId },
          withDeleted: true,
        });

        if (!productInTx) {
          throw new NotFoundException('Không tìm thấy sản phẩm');
        }

        if (productInTx.deletedAt) {
          throw new BadRequestException('Sản phẩm đã bị xóa, không thể chỉnh sửa');
        }

        const currentSchema: Opt[] = Array.isArray(productInTx.optionSchema)
          ? (productInTx.optionSchema as Opt[])
          : [];

        const mergedSchema =
          mode === 'add'
            ? this.mergeOptionSchema(currentSchema, incoming)
            : incoming;

        const combos = this.cartesian(mergedSchema.map((item) => item.values));

        if (combos.length > 5000) {
          throw new BadRequestException('Quá nhiều biến thể, tối đa 5000 tổ hợp');
        }

        productInTx.optionSchema = mergedSchema;
        await productRepo.save(productInTx);

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

        const newVariants: DeepPartial<ProductVariant>[] = filteredCombos.map(
          (combo) => {
            skuCounter += 1;

            const [value1, value2, value3, value4, value5] = combo;

            return {
              productId,
              sku: `P${productId}-${String(skuCounter).padStart(4, '0')}`,
              name: combo.join(' / '),
              price:
                productInTx.price !== null && productInTx.price !== undefined
                  ? String(productInTx.price)
                  : null,
              stock: 0,
              imageId: defaultImageId,
              value1: value1 ?? null,
              value2: value2 ?? null,
              value3: value3 ?? null,
              value4: value4 ?? null,
              value5: value5 ?? null,
            };
          },
        );

        await variantRepo.save(newVariants);
        await this.syncProductStockFromVariants(productId, trx);

        return await variantRepo.find({
          where: { productId } as any,
          order: { id: 'ASC' },
        });
      });

      await this.syncRecommendationTagsForProduct(productId);

      return variants;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      }

      throw error;
    }
  }

  async listVariants(productId: number, actorId: number, actorRole: UserRole) {
    const product = await this.assertCanManageProduct(
      productId,
      actorId,
      actorRole,
    );

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
    const product = await this.assertCanManageProduct(
      productId,
      actorId,
      actorRole,
    );

    this.assertProductNotDeleted(product);
    this.assertSellerCanEditProduct(product, actorRole);

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
      await this.syncRecommendationTagsForProduct(productId);

      return saved;
    } catch (error: any) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      }

      throw error;
    }
  }
}