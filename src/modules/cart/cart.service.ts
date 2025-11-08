import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Product, ProductStatus } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductImage } from '../products/entities/product-image.entity';

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly itemRepo: Repository<CartItem>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductImage) private readonly imageRepo: Repository<ProductImage>,
  ) {}

  // ----------------- helpers -----------------
  private async getOrCreateCart(userId: number) {
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
    let count = items.length;
    let qtySum = 0;
    let subtotal = 0;

    for (const it of items) {
      qtySum += it.quantity;
      subtotal += Number(it.price) * it.quantity;
    }

    await this.cartRepo.update(
      { id: cartId },
      {
        itemsCount: count,
        itemsQuantity: qtySum,
        subtotal: subtotal.toFixed(2),
      },
    );
  }

  private async resolveProductAndVariant(productId: number, variantId?: number) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Sản phẩm chưa được mở bán');
    }

    if (variantId != null) {
      const variant = await this.variantRepo.findOne({
        where: { id: variantId, productId },
      });
      if (!variant) throw new BadRequestException('Biến thể không tồn tại');
      return { product, variant };
    }

    return { product, variant: null as ProductVariant | null };
  }

  private async getDefaultImageId(productId: number) {
    const row = await this.imageRepo
      .createQueryBuilder('i')
      .select('MIN(i.id)', 'minId')
      .where('i.productId = :pid', { pid: productId })
      .getRawOne<{ minId: string }>();
    return row?.minId ? Number(row.minId) : null;
  }

  // ----------------- APIs -----------------
  async getCart(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.itemRepo.find({
      where: { cartId: cart.id },
      order: { id: 'ASC' },
    });
    return {
      id: cart.id,
      currency: cart.currency,
      itemsCount: cart.itemsCount,
      itemsQuantity: cart.itemsQuantity,
      subtotal: cart.subtotal,
      items,
    };
  }

  async addItem(userId: number, dto: AddItemDto) {
    const quantity = Math.max(1, dto.quantity ?? 1);
    const { product, variant } = await this.resolveProductAndVariant(
      dto.productId,
      dto.variantId,
    );

    // Giá snapshot: variant.price ?? product.price
    const unitPrice = Number((variant?.price ?? product.price) as any);
    if (isNaN(unitPrice))
      throw new BadRequestException('Giá sản phẩm không hợp lệ');

    // Kiểm tra tồn kho (chỉ kiểm tra, chưa trừ stock ở giai đoạn cart)
    const available = variant ? variant.stock : product.stock;

    const cart = await this.getOrCreateCart(userId);

    // Tìm dòng trùng (cartId, productId, variantId) — chú ý dùng IsNull() thay vì null
    const lineWhere = {
      cartId: cart.id,
      productId: product.id,
      variantId: variant ? (variant.id as number) : (IsNull() as any),
    } as any;

    let line = await this.itemRepo.findOne({ where: lineWhere });

    const nextQty = (line?.quantity ?? 0) + quantity;
    if (available != null && available >= 0 && nextQty > available) {
      throw new BadRequestException('Số lượng vượt quá tồn kho');
    }

    if (!line) {
      const imageId = await this.getDefaultImageId(product.id);
      line = this.itemRepo.create({
        cartId: cart.id,
        productId: product.id,
        variantId: variant ? variant.id : null,
        title: product.title,
        variantName: variant?.name ?? null,
        sku: variant?.sku ?? null,
        imageId,
        price: unitPrice.toFixed(2),
        quantity,
        value1: variant?.value1 ?? null,
        value2: variant?.value2 ?? null,
        value3: variant?.value3 ?? null,
        value4: variant?.value4 ?? null,
        value5: variant?.value5 ?? null,
      });
    } else {
      line.quantity = nextQty;
      // giữ nguyên snapshot price theo dòng
    }

    await this.itemRepo.save(line);
    await this.recalcTotals(cart.id);
    return this.getCart(userId);
  }

  async updateItem(userId: number, itemId: number, dto: UpdateItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const line = await this.itemRepo.findOne({
      where: { id: itemId, cartId: cart.id },
    });
    if (!line) throw new NotFoundException('Không tìm thấy dòng giỏ hàng');

    if (dto.quantity === 0) {
      await this.itemRepo.delete({ id: itemId, cartId: cart.id });
      await this.recalcTotals(cart.id);
      return this.getCart(userId);
    }

    // Check tồn kho tại thời điểm cập nhật
    const product = await this.productRepo.findOne({
      where: { id: line.productId },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    let available = product.stock;
    if (line.variantId) {
      const variant = await this.variantRepo.findOne({
        where: { id: line.variantId, productId: line.productId },
      });
      if (!variant)
        throw new BadRequestException('Biến thể không còn tồn tại');
      available = variant.stock;
    }
    if (available != null && available >= 0 && dto.quantity > available) {
      throw new BadRequestException('Số lượng vượt quá tồn kho');
    }

    line.quantity = dto.quantity;
    await this.itemRepo.save(line);
    await this.recalcTotals(cart.id);
    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.getOrCreateCart(userId);
    const exist = await this.itemRepo.findOne({
      where: { id: itemId, cartId: cart.id },
    });
    if (!exist) throw new NotFoundException('Không tìm thấy dòng giỏ hàng');

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
}
