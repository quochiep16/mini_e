import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order, OrderStatus, PaymentMethod, PaymentStatus, ShippingStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PreviewOrderDto, CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { Address } from '../addresses/entities/address.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Shop } from '../shops/entities/shop.entity';
import { haversineKm, calcShippingFee } from '../../common/utils/shipping.util';
import { PaymentGatewayService } from './payment.gateway';
import { PaymentSession, PaymentSessionStatus } from './entities/payment-session.entity';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly pg: PaymentGatewayService,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Address) private readonly addrRepo: Repository<Address>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductImage) private readonly imageRepo: Repository<ProductImage>,
    @InjectRepository(Shop) private readonly shopRepo: Repository<Shop>,
    @InjectRepository(PaymentSession) private readonly sessionRepo: Repository<PaymentSession>,
  ) {}

  private genOrderCode() {
    const n = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
    return `OD${d}-${n}`;
  }
  private genSessionCode() {
    const n = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
    return `PM${d}-${n}`;
  }
  private pickItems(cart: any, itemIds?: number[]) {
    if (!itemIds?.length) return cart.items;
    const set = new Set(itemIds.map(Number));
    const selected = (cart.items || []).filter((i: any) => set.has(Number(i.id)));
    if (selected.length !== set.size) throw new BadRequestException('Một số cart item không tồn tại');
    return selected;
  }
  private async getAddress(userId: number, addressId?: number) {
    const addr = addressId
      ? await this.addrRepo.findOne({ where: { id: addressId, userId } })
      : await this.addrRepo.findOne({ where: { userId, isDefault: true as any } });
    if (!addr) throw new BadRequestException('Chưa chọn địa chỉ và không có địa chỉ mặc định');
    if (!addr.lat || !addr.lng) throw new BadRequestException('Địa chỉ chưa có toạ độ');
    return addr;
  }
  private async groupByShop(selected: any[]) {
    const productIds = Array.from(new Set(selected.map((i: any) => i.productId)));
    const prods = await this.productRepo.find({ where: { id: In(productIds) } as any });
    const prodMap = new Map(prods.map(p => [p.id, p]));
    const groups = new Map<number, any[]>();
    for (const it of selected) {
      const p = prodMap.get(it.productId);
      if (!p) throw new BadRequestException('Sản phẩm không tồn tại');
      const sid = p.shopId;
      if (!groups.has(sid)) groups.set(sid, []);
      (groups.get(sid) as any[]).push({ ...it, _prod: p });
    }
    return { groups };
  }

  async preview(userId: number, dto: PreviewOrderDto) {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items?.length) throw new BadRequestException('Giỏ hàng trống');
    const selected = this.pickItems(cart, dto.itemIds);
    if (!selected.length) throw new BadRequestException('Chưa chọn sản phẩm nào');

    const addr = await this.getAddress(userId, dto.addressId);
    const { groups } = await this.groupByShop(selected);

    const resultGroups: any[] = [];
    let sumSubtotal = 0, sumShipping = 0;

    for (const [shopId, items] of groups.entries()) {
      const shop = await this.shopRepo.findOne({ where: { id: shopId } as any });
      if (!shop) throw new BadRequestException('Shop không tồn tại');

      const shopLat = +(shop as any).shopLat;
      const shopLng = +(shop as any).shopLng;
      if (isNaN(shopLat) || isNaN(shopLng)) throw new BadRequestException('Shop chưa cấu hình tọa độ');

      const subtotal = items.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
      const distanceKm = haversineKm(shopLat, shopLng, +addr.lat!, +addr.lng!);
      const shippingFee = calcShippingFee(distanceKm, subtotal);
      const total = subtotal + shippingFee;

      resultGroups.push({
        shop: { id: shop.id, name: (shop as any).name },
        items,
        distanceKm: +distanceKm.toFixed(2),
        subtotal: +subtotal.toFixed(2),
        shippingFee,
        total: +total.toFixed(2),
      });
      sumSubtotal += subtotal; sumShipping += shippingFee;
    }

    return {
      address: { id: addr.id, fullName: addr.fullName, phone: addr.phone, formattedAddress: addr.formattedAddress },
      groups: resultGroups,
      summary: {
        subtotal: +sumSubtotal.toFixed(2),
        shippingFee: sumShipping,
        total: +(sumSubtotal + sumShipping).toFixed(2),
      }
    };
  }

  async create(userId: number, dto: CreateOrderDto, ipAddress = '127.0.0.1') {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items?.length) throw new BadRequestException('Giỏ hàng trống');
    const selected = this.pickItems(cart, dto.itemIds);
    if (!selected.length) throw new BadRequestException('Chưa chọn sản phẩm nào');

    const addr = await this.getAddress(userId, dto.addressId);
    const { groups } = await this.groupByShop(selected);

    const imageIds = Array.from(new Set(selected.map((i: any) => i.imageId).filter(Boolean)));
    const images = imageIds.length ? await this.imageRepo.find({ where: { id: In(imageIds) } as any }) : [];
    const imgMap = new Map(images.map(im => [im.id, im.url]));

    const createdOrders: Array<{ orderId: string; code: string; total: number }> = [];
    let totalAmount = 0;

    await this.dataSource.transaction(async (trx) => {
      const orderRepo = trx.getRepository(Order);
      const itemRepo = trx.getRepository(OrderItem);
      const productRepo = trx.getRepository(Product);
      const variantRepo = trx.getRepository(ProductVariant);

      for (const [shopId, items] of groups.entries()) {
        const shop = await this.shopRepo.findOne({ where: { id: shopId } as any });
        const shopLat = +(shop as any).shopLat;
        const shopLng = +(shop as any).shopLng;

        // check stock
        const pIds = Array.from(new Set(items.map((i: any) => i.productId)));
        const vIds = Array.from(new Set(items.map((i: any) => i.variantId).filter(Boolean)));
        const prods = await productRepo.find({ where: { id: In(pIds) } as any });
        const vars = vIds.length ? await variantRepo.find({ where: { id: In(vIds) } as any }) : [];
        const prodMap = new Map(prods.map(p => [p.id, p]));
        const varMap = new Map(vars.map(v => [v.id, v]));
        for (const it of items) {
          const p = prodMap.get(it.productId);
          if (!p) throw new BadRequestException('Sản phẩm không tồn tại');
          if (it.variantId) {
            const v = varMap.get(it.variantId);
            if (!v) throw new BadRequestException('Biến thể không tồn tại');
            if (v.stock != null && v.stock < it.quantity) throw new BadRequestException(`SKU ${v.sku} không đủ tồn`);
          } else if (p.stock != null && p.stock < it.quantity) {
            throw new BadRequestException(`Sản phẩm ${p.title} không đủ tồn`);
          }
        }

        // totals group
        const subtotalNum = items.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
        const distanceKm = haversineKm(shopLat, shopLng, +addr.lat!, +addr.lng!);
        const shippingFeeNum = calcShippingFee(distanceKm, subtotalNum);
        const totalNum = subtotalNum + shippingFeeNum;

        // create order
        let code = this.genOrderCode();
        for (let i=0;i<5;i++) {
          const existed = await orderRepo.findOne({ where: { code } });
          if (!existed) break;
          code = this.genOrderCode();
        }
        const order = orderRepo.create({
          userId,
          code,
          paymentMethod: dto.paymentMethod,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          shippingStatus: ShippingStatus.PENDING,
          addressSnapshot: {
            fullName: addr.fullName, phone: addr.phone, formattedAddress: addr.formattedAddress,
            placeId: addr.placeId, lat: addr.lat, lng: addr.lng,
          },
          subtotal: subtotalNum.toFixed(2),
          discount: '0.00',
          shippingFee: shippingFeeNum.toFixed(2),
          total: totalNum.toFixed(2),
          note: dto.note ?? null,
        });
        const savedOrder = await orderRepo.save(order);

        // items + decrement stock
        for (const it of items) {
          const nameSnapshot = it.variantName ? `${it.title} - ${it.variantName}` : it.title;
          const imageSnapshot = it.imageId ? (imgMap.get(it.imageId) ?? null) : null;
          const totalLine = Number(it.price) * it.quantity;
          await itemRepo.save(itemRepo.create({
            orderId: savedOrder.id,
            productId: it.productId,
            productVariantId: it.variantId ?? null,
            nameSnapshot, imageSnapshot,
            price: Number(it.price).toFixed(2),
            quantity: it.quantity,
            totalLine: totalLine.toFixed(2),
            value1: it.value1 ?? null, value2: it.value2 ?? null, value3: it.value3 ?? null, value4: it.value4 ?? null, value5: it.value5 ?? null,
          }));
          if (it.variantId) await variantRepo.decrement({ id: it.variantId }, 'stock', it.quantity);
          else await productRepo.decrement({ id: it.productId }, 'stock', it.quantity);
        }

        createdOrders.push({ orderId: savedOrder.id, code: savedOrder.code, total: +totalNum.toFixed(2) });
        totalAmount += totalNum;
      }
    });

    // remove selected items from cart
    await this.cartService.removeMany(userId, selected.map((i: any) => i.id));

    // COD: return orders only
    if (dto.paymentMethod === PaymentMethod.COD) {
      return { orders: createdOrders };
    }

    // VNPay: one session + one link
    let sessionCode = this.genSessionCode();
    for (let i=0;i<5;i++) {
      const existed = await this.sessionRepo.findOne({ where: { code: sessionCode } });
      if (!existed) break;
      sessionCode = this.genSessionCode();
    }
    const session = this.sessionRepo.create({
      userId,
      code: sessionCode,
      amount: totalAmount.toFixed(2),
      currency: 'VND',
      status: PaymentSessionStatus.PENDING,
      ordersJson: createdOrders,
    });
    const savedSession = await this.sessionRepo.save(session);

    const paymentUrl = this.pg.createVnPayUrl({ code: savedSession.code, amount: totalAmount, ipAddress });

    return {
      session: { code: savedSession.code, amount: +totalAmount.toFixed(2), status: savedSession.status },
      paymentUrl,
      orders: createdOrders,
    };
  }

  async listMine(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.orderRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total };
  }

  async detailMine(userId: number, id: string) {
    const order = await this.orderRepo.findOne({ where: { id, userId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    const items = await this.orderItemRepo.find({ where: { orderId: id } });
    return { ...order, items };
  }

  async updateStatus(id: string, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus; shippingStatus?: ShippingStatus; }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (patch.status) order.status = patch.status;
    if (patch.paymentStatus) order.paymentStatus = patch.paymentStatus;
    if (patch.shippingStatus) order.shippingStatus = patch.shippingStatus;
    order.total = (Number(order.subtotal) - Number(order.discount) + Number(order.shippingFee)).toFixed(2);
    return this.orderRepo.save(order);
  }
}
