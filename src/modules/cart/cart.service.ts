import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product, ProductStatus } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly itemRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly imageRepo: Repository<ProductImage>,
  ) {}

  // ========================================
  // Repository helpers
  // ========================================

  private getCartRepo(manager?: EntityManager): Repository<Cart> {
    return manager ? manager.getRepository(Cart) : this.cartRepo;
  }

  private getItemRepo(manager?: EntityManager): Repository<CartItem> {
    return manager ? manager.getRepository(CartItem) : this.itemRepo;
  }

  private getProductRepo(manager?: EntityManager): Repository<Product> {
    return manager ? manager.getRepository(Product) : this.productRepo;
  }

  private getVariantRepo(manager?: EntityManager): Repository<ProductVariant> {
    return manager ? manager.getRepository(ProductVariant) : this.variantRepo;
  }

  private getImageRepo(manager?: EntityManager): Repository<ProductImage> {
    return manager ? manager.getRepository(ProductImage) : this.imageRepo;
  }

  // ========================================
  // Helpers
  // ========================================

  private isDuplicateEntryError(error: unknown): boolean {
    const err = error as any;
    return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
  }

  private normalizeMoney(value: unknown): string {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  }

  private isProductPurchasable(product: Product): boolean {
    const rawStatus = String((product as any)?.status ?? '').toUpperCase();

    return (
      rawStatus === String(ProductStatus.ACTIVE).toUpperCase() ||
      rawStatus === 'PUBLISHED' ||
      rawStatus === 'PUBLISH'
    );
  }

  private async getOrCreateCart(
    userId: number,
    manager?: EntityManager,
  ): Promise<Cart> {
    const cartRepo = this.getCartRepo(manager);

    let cart = await cartRepo.findOne({
      where: { userId },
    });

    if (cart) return cart;

    try {
      cart = cartRepo.create({
        userId,
        itemsCount: 0,
        itemsQuantity: 0,
        subtotal: '0.00',
        currency: 'VND',
      });

      return await cartRepo.save(cart);
    } catch (error) {
      if (!this.isDuplicateEntryError(error)) {
        throw error;
      }

      const existed = await cartRepo.findOne({
        where: { userId },
      });

      if (!existed) throw error;
      return existed;
    }
  }

  private async recalcTotals(
    cartId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const itemRepo = this.getItemRepo(manager);
    const cartRepo = this.getCartRepo(manager);

    const items = await itemRepo.find({
      where: { cartId },
    });

    const itemsCount = items.length;
    const itemsQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

    await cartRepo.update(cartId, {
      itemsCount,
      itemsQuantity,
      subtotal: subtotal.toFixed(2),
    });
  }

  private async resolveProductAndVariant(
    productId: number,
    variantId: number,
    manager?: EntityManager,
  ): Promise<{ product: Product; variant: ProductVariant }> {
    const productRepo = this.getProductRepo(manager);
    const variantRepo = this.getVariantRepo(manager);

    const product = await productRepo.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    if (!this.isProductPurchasable(product)) {
      throw new BadRequestException('Sản phẩm chưa mở bán');
    }

    const variant = await variantRepo.findOne({
      where: { id: variantId, productId },
    });

    if (!variant) {
      throw new NotFoundException('Không tìm thấy biến thể của sản phẩm');
    }

    return { product, variant };
  }

  private pickImageUrl(img: ProductImage | null): string | null {
    if (!img) return null;

    const anyImg = img as any;
    return anyImg.imageUrl || anyImg.url || anyImg.secureUrl || null;
  }

  private async resolveImageSnapshot(
    productId: number,
    variant: ProductVariant,
    manager?: EntityManager,
  ): Promise<{ imageId: number | null; imageUrl: string | null }> {
    const imageRepo = this.getImageRepo(manager);

    if (variant.imageId) {
      const found = await imageRepo.findOne({
        where: { id: variant.imageId, productId },
      });

      if (found) {
        return {
          imageId: found.id,
          imageUrl: this.pickImageUrl(found),
        };
      }
    }

    const main = await imageRepo.findOne({
      where: { productId },
      order: { isMain: 'DESC', id: 'ASC' },
    });

    return {
      imageId: main?.id ?? null,
      imageUrl: this.pickImageUrl(main),
    };
  }

  private applySnapshotToItem(
    item: CartItem,
    product: Product,
    variant: ProductVariant,
    image: { imageId: number | null; imageUrl: string | null },
    quantity?: number,
  ): CartItem {
    item.productId = product.id;
    item.variantId = variant.id;
    item.title = product.title;
    item.variantName = variant.name ?? null;
    item.sku = variant.sku ?? null;
    item.imageId = image.imageId;
    item.imageUrl = image.imageUrl;
    item.price = this.normalizeMoney(variant.price ?? product.price);
    item.value1 = variant.value1 ?? null;
    item.value2 = variant.value2 ?? null;
    item.value3 = variant.value3 ?? null;
    item.value4 = variant.value4 ?? null;
    item.value5 = variant.value5 ?? null;

    if (typeof quantity === 'number') {
      item.quantity = quantity;
    }

    return item;
  }

  // ========================================
  // Core methods
  // ========================================

  async getCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);

    const items = await this.itemRepo.find({
      where: { cartId: cart.id },
      order: { id: 'ASC' },
    });

    return {
      ...cart,
      items,
    };
  }

  async addItem(userId: number, dto: AddItemDto) {
    if (!dto.variantId) {
      throw new BadRequestException('variantId là bắt buộc');
    }

    await this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateCart(userId, manager);

      const { product, variant } = await this.resolveProductAndVariant(
        dto.productId,
        dto.variantId,
        manager,
      );

      const quantity = Math.max(1, dto.quantity ?? 1);
      const available = Number(variant.stock ?? 0);

      if (quantity > available) {
        throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);
      }

      const itemRepo = this.getItemRepo(manager);
      const snapImage = await this.resolveImageSnapshot(
        product.id,
        variant,
        manager,
      );

      let item = await itemRepo.findOne({
        where: { cartId: cart.id, variantId: variant.id },
      });

      if (!item) {
        item = itemRepo.create({
          cartId: cart.id,
        });

        this.applySnapshotToItem(item, product, variant, snapImage, quantity);

        try {
          await itemRepo.save(item);
        } catch (error) {
          if (!this.isDuplicateEntryError(error)) {
            throw error;
          }

          const existed = await itemRepo.findOne({
            where: { cartId: cart.id, variantId: variant.id },
          });

          if (!existed) {
            throw error;
          }

          const nextQuantity = existed.quantity + quantity;

          if (nextQuantity > available) {
            throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);
          }

          this.applySnapshotToItem(
            existed,
            product,
            variant,
            snapImage,
            nextQuantity,
          );

          await itemRepo.save(existed);
        }
      } else {
        const nextQuantity = item.quantity + quantity;

        if (nextQuantity > available) {
          throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);
        }

        this.applySnapshotToItem(
          item,
          product,
          variant,
          snapImage,
          nextQuantity,
        );

        await itemRepo.save(item);
      }

      await this.recalcTotals(cart.id, manager);
    });

    return this.getCart(userId);
  }

  async updateItem(userId: number, itemId: number, dto: UpdateItemDto) {
    await this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateCart(userId, manager);
      const itemRepo = this.getItemRepo(manager);

      const item = await itemRepo.findOne({
        where: { id: itemId, cartId: cart.id },
      });

      if (!item) {
        throw new NotFoundException('Không tìm thấy dòng giỏ hàng');
      }

      if (dto.quantity === 0) {
        await itemRepo.delete({ id: item.id });
        await this.recalcTotals(cart.id, manager);
        return;
      }

      const { product, variant } = await this.resolveProductAndVariant(
        item.productId,
        item.variantId,
        manager,
      );

      const available = Number(variant.stock ?? 0);

      if (dto.quantity > available) {
        throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);
      }

      const snapImage = await this.resolveImageSnapshot(
        product.id,
        variant,
        manager,
      );

      this.applySnapshotToItem(item, product, variant, snapImage, dto.quantity);

      await itemRepo.save(item);
      await this.recalcTotals(cart.id, manager);
    });

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    await this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateCart(userId, manager);
      const itemRepo = this.getItemRepo(manager);

      const item = await itemRepo.findOne({
        where: { id: itemId, cartId: cart.id },
      });

      if (!item) {
        throw new NotFoundException('Không tìm thấy dòng giỏ hàng');
      }

      await itemRepo.delete({ id: item.id });
      await this.recalcTotals(cart.id, manager);
    });

    return this.getCart(userId);
  }

  async clear(userId: number) {
    await this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateCart(userId, manager);
      const itemRepo = this.getItemRepo(manager);

      await itemRepo.delete({ cartId: cart.id });
      await this.recalcTotals(cart.id, manager);
    });

    return this.getCart(userId);
  }

  async removeMany(userId: number, itemIds: number[]): Promise<void> {
    if (!itemIds?.length) return;

    await this.dataSource.transaction(async (manager) => {
      const cartRepo = this.getCartRepo(manager);
      const itemRepo = this.getItemRepo(manager);

      const cart = await cartRepo.findOne({
        where: { userId },
      });

      if (!cart) return;

      await itemRepo.delete({
        cartId: cart.id,
        id: In(itemIds),
      });

      await this.recalcTotals(cart.id, manager);
    });
  }
}