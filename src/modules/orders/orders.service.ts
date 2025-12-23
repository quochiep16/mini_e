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

type CheckoutSnapshot = {
  address: {
    fullName: string;
    phone: string;
    formattedAddress: string;
    placeId?: string | null;
    lat: string;
    lng: string;
  };
  cartItemIds: number[];
  note?: string | null;
  items: Array<{
    cartItemId: number;
    productId: number;
    variantId: number | null;
    title: string;
    variantName?: string | null;
    imageId?: number | null;
    imageUrl?: string | null;
    price: number;
    quantity: number;
    value1?: string | null;
    value2?: string | null;
    value3?: string | null;
    value4?: string | null;
    value5?: string | null;
  }>;
};

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
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `OD${d}-${n}`;
  }
  private genSessionCode() {
    const n = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `PM${d}-${n}`;
  }

  private normalizeIp(ip?: string) {
    if (!ip) return '127.0.0.1';
    // express hay trả "::ffff:127.0.0.1"
    return ip.startsWith('::ffff:') ? ip.replace('::ffff:', '') : ip;
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

  /** Nhóm theo productId (mỗi product => 1 order) */
  private async groupByProduct(selected: any[]) {
    const productIds = Array.from(new Set(selected.map((i: any) => i.productId)));
    const prods = await this.productRepo.find({ where: { id: In(productIds) } as any });
    const prodMap = new Map(prods.map((p) => [p.id, p]));
    const groups = new Map<number, any[]>();

    for (const it of selected) {
      const p = prodMap.get(it.productId);
      if (!p) throw new BadRequestException('Sản phẩm không tồn tại');
      if (!groups.has(p.id)) groups.set(p.id, []);
      (groups.get(p.id) as any[]).push({ ...it, _prod: p });
    }
    return { groups, prodMap };
  }

  async preview(userId: number, dto: PreviewOrderDto) {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items?.length) throw new BadRequestException('Giỏ hàng trống');

    const selected = this.pickItems(cart, dto.itemIds);
    if (!selected.length) throw new BadRequestException('Chưa chọn sản phẩm nào');

    const addr = await this.getAddress(userId, dto.addressId);
    const { groups, prodMap } = await this.groupByProduct(selected);

    const imageIds = Array.from(new Set(selected.map((i: any) => i.imageId).filter(Boolean)));
    const images = imageIds.length ? await this.imageRepo.find({ where: { id: In(imageIds) } as any }) : [];
    const imgMap = new Map(images.map((im) => [im.id, im.url]));

    const resultOrders: any[] = [];
    let sumSubtotal = 0,
      sumShipping = 0;

    for (const [productId, items] of groups.entries()) {
      const p = prodMap.get(productId)!;
      const shop = await this.shopRepo.findOne({ where: { id: p.shopId } as any });
      if (!shop) throw new BadRequestException('Shop không tồn tại');

      const shopLat = +(shop as any).shopLat;
      const shopLng = +(shop as any).shopLng;
      if (isNaN(shopLat) || isNaN(shopLng)) throw new BadRequestException('Shop chưa cấu hình tọa độ');

      const subtotal = items.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
      const distanceKm = haversineKm(shopLat, shopLng, +addr.lat!, +addr.lng!);
      const shippingFee = calcShippingFee(distanceKm, subtotal);
      const total = subtotal + shippingFee;

      resultOrders.push({
        product: { id: p.id, title: (p as any).title },
        items: items.map((i: any) => ({
          id: i.id,
          variantId: i.variantId ?? null,
          name: i.variantName ? `${i.title} - ${i.variantName}` : i.title,
          imageUrl: i.imageUrl ?? (i.imageId ? imgMap.get(i.imageId) ?? null : null),
          price: +Number(i.price).toFixed(2),
          quantity: i.quantity,
          totalLine: +Number(Number(i.price) * i.quantity).toFixed(2),
        })),
        distanceKm: +distanceKm.toFixed(2),
        subtotal: +subtotal.toFixed(2),
        shippingFee,
        total: +total.toFixed(2),
      });

      sumSubtotal += subtotal;
      sumShipping += shippingFee;
    }

    return {
      address: {
        id: addr.id,
        fullName: addr.fullName,
        phone: addr.phone,
        formattedAddress: addr.formattedAddress,
      },
      orders: resultOrders,
      summary: {
        subtotal: +sumSubtotal.toFixed(2),
        shippingFee: sumShipping,
        total: +(sumSubtotal + sumShipping).toFixed(2),
      },
    };
  }

  /**
   * ✅ COD: tạo order ngay + xoá cart
   * ✅ VNPAY: chỉ tạo PaymentSession + trả paymentUrl (QR chuẩn nằm trên VNPAY gateway)
   */
  async create(userId: number, dto: CreateOrderDto, ipAddress = '127.0.0.1') {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items?.length) throw new BadRequestException('Giỏ hàng trống');

    const selected = this.pickItems(cart, dto.itemIds);
    if (!selected.length) throw new BadRequestException('Chưa chọn sản phẩm nào');

    const addr = await this.getAddress(userId, dto.addressId);
    const { groups, prodMap } = await this.groupByProduct(selected);

    // ====== VNPAY: CHỈ TẠO SESSION ======
    if (dto.paymentMethod === PaymentMethod.VNPAY) {
      // tính tổng tiền
      let totalAmount = 0;

      for (const [productId, items] of groups.entries()) {
        const p = prodMap.get(productId)!;
        const shop = await this.shopRepo.findOne({ where: { id: p.shopId } as any });
        if (!shop) throw new BadRequestException('Shop không tồn tại');

        const shopLat = +(shop as any).shopLat;
        const shopLng = +(shop as any).shopLng;
        if (isNaN(shopLat) || isNaN(shopLng)) throw new BadRequestException('Shop chưa cấu hình tọa độ');

        // check tồn kho (chỉ check, chưa trừ)
        const vIds = Array.from(new Set(items.map((i: any) => i.variantId).filter(Boolean)));
        const vars = vIds.length ? await this.variantRepo.find({ where: { id: In(vIds) } as any }) : [];
        const varMap = new Map(vars.map((v) => [v.id, v]));

        for (const it of items) {
          if (it.variantId) {
            const v = varMap.get(it.variantId);
            if (!v) throw new BadRequestException('Biến thể không tồn tại');
            if (v.stock != null && v.stock < it.quantity) throw new BadRequestException(`SKU ${v.sku} không đủ tồn`);
          } else if (p.stock != null && p.stock < it.quantity) {
            throw new BadRequestException(`Sản phẩm ${p.title} không đủ tồn`);
          }
        }

        const subtotal = items.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
        const distanceKm = haversineKm(shopLat, shopLng, +addr.lat!, +addr.lng!);
        const shippingFee = calcShippingFee(distanceKm, subtotal);
        totalAmount += subtotal + shippingFee;
      }

      // snapshot để sau khi thanh toán mới tạo order
      const snapshot: CheckoutSnapshot = {
        address: {
          fullName: addr.fullName,
          phone: addr.phone,
          formattedAddress: addr.formattedAddress,
          placeId: addr.placeId,
          lat: String(addr.lat),
          lng: String(addr.lng),
        },
        cartItemIds: selected.map((i: any) => Number(i.id)),
        note: dto.note ?? null,
        items: selected.map((i: any) => ({
          cartItemId: Number(i.id),
          productId: Number(i.productId),
          variantId: i.variantId ? Number(i.variantId) : null,
          title: String(i.title),
          variantName: i.variantName ?? null,
          imageId: i.imageId ? Number(i.imageId) : null,
          imageUrl: i.imageUrl ?? null,
          price: Number(i.price),
          quantity: Number(i.quantity),
          value1: i.value1 ?? null,
          value2: i.value2 ?? null,
          value3: i.value3 ?? null,
          value4: i.value4 ?? null,
          value5: i.value5 ?? null,
        })),
      };

      // tạo session
      let sessionCode = this.genSessionCode();
      for (let i = 0; i < 5; i++) {
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
        ordersJson: { checkout: snapshot },
      });

      const saved = await this.sessionRepo.save(session);

      const paymentUrl = this.pg.createVnPayUrl({
        code: saved.code,
        amount: totalAmount,
        ipAddress: this.normalizeIp(ipAddress),
      });

      return {
        session: { code: saved.code, amount: +Number(totalAmount).toFixed(2), status: saved.status },
        paymentUrl,
      };
    }

    // ====== COD: TẠO ORDER NGAY ======
    const imageIds = Array.from(new Set(selected.map((i: any) => i.imageId).filter(Boolean)));
    const images = imageIds.length ? await this.imageRepo.find({ where: { id: In(imageIds) } as any }) : [];
    const imgMap = new Map(images.map((im) => [im.id, im.url]));

    const createdOrders: Array<{ orderId: string; code: string; total: number }> = [];

    await this.dataSource.transaction(async (trx) => {
      const orderRepo = trx.getRepository(Order);
      const itemRepo = trx.getRepository(OrderItem);
      const productRepo = trx.getRepository(Product);
      const variantRepo = trx.getRepository(ProductVariant);
      const shopRepo = trx.getRepository(Shop);

      for (const [productId, items] of groups.entries()) {
        const p = prodMap.get(productId)!;

        const shop = await shopRepo.findOne({ where: { id: p.shopId } as any });
        if (!shop) throw new BadRequestException('Shop không tồn tại');

        const shopLat = +(shop as any).shopLat;
        const shopLng = +(shop as any).shopLng;
        if (isNaN(shopLat) || isNaN(shopLng)) throw new BadRequestException('Shop chưa cấu hình tọa độ');

        // check tồn kho
        const vIds = Array.from(new Set(items.map((i: any) => i.variantId).filter(Boolean)));
        const vars = vIds.length ? await variantRepo.find({ where: { id: In(vIds) } as any }) : [];
        const varMap = new Map(vars.map((v) => [v.id, v]));

        for (const it of items) {
          if (it.variantId) {
            const v = varMap.get(it.variantId);
            if (!v) throw new BadRequestException('Biến thể không tồn tại');
            if (v.stock != null && v.stock < it.quantity) throw new BadRequestException(`SKU ${v.sku} không đủ tồn`);
          } else if (p.stock != null && p.stock < it.quantity) {
            throw new BadRequestException(`Sản phẩm ${p.title} không đủ tồn`);
          }
        }

        const subtotalNum = items.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
        const distanceKm = haversineKm(shopLat, shopLng, +addr.lat!, +addr.lng!);
        const shippingFeeNum = calcShippingFee(distanceKm, subtotalNum);
        const totalNum = subtotalNum + shippingFeeNum;

        // unique code
        let code = this.genOrderCode();
        for (let i = 0; i < 5; i++) {
          const existed = await orderRepo.findOne({ where: { code } });
          if (!existed) break;
          code = this.genOrderCode();
        }

        const order = orderRepo.create({
          userId,
          code,
          paymentMethod: PaymentMethod.COD,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          shippingStatus: ShippingStatus.PENDING,
          addressSnapshot: {
            fullName: addr.fullName,
            phone: addr.phone,
            formattedAddress: addr.formattedAddress,
            placeId: addr.placeId,
            lat: addr.lat,
            lng: addr.lng,
          },
          subtotal: subtotalNum.toFixed(2),
          discount: '0.00',
          shippingFee: shippingFeeNum.toFixed(2),
          total: totalNum.toFixed(2),
          note: dto.note ?? null,
        });

        const savedOrder = await orderRepo.save(order);

        for (const it of items) {
          const nameSnapshot = it.variantName ? `${it.title} - ${it.variantName}` : it.title;
          const imageSnapshot = it.imageUrl ?? (it.imageId ? imgMap.get(it.imageId) ?? null : null);
          const totalLine = Number(it.price) * it.quantity;

          await itemRepo.save(
            itemRepo.create({
              orderId: savedOrder.id,
              productId: p.id,
              productVariantId: it.variantId ?? null,
              nameSnapshot,
              imageSnapshot,
              price: Number(it.price).toFixed(2),
              quantity: it.quantity,
              totalLine: totalLine.toFixed(2),
              value1: it.value1 ?? null,
              value2: it.value2 ?? null,
              value3: it.value3 ?? null,
              value4: it.value4 ?? null,
              value5: it.value5 ?? null,
            }),
          );

          if (it.variantId) await variantRepo.decrement({ id: it.variantId } as any, 'stock', it.quantity);
          else await productRepo.decrement({ id: p.id } as any, 'stock', it.quantity);
        }

        createdOrders.push({ orderId: savedOrder.id, code: savedOrder.code, total: +totalNum.toFixed(2) });
      }
    });

    await this.cartService.removeMany(userId, selected.map((i: any) => Number(i.id)));
    return { orders: createdOrders };
  }

  /**
   * ✅ Sau khi VNPAY trả thành công (00) => tạo order + trừ kho + xoá cart
   * Idempotent: gọi nhiều lần không tạo trùng.
   */
  async finalizeVnPayPaid(sessionCode: string, ret: { responseCode: string; transactionNo?: string; raw: any }) {
    const session = await this.sessionRepo.findOne({ where: { code: sessionCode } });
    if (!session) throw new NotFoundException('Payment session not found');

    // thất bại
    if (ret.responseCode !== '00') {
      session.status = PaymentSessionStatus.FAILED;
      session.paymentRef = ret.transactionNo || null;
      session.paymentMeta = ret.raw;
      await this.sessionRepo.save(session);
      return;
    }

    // đã xử lý rồi
    if (session.status === PaymentSessionStatus.PAID && session.ordersJson?.result?.orders?.length) {
      return;
    }

    const checkout: CheckoutSnapshot | undefined = session.ordersJson?.checkout;
    if (!checkout) throw new BadRequestException('Session thiếu checkout snapshot');

    const addrLat = Number(checkout.address.lat);
    const addrLng = Number(checkout.address.lng);
    if (Number.isNaN(addrLat) || Number.isNaN(addrLng)) throw new BadRequestException('Checkout snapshot thiếu tọa độ');

    const cartItemIds = (checkout.cartItemIds || []).map(Number);
    const snapItems = checkout.items || [];
    if (!snapItems.length) throw new BadRequestException('Checkout snapshot thiếu items');

    // tạo order trong transaction
    const createdOrders: Array<{ orderId: string; code: string; total: number }> = await this.dataSource.transaction(
      async (trx) => {
        const sessionRepo = trx.getRepository(PaymentSession);
        const orderRepo = trx.getRepository(Order);
        const itemRepo = trx.getRepository(OrderItem);
        const productRepo = trx.getRepository(Product);
        const variantRepo = trx.getRepository(ProductVariant);
        const imageRepo = trx.getRepository(ProductImage);
        const shopRepo = trx.getRepository(Shop);

        // lock session (tránh tạo trùng)
        const locked = await sessionRepo.findOne({
          where: { code: sessionCode },
          lock: { mode: 'pessimistic_write' as any },
        });
        if (!locked) throw new NotFoundException('Payment session not found');

        if (locked.status === PaymentSessionStatus.PAID && locked.ordersJson?.result?.orders?.length) {
          return locked.ordersJson.result.orders;
        }

        // load products
        const productIds = Array.from(new Set(snapItems.map((i) => i.productId)));
        const prods = await productRepo.find({ where: { id: In(productIds) } as any });
        const prodMap = new Map(prods.map((p) => [p.id, p]));

        // group by product
        const groups = new Map<number, typeof snapItems>();
        for (const it of snapItems) {
          const p = prodMap.get(it.productId);
          if (!p) throw new BadRequestException('Sản phẩm không tồn tại');
          if (!groups.has(p.id)) groups.set(p.id, [] as any);
          (groups.get(p.id) as any).push(it);
        }

        // image map
        const imageIds = Array.from(new Set(snapItems.map((i) => i.imageId).filter(Boolean))) as number[];
        const images = imageIds.length ? await imageRepo.find({ where: { id: In(imageIds) } as any }) : [];
        const imgMap = new Map(images.map((im: any) => [im.id, im.url]));

        const results: Array<{ orderId: string; code: string; total: number }> = [];

        for (const [productId, items] of groups.entries()) {
          const p: any = prodMap.get(productId)!;

          const shop = await shopRepo.findOne({ where: { id: p.shopId } as any });
          if (!shop) throw new BadRequestException('Shop không tồn tại');

          const shopLat = +(shop as any).shopLat;
          const shopLng = +(shop as any).shopLng;
          if (Number.isNaN(shopLat) || Number.isNaN(shopLng)) throw new BadRequestException('Shop chưa cấu hình tọa độ');

          // load variants
          const vIds = Array.from(new Set(items.map((i: any) => i.variantId).filter(Boolean))) as number[];
          const vars = vIds.length ? await variantRepo.find({ where: { id: In(vIds) } as any }) : [];
          const varMap = new Map(vars.map((v: any) => [v.id, v]));

          // check stock + compute totals
          for (const it of items as any) {
            if (it.variantId) {
              const v: any = varMap.get(it.variantId);
              if (!v) throw new BadRequestException('Biến thể không tồn tại');
              if (v.stock != null && v.stock < it.quantity) throw new BadRequestException(`SKU ${v.sku} không đủ tồn`);
            } else if (p.stock != null && p.stock < it.quantity) {
              throw new BadRequestException(`Sản phẩm ${p.title} không đủ tồn`);
            }
          }

          const subtotalNum = (items as any).reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
          const distanceKm = haversineKm(shopLat, shopLng, addrLat, addrLng);
          const shippingFeeNum = calcShippingFee(distanceKm, subtotalNum);
          const totalNum = subtotalNum + shippingFeeNum;

          // unique order code
          let code = this.genOrderCode();
          for (let i = 0; i < 5; i++) {
            const existed = await orderRepo.findOne({ where: { code } });
            if (!existed) break;
            code = this.genOrderCode();
          }

          const order = orderRepo.create({
            userId: locked.userId,
            code,
            paymentMethod: PaymentMethod.VNPAY,
            status: OrderStatus.PAID,
            paymentStatus: PaymentStatus.PAID,
            shippingStatus: ShippingStatus.PENDING,
            paymentRef: ret.transactionNo || null,
            paymentMeta: { sessionCode: locked.code },
            addressSnapshot: checkout.address,
            subtotal: subtotalNum.toFixed(2),
            discount: '0.00',
            shippingFee: shippingFeeNum.toFixed(2),
            total: totalNum.toFixed(2),
            note: checkout.note ?? null,
          });

          const savedOrder = await orderRepo.save(order);

          for (const it of items as any) {
            const nameSnapshot = it.variantName ? `${it.title} - ${it.variantName}` : it.title;
            const imageSnapshot = it.imageUrl ?? (it.imageId ? imgMap.get(it.imageId) ?? null : null);
            const totalLine = Number(it.price) * it.quantity;

            await itemRepo.save(
              itemRepo.create({
                orderId: savedOrder.id,
                productId: it.productId,
                productVariantId: it.variantId ?? null,
                nameSnapshot,
                imageSnapshot,
                price: Number(it.price).toFixed(2),
                quantity: it.quantity,
                totalLine: totalLine.toFixed(2),
                value1: it.value1 ?? null,
                value2: it.value2 ?? null,
                value3: it.value3 ?? null,
                value4: it.value4 ?? null,
                value5: it.value5 ?? null,
              }),
            );

            if (it.variantId) await variantRepo.decrement({ id: it.variantId } as any, 'stock', it.quantity);
            else await productRepo.decrement({ id: it.productId } as any, 'stock', it.quantity);
          }

          results.push({ orderId: savedOrder.id, code: savedOrder.code, total: +totalNum.toFixed(2) });
        }

        locked.status = PaymentSessionStatus.PAID;
        locked.paymentRef = ret.transactionNo || null;
        locked.paymentMeta = ret.raw;
        locked.ordersJson = {
          ...(locked.ordersJson || {}),
          result: { orders: results },
        };
        await sessionRepo.save(locked);

        return results;
      },
    );

    // xoá cart sau khi tạo order thành công
    try {
      if (cartItemIds.length) {
        await this.cartService.removeMany(session.userId, cartItemIds);
      }
    } catch {
      // ignore
    }

    return createdOrders;
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

  async updateStatus(
    id: string,
    patch: { status?: OrderStatus; paymentStatus?: PaymentStatus; shippingStatus?: ShippingStatus },
  ) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (patch.status) order.status = patch.status;
    if (patch.paymentStatus) order.paymentStatus = patch.paymentStatus;
    if (patch.shippingStatus) order.shippingStatus = patch.shippingStatus;

    order.total = (Number(order.subtotal) - Number(order.discount) + Number(order.shippingFee)).toFixed(2);
    return this.orderRepo.save(order);
  }

  async confirmReceived(userId: number, orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (order.shippingStatus !== ShippingStatus.DELIVERED) {
      throw new BadRequestException('Đơn hàng chưa ở trạng thái DELIVERED nên chưa thể xác nhận nhận hàng');
    }

    // đã completed rồi thì thôi
    if (order.status === OrderStatus.COMPLETED) return order;

    order.status = OrderStatus.COMPLETED;

    // COD thường thanh toán khi nhận hàng
    if (order.paymentMethod === PaymentMethod.COD && order.paymentStatus !== PaymentStatus.PAID) {
      order.paymentStatus = PaymentStatus.PAID;
    }

    return this.orderRepo.save(order);
  }

}
