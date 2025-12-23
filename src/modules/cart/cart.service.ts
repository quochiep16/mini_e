import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly itemRepo: Repository<CartItem>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly imageRepo: Repository<ProductImage>,
  ) {}

  // ========================================
  // Helpers
  // ========================================

  private async getOrCreateCart(userId: number): Promise<Cart> {
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = this.cartRepo.create({
        userId,
        itemsCount: 0,
        itemsQuantity: 0,
        subtotal: '0.00',
        currency: 'VND',
      });
      cart = await this.cartRepo.save(cart);
    }
    return cart;
  }

  private async recalcTotals(cartId: number) {
    const items = await this.itemRepo.find({ where: { cartId } });

    const itemsCount = items.length;
    const itemsQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const subtotal = items.reduce(
      (s, i) => s + Number(i.price) * i.quantity,
      0,
    );

    await this.cartRepo.update(cartId, {
      itemsCount,
      itemsQuantity,
      subtotal: subtotal.toFixed(2),
    });
  }

  private async resolveProductAndVariant(
    productId: number,
    variantId: number,
  ) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product)
      throw new NotFoundException('Không tìm thấy sản phẩm');

    if (product.status !== ProductStatus.ACTIVE)
      throw new BadRequestException('Sản phẩm chưa mở bán');

    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant)
      throw new NotFoundException('Không tìm thấy biến thể của sản phẩm');

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
  ) {
    // 1) ảnh theo variant.imageId
    if (variant.imageId) {
      const found = await this.imageRepo.findOne({
        where: { id: variant.imageId, productId },
      });
      if (found)
        return { imageId: found.id, imageUrl: this.pickImageUrl(found) };
    }

    // 2) fallback ảnh main
    const main = await this.imageRepo.findOne({
      where: { productId },
      order: { isMain: 'DESC', id: 'ASC' },
    });
    return {
      imageId: main?.id ?? null,
      imageUrl: this.pickImageUrl(main),
    };
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
    return { ...cart, items };
  }

  async addItem(userId: number, dto: AddItemDto) {
    if (!dto.variantId)
      throw new BadRequestException('variantId là bắt buộc');

    const { product, variant } = await this.resolveProductAndVariant(
      dto.productId,
      dto.variantId,
    );

    const quantity = Math.max(1, dto.quantity ?? 1);
    const available = variant.stock ?? 0;
    if (quantity > available)
      throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);

    const cart = await this.getOrCreateCart(userId);

    // tìm dòng cũ
    let item = await this.itemRepo.findOne({
      where: { cartId: cart.id, variantId: variant.id },
    });

    const unitPrice = Number(variant.price ?? product.price);
    const snapImage = await this.resolveImageSnapshot(product.id, variant);

    if (!item) {
      item = this.itemRepo.create({
        cartId: cart.id,
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantName: variant.name ?? null,
        sku: variant.sku ?? null,
        imageId: snapImage.imageId,
        imageUrl: snapImage.imageUrl,
        price: unitPrice.toFixed(2),
        quantity,
        value1: variant.value1 ?? null,
        value2: variant.value2 ?? null,
        value3: variant.value3 ?? null,
        value4: variant.value4 ?? null,
        value5: variant.value5 ?? null,
      });
    } else {
      const next = item.quantity + quantity;
      if (next > available)
        throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);
      item.quantity = next;
      if (!item.imageUrl && snapImage.imageUrl) {
        item.imageId = snapImage.imageId;
        item.imageUrl = snapImage.imageUrl;
      }
    }

    await this.itemRepo.save(item);
    await this.recalcTotals(cart.id);
    return this.getCart(userId);
  }

  async updateItem(userId: number, itemId: number, dto: UpdateItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item)
      throw new NotFoundException('Không tìm thấy dòng giỏ hàng');

    if (dto.quantity === 0) {
      await this.itemRepo.delete({ id: item.id });
      await this.recalcTotals(cart.id);
      return this.getCart(userId);
    }

    const { variant } = await this.resolveProductAndVariant(
      item.productId,
      item.variantId,
    );
    const available = variant.stock ?? 0;
    if (dto.quantity > available)
      throw new BadRequestException(`Chỉ còn ${available} sản phẩm`);

    item.quantity = dto.quantity;
    await this.itemRepo.save(item);
    await this.recalcTotals(cart.id);
    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.getOrCreateCart(userId);
    await this.itemRepo.delete({ id: itemId, cartId: cart.id });
    await this.recalcTotals(cart.id);
    return this.getCart(userId);
  }

  async clear(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    await this.itemRepo.delete({ cartId: cart.id });
    await this.recalcTotals(cart.id);
    return this.getCart(userId);
  }

  async removeMany(userId: number, itemIds: number[]): Promise<void> {
    if (!itemIds || itemIds.length === 0) return;

    // tìm cart của user (nếu chưa có thì thôi)
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) return;

    // chỉ xoá những item thuộc cart của user
    await this.itemRepo.delete({
      cartId: cart.id,
      id: In(itemIds),
    });

    // cập nhật lại totals
    await this.recalcTotals(cart.id);
  }
}
