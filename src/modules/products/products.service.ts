import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { GenerateVariantsDto } from './dto/generate-variants.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { Product, ProductStatus } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Shop } from '../../modules/shops/entities/shop.entity';
import { ShopStats } from '../../modules/shops/entities/shop-stats.entity';
import { UserRole } from '../../modules/users/entities/user.entity';

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductImage) private readonly imagesRepo: Repository<ProductImage>,
    @InjectRepository(ProductVariant) private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(Shop) private readonly shopsRepo: Repository<Shop>,
    @InjectRepository(ShopStats) private readonly statsRepo: Repository<ShopStats>,
  ) {}

  // ===== helpers =====
  private isUniqueViolation(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || /unique/i.test(e?.message ?? '');
  }
  private slugify(input: string): string {
    const base = (input ?? '').toLowerCase().normalize('NFD')
      .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    return base || 'product';
  }
  private async ensureUniqueSlug(base: string, ignoreId?: number) {
    let slug = this.slugify(base);
    let i = 1;
    while (await this.productsRepo.findOne({ where: ignoreId ? { slug, id: Not(ignoreId) } : { slug } })) {
      slug = `${this.slugify(base)}-${i++}`;
    }
    return slug;
  }
  private cartesian<T>(lists: T[][]): T[][] {
    return lists.reduce<T[][]>((acc, list) => acc.flatMap(a => list.map(b => [...a, b])), [[]]);
  }

  // ===== product =====

  async createBySeller(userId: number, dto: CreateProductDto) {
    const shop = await this.shopsRepo.findOne({ where: { userId } });
    if (!shop) throw new ForbiddenException('Bạn chưa có shop.');

    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.title);

    try {
      return await this.dataSource.transaction(async (trx) => {
        const productRepo = trx.getRepository(Product);
        const imageRepo = trx.getRepository(ProductImage);
        const statsRepo = trx.getRepository(ShopStats);

        const product = productRepo.create({
          shopId: shop.id,
          title: dto.title,
          slug,
          description: dto.description,
          price: dto.price.toFixed(2) as any,
          stock: dto.stock ?? 0,
          currency: 'VND',
          status: ProductStatus.ACTIVE,
        });
        const saved = await productRepo.save(product);

        if (dto.images?.length) {
          const imgs = dto.images.map((url, idx) =>
            imageRepo.create({ productId: saved.id, url, position: idx, isMain: idx === 0 }),
          );
          await imageRepo.save(imgs);
          saved.images = imgs;
        }

        // ++ stats.productCount
        const stats = await statsRepo.findOne({ where: { shopId: shop.id } });
        if (stats) { stats.productCount += 1; await statsRepo.save(stats); }

        return saved;
      });
    } catch (e) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Slug hoặc SKU đã tồn tại.');
      throw e;
    }
  }

  async findAllBasic(page = 1, limit = 20) {
    const [items, total] = await this.productsRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total };
  }

  async findOnePublic(id: number) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    return product;
  }

  async updateProduct(id: number, actorId: number, actorRole: UserRole, patch: Partial<Product>) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    if (patch.title && patch.title.trim()) {
      product.title = patch.title.trim();
      if (!patch.slug) product.slug = await this.ensureUniqueSlug(product.title, product.id);
    }
    if (patch.slug && patch.slug.trim()) product.slug = await this.ensureUniqueSlug(patch.slug, product.id);
    if (patch.description !== undefined) product.description = patch.description;
    if (patch.price !== undefined) product.price = (+patch.price as any).toFixed(2);
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
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền xoá sản phẩm này');

    await this.dataSource.transaction(async (trx) => {
      await trx.getRepository(Product).delete({ id });
      const stats = await trx.getRepository(ShopStats).findOne({ where: { shopId: product.shopId } });
      if (stats && stats.productCount > 0) { stats.productCount -= 1; await trx.getRepository(ShopStats).save(stats); }
    });

    return { success: true };
  }

  // ===== variants =====

  async generateVariants(productId: number, actorId: number, actorRole: UserRole, dto: GenerateVariantsDto) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    const options = dto.options.slice(0, 5).map((o, idx) => ({
      name: (o.name || '').trim(),
      values: Array.from(new Set((o.values || []).map(v => (v || '').trim()))).filter(Boolean),
      position: idx,
    }));
    if (!options.length) throw new BadRequestException('Cần ít nhất 1 option');

    const minImg = await this.imagesRepo.createQueryBuilder('i')
      .select('MIN(i.id)', 'minId')
      .where('i.productId = :pid', { pid: product.id })
      .getRawOne<{ minId: string }>();
    const defaultImageId = minImg?.minId ? Number(minImg.minId) : null;

    const mode = dto.mode ?? 'replace';

    return this.dataSource.transaction(async (trx) => {
      const productsRepo = trx.getRepository(Product);
      const variantsRepo = trx.getRepository(ProductVariant);

      product.optionSchema = options.map(o => ({ name: o.name, values: o.values }));
      await productsRepo.save(product);

      if (mode === 'replace') await variantsRepo.delete({ productId: product.id });

      const combos = this.cartesian(options.map(o => o.values));
      if (combos.length > 5000) throw new BadRequestException('Số biến thể quá lớn, vui lòng giảm values');

      let i = 1;
      for (const combo of combos) {
        const [v1, v2, v3, v4, v5] = [combo[0] ?? null, combo[1] ?? null, combo[2] ?? null, combo[3] ?? null, combo[4] ?? null];
        const displayName = combo.filter(Boolean).join(' / ');
        const sku = `P${product.id}-${String(i).padStart(4, '0')}`; i++;

        const row = variantsRepo.create({
          productId: product.id,
          name: displayName,
          sku,
          price: product.price as any,
          stock: 0,
          imageId: defaultImageId,
          value1: v1, value2: v2, value3: v3, value4: v4, value5: v5,
        });

        try {
          await variantsRepo.save(row);
        } catch (e: any) {
          if (mode === 'add' && this.isUniqueViolation(e)) continue;
          throw e;
        }
      }

      return await variantsRepo.find({ where: { productId: product.id }, order: { id: 'ASC' } });
    });
  }

  async listVariants(productId: number, actorId: number, actorRole: UserRole) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const shop = await this.shopsRepo.findOne({ where: { id: product.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    const variants = await this.variantsRepo.find({ where: { productId }, order: { id: 'ASC' } });
    const schema = product.optionSchema ?? [];

    return variants.map(v => ({
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

  async updateVariant(productId: number, variantId: number, actorId: number, actorRole: UserRole, dto: UpdateVariantDto) {
    const variant = await this.variantsRepo.findOne({ where: { id: variantId, productId } });
    if (!variant) throw new NotFoundException('Không tìm thấy variant');

    const product = await this.productsRepo.findOne({ where: { id: productId } });
    const shop = await this.shopsRepo.findOne({ where: { id: product!.shopId } });
    const isOwner = shop?.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền');

    if (dto.name !== undefined) variant.name = dto.name;
    if (dto.sku !== undefined) variant.sku = dto.sku;
    if (dto.price !== undefined) variant.price = dto.price.toFixed(2) as any;
    if (dto.stock !== undefined) variant.stock = dto.stock;

    if (dto.imageId !== undefined) {
      if ((dto.imageId as any) === null) {
        variant.imageId = null;
      } else {
        const img = await this.imagesRepo.findOne({ where: { id: dto.imageId } });
        if (!img) throw new BadRequestException('imageId không tồn tại');
        if (img.productId !== productId) throw new BadRequestException('Ảnh không thuộc sản phẩm này');
        variant.imageId = dto.imageId;
      }
    }

    try {
      return await this.variantsRepo.save(variant);
    } catch (e: any) {
      if (this.isUniqueViolation(e)) throw new ConflictException('SKU hoặc tổ hợp biến thể đã tồn tại');
      throw e;
    }
  }
}
