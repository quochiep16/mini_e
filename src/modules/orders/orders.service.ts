import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Order, OrderStatus, PaymentMethod, PaymentStatus, ShippingStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PreviewOrderDto, CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CartService } from '../cart/cart.service';
import { Address } from '../addresses/entities/address.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Shop } from '../shops/entities/shop.entity';
import { ShopStats } from '../shops/entities/shop-stats.entity';
import { haversineKm, calcShippingFee } from '../../common/utils/shipping.util';
import { PaymentGatewayService } from './payment.gateway';
import { PaymentSession, PaymentSessionStatus } from './entities/payment-session.entity';

type AddressLike = {
  fullName?: string;
  phone?: string;
  formattedAddress?: string;
  placeId?: string | null;
  lat?: string | number;
  lng?: string | number;
};

type CheckoutAddressSnapshot = {
  fullName: string;
  phone: string;
  formattedAddress: string;
  placeId?: string | null;
  lat: string;
  lng: string;
};

type CheckoutItemSnapshot = {
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
};

type CheckoutSnapshot = {
  address: CheckoutAddressSnapshot;
  cartItemIds: number[];
  note?: string | null;
  items: CheckoutItemSnapshot[];
};

type PreparedItem = CheckoutItemSnapshot & {
  _prod: Product;
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
    @InjectRepository(ShopStats) private readonly shopStatsRepo: Repository<ShopStats>,
    @InjectRepository(PaymentSession) private readonly sessionRepo: Repository<PaymentSession>,
  ) {}

  private async applyShopStatsOnCompleted(orderId: string) {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('p.shop_id', 'shopId')
      .addSelect('SUM(oi.quantity)', 'qty')
      .addSelect('SUM(oi.total_line)', 'lines')
      .addSelect('COUNT(DISTINCT oi.product_id)', 'productCount')
      .from('order_items', 'oi')
      .innerJoin('products', 'p', 'p.id = oi.product_id')
      .where('oi.order_id = :orderId', { orderId })
      .groupBy('p.shop_id')
      .getRawMany<{ shopId: string; qty: string; lines: string; productCount: string }>();

    for (const r of rows) {
      const shopId = Number(r.shopId);
      if (!shopId) continue;

      const qty = Number(r.qty || 0);
      const lines = Number(r.lines || 0);

      let stats = await this.shopStatsRepo.findOne({ where: { shopId } as any });
      if (!stats) {
        stats = await this.shopStatsRepo.save({
          shopId,
          productCount: 0,
          totalSold: 0,
          totalRevenue: 0,
          totalOrders: 0,
        } as Partial<ShopStats>);
      }

      stats.totalOrders = Number((stats as any).totalOrders ?? 0) + 1;
      stats.totalSold = Number((stats as any).totalSold ?? 0) + Math.max(0, qty);
      stats.totalRevenue = Number((stats as any).totalRevenue ?? 0) + Math.max(0, lines);

      await this.shopStatsRepo.save(stats);
    }

    const prodRows = await this.dataSource
      .createQueryBuilder()
      .select('oi.product_id', 'productId')
      .addSelect('SUM(oi.quantity)', 'qty')
      .from('order_items', 'oi')
      .where('oi.order_id = :orderId', { orderId })
      .groupBy('oi.product_id')
      .getRawMany<{ productId: string; qty: string }>();

    for (const pr of prodRows) {
      const pid = Number(pr.productId);
      const q = Number(pr.qty || 0);
      if (!pid || q <= 0) continue;
      await this.productRepo.increment({ id: pid } as any, 'sold', q);
    }
  }

  private genOrderCode() {
    const n = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `OD${d}-${n}`;
  }

  private genSessionCode() {
    const n = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `PM${d}-${n}`;
  }

  private normalizeIp(ip?: string) {
    if (!ip) return '127.0.0.1';
    return ip.startsWith('::ffff:') ? ip.replace('::ffff:', '') : ip;
  }

  private pickItems(cart: any, itemIds?: number[]) {
    if (!itemIds?.length) return cart.items || [];
    const set = new Set(itemIds.map(Number));
    const selected = (cart.items || []).filter((i: any) => set.has(Number(i.id)));
    if (selected.length !== set.size) {
      throw new BadRequestException('Một số cart item không tồn tại');
    }
    return selected;
  }

  private async getAddress(userId: number, addressId?: number) {
    const addr = addressId
      ? await this.addrRepo.findOne({ where: { id: addressId, userId } as any })
      : await this.addrRepo.findOne({ where: { userId, isDefault: true } as any });

    if (!addr) throw new BadRequestException('Chưa chọn địa chỉ và không có địa chỉ mặc định');
    if (addr.lat == null || addr.lng == null) {
      throw new BadRequestException('Địa chỉ chưa có toạ độ');
    }

    return addr;
  }

  private async generateUniqueOrderCode(orderRepo: Repository<Order>) {
    let code = this.genOrderCode();
    for (let i = 0; i < 10; i++) {
      const existed = await orderRepo.findOne({ where: { code } });
      if (!existed) return code;
      code = this.genOrderCode();
    }
    throw new BadRequestException('Không thể tạo mã đơn hàng, vui lòng thử lại');
  }

  private async generateUniqueSessionCode(sessionRepo: Repository<PaymentSession>) {
    let code = this.genSessionCode();
    for (let i = 0; i < 10; i++) {
      const existed = await sessionRepo.findOne({ where: { code } });
      if (!existed) return code;
      code = this.genSessionCode();
    }
    throw new BadRequestException('Không thể tạo mã thanh toán, vui lòng thử lại');
  }

  private async groupByShop(
    items: any[],
    productRepo: Repository<Product> = this.productRepo,
  ): Promise<{
    groups: Map<number, PreparedItem[]>;
    prodMap: Map<number, Product>;
  }> {
    const productIds = Array.from(new Set(items.map((i: any) => Number(i.productId))));
    const prods = await productRepo.find({ where: { id: In(productIds) } as any });
    const prodMap = new Map(prods.map((p) => [p.id, p]));
    const groups = new Map<number, PreparedItem[]>();

    for (const raw of items) {
      const productId = Number(raw.productId);
      const p = prodMap.get(productId);
      if (!p) throw new BadRequestException('Sản phẩm không tồn tại');

      const shopId = Number((p as any).shopId);
      if (!shopId) throw new BadRequestException('Sản phẩm chưa gắn shop');

      const prepared: PreparedItem = {
        cartItemId: Number(raw.cartItemId ?? raw.id),
        productId,
        variantId: raw.variantId != null ? Number(raw.variantId) : null,
        title: String(raw.title),
        variantName: raw.variantName ?? null,
        imageId: raw.imageId != null ? Number(raw.imageId) : null,
        imageUrl: raw.imageUrl ?? null,
        price: Number(raw.price),
        quantity: Number(raw.quantity),
        value1: raw.value1 ?? null,
        value2: raw.value2 ?? null,
        value3: raw.value3 ?? null,
        value4: raw.value4 ?? null,
        value5: raw.value5 ?? null,
        _prod: p,
      };

      if (!groups.has(shopId)) groups.set(shopId, []);
      groups.get(shopId)!.push(prepared);
    }

    return { groups, prodMap };
  }

  private async getImageMap(
    items: Array<{ imageId?: number | null }>,
    imageRepo: Repository<ProductImage> = this.imageRepo,
  ) {
    const imageIds = Array.from(new Set(items.map((i) => i.imageId).filter(Boolean))) as number[];
    const images = imageIds.length ? await imageRepo.find({ where: { id: In(imageIds) } as any }) : [];
    return new Map(images.map((im: any) => [im.id, im.url]));
  }

  private async getShopMap(shopIds: number[], shopRepo: Repository<Shop> = this.shopRepo) {
    const shops = shopIds.length ? await shopRepo.find({ where: { id: In(shopIds) } as any }) : [];
    return new Map(shops.map((s) => [Number((s as any).id), s]));
  }

  private calcGroupTotals(items: PreparedItem[], shop: Shop, address: AddressLike) {
    const shopLat = Number((shop as any).shopLat);
    const shopLng = Number((shop as any).shopLng);
    const addrLat = Number(address.lat);
    const addrLng = Number(address.lng);

    if (Number.isNaN(shopLat) || Number.isNaN(shopLng)) {
      throw new BadRequestException('Shop chưa cấu hình tọa độ');
    }

    if (address.lat == null || address.lng == null || Number.isNaN(addrLat) || Number.isNaN(addrLng)) {
      throw new BadRequestException('Địa chỉ chưa có toạ độ');
    }

    const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const distanceKm = haversineKm(shopLat, shopLng, addrLat, addrLng);
    const shippingFee = calcShippingFee(distanceKm, subtotal);
    const total = subtotal + shippingFee;

    return {
      distanceKm: +distanceKm.toFixed(2),
      subtotal: +subtotal.toFixed(2),
      shippingFee,
      total: +total.toFixed(2),
    };
  }

  private async getVariantMap(
    items: PreparedItem[],
    variantRepo: Repository<ProductVariant> = this.variantRepo,
  ) {
    const variantIds = Array.from(
      new Set(items.map((i) => i.variantId).filter((v): v is number => v != null)),
    );
    const variants = variantIds.length ? await variantRepo.find({ where: { id: In(variantIds) } as any }) : [];
    return new Map(variants.map((v: any) => [v.id, v]));
  }

  private async ensureStockAvailableForGroup(
    items: PreparedItem[],
    variantRepo: Repository<ProductVariant> = this.variantRepo,
  ) {
    const variantMap = await this.getVariantMap(items, variantRepo);

    for (const it of items) {
      if (it.variantId) {
        const v: any = variantMap.get(it.variantId);
        if (!v) throw new BadRequestException('Biến thể không tồn tại');
        if (v.productId && Number(v.productId) !== Number(it.productId)) {
          throw new BadRequestException('Biến thể không thuộc sản phẩm đã chọn');
        }
        if (v.stock != null && Number(v.stock) < it.quantity) {
          throw new BadRequestException(`SKU ${v.sku} không đủ tồn`);
        }
      } else {
        const p: any = it._prod;
        if (p.stock != null && Number(p.stock) < it.quantity) {
          throw new BadRequestException(`Sản phẩm ${p.title} không đủ tồn`);
        }
      }
    }
  }

  private async reserveStockForGroup(items: PreparedItem[], trx: EntityManager) {
    const variantRepo = trx.getRepository(ProductVariant);
    const productRepo = trx.getRepository(Product);
    const variantMap = await this.getVariantMap(items, variantRepo);

    for (const it of items) {
      if (it.variantId) {
        const v: any = variantMap.get(it.variantId);
        if (!v) throw new BadRequestException('Biến thể không tồn tại');

        if (v.stock == null) continue;

        const rs = await variantRepo
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ stock: () => `stock - ${it.quantity}` } as any)
          .where('id = :id', { id: it.variantId })
          .andWhere('stock >= :qty', { qty: it.quantity })
          .execute();

        if (!rs.affected) {
          throw new BadRequestException(`SKU ${v.sku} không đủ tồn`);
        }
      } else {
        const p: any = it._prod;

        if (p.stock == null) continue;

        const rs = await productRepo
          .createQueryBuilder()
          .update(Product)
          .set({ stock: () => `stock - ${it.quantity}` } as any)
          .where('id = :id', { id: it.productId })
          .andWhere('stock >= :qty', { qty: it.quantity })
          .execute();

        if (!rs.affected) {
          throw new BadRequestException(`Sản phẩm ${p.title} không đủ tồn`);
        }
      }
    }
  }

  private async createOrderForGroup(params: {
    trx: EntityManager;
    userId: number;
    shop: Shop;
    items: PreparedItem[];
    address: CheckoutAddressSnapshot | AddressLike;
    imageMap: Map<number, string>;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    status: OrderStatus;
    shippingStatus: ShippingStatus;
    paymentRef?: string | null;
    paymentMeta?: any;
    note?: string | null;
  }) {
    const { trx, userId, shop, items, address, imageMap } = params;
    const orderRepo = trx.getRepository(Order);
    const itemRepo = trx.getRepository(OrderItem);

    await this.reserveStockForGroup(items, trx);

    const totals = this.calcGroupTotals(items, shop, address);
    const code = await this.generateUniqueOrderCode(orderRepo);

    const order = orderRepo.create({
      userId,
      code,
      paymentMethod: params.paymentMethod,
      status: params.status,
      paymentStatus: params.paymentStatus,
      shippingStatus: params.shippingStatus,
      paymentRef: params.paymentRef ?? null,
      paymentMeta: params.paymentMeta ?? null,
      addressSnapshot: {
        fullName: address.fullName,
        phone: address.phone,
        formattedAddress: address.formattedAddress,
        placeId: address.placeId ?? null,
        lat: address.lat,
        lng: address.lng,
      },
      subtotal: totals.subtotal.toFixed(2),
      discount: '0.00',
      shippingFee: Number(totals.shippingFee).toFixed(2),
      total: totals.total.toFixed(2),
      note: params.note ?? null,
    });

    const savedOrder = await orderRepo.save(order);

    for (const it of items) {
      const nameSnapshot = it.variantName ? `${it.title} - ${it.variantName}` : it.title;
      const imageSnapshot = it.imageUrl ?? (it.imageId ? imageMap.get(it.imageId) ?? null : null);
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
    }

    return {
      orderId: savedOrder.id,
      code: savedOrder.code,
      total: totals.total,
    };
  }

  async preview(userId: number, dto: PreviewOrderDto) {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items?.length) throw new BadRequestException('Giỏ hàng trống');

    const selected = this.pickItems(cart, dto.itemIds);
    if (!selected.length) throw new BadRequestException('Chưa chọn sản phẩm nào');

    const addr = await this.getAddress(userId, dto.addressId);
    const { groups } = await this.groupByShop(selected);
    const imageMap = await this.getImageMap(selected);
    const shopMap = await this.getShopMap(Array.from(groups.keys()));

    const orders: any[] = [];
    let sumSubtotal = 0;
    let sumShipping = 0;

    for (const [shopId, items] of groups.entries()) {
      const shop = shopMap.get(shopId);
      if (!shop) throw new BadRequestException('Shop không tồn tại');

      const totals = this.calcGroupTotals(items, shop, addr);

      orders.push({
        shop: {
          id: shopId,
          name: (shop as any).name,
          slug: (shop as any).slug,
        },
        items: items.map((i) => ({
          id: i.cartItemId,
          variantId: i.variantId ?? null,
          productId: i.productId,
          name: i.variantName ? `${i.title} - ${i.variantName}` : i.title,
          imageUrl: i.imageUrl ?? (i.imageId ? imageMap.get(i.imageId) ?? null : null),
          price: +Number(i.price).toFixed(2),
          quantity: i.quantity,
          totalLine: +Number(Number(i.price) * i.quantity).toFixed(2),
        })),
        distanceKm: totals.distanceKm,
        subtotal: totals.subtotal,
        shippingFee: totals.shippingFee,
        total: totals.total,
      });

      sumSubtotal += totals.subtotal;
      sumShipping += Number(totals.shippingFee);
    }

    return {
      address: {
        id: addr.id,
        fullName: addr.fullName,
        phone: addr.phone,
        formattedAddress: addr.formattedAddress,
      },
      orders,
      summary: {
        subtotal: +sumSubtotal.toFixed(2),
        shippingFee: +sumShipping.toFixed(2),
        total: +(sumSubtotal + sumShipping).toFixed(2),
      },
    };
  }

  async create(userId: number, dto: CreateOrderDto, ipAddress = '127.0.0.1') {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items?.length) throw new BadRequestException('Giỏ hàng trống');

    const selected = this.pickItems(cart, dto.itemIds);
    if (!selected.length) throw new BadRequestException('Chưa chọn sản phẩm nào');

    const addr = await this.getAddress(userId, dto.addressId);
    const { groups } = await this.groupByShop(selected);

    if (dto.paymentMethod === PaymentMethod.VNPAY) {
      const shopMap = await this.getShopMap(Array.from(groups.keys()));
      let totalAmount = 0;

      for (const [shopId, items] of groups.entries()) {
        const shop = shopMap.get(shopId);
        if (!shop) throw new BadRequestException('Shop không tồn tại');

        await this.ensureStockAvailableForGroup(items);

        const totals = this.calcGroupTotals(items, shop, addr);
        totalAmount += totals.total;
      }

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
          variantId: i.variantId != null ? Number(i.variantId) : null,
          title: String(i.title),
          variantName: i.variantName ?? null,
          imageId: i.imageId != null ? Number(i.imageId) : null,
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

      const sessionCode = await this.generateUniqueSessionCode(this.sessionRepo);

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
        session: {
          code: saved.code,
          amount: +Number(totalAmount).toFixed(2),
          status: saved.status,
        },
        paymentUrl,
      };
    }

    const imageMap = await this.getImageMap(selected);
    const createdOrders: Array<{ orderId: string; code: string; total: number }> = [];

    await this.dataSource.transaction(async (trx) => {
      const { groups: trxGroups } = await this.groupByShop(selected, trx.getRepository(Product));
      const shopMap = await this.getShopMap(Array.from(trxGroups.keys()), trx.getRepository(Shop));

      for (const [shopId, items] of trxGroups.entries()) {
        const shop = shopMap.get(shopId);
        if (!shop) throw new BadRequestException('Shop không tồn tại');

        await this.ensureStockAvailableForGroup(items, trx.getRepository(ProductVariant));

        const result = await this.createOrderForGroup({
          trx,
          userId,
          shop,
          items,
          address: addr,
          imageMap,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.UNPAID,
          status: OrderStatus.PENDING,
          shippingStatus: ShippingStatus.PENDING,
          note: dto.note ?? null,
        });

        createdOrders.push(result);
      }
    });

    try {
      await this.cartService.removeMany(userId, selected.map((i: any) => Number(i.id)));
    } catch {
      // ignore
    }

    return { orders: createdOrders };
  }

  async finalizeVnPayPaid(
    sessionCode: string,
    ret: { responseCode: string; transactionNo?: string; raw: any; amountRaw?: number },
  ) {
    const session = await this.sessionRepo.findOne({ where: { code: sessionCode } });
    if (!session) throw new NotFoundException('Payment session not found');

    if (ret.responseCode !== '00') {
      session.status = PaymentSessionStatus.FAILED;
      session.paymentRef = ret.transactionNo || null;
      session.paymentMeta = ret.raw;
      await this.sessionRepo.save(session);
      return;
    }

    if (session.status === PaymentSessionStatus.PAID && session.ordersJson?.result?.orders?.length) {
      return session.ordersJson.result.orders;
    }

    const checkout: CheckoutSnapshot | undefined = session.ordersJson?.checkout;
    if (!checkout) throw new BadRequestException('Session thiếu checkout snapshot');
    if (!checkout.items?.length) throw new BadRequestException('Checkout snapshot thiếu items');

    const createdOrders: Array<{ orderId: string; code: string; total: number }> =
      await this.dataSource.transaction(async (trx) => {
        const sessionRepo = trx.getRepository(PaymentSession);
        const locked = await sessionRepo.findOne({
          where: { code: sessionCode },
          lock: { mode: 'pessimistic_write' as any },
        });

        if (!locked) throw new NotFoundException('Payment session not found');

        if (locked.status === PaymentSessionStatus.PAID && locked.ordersJson?.result?.orders?.length) {
          return locked.ordersJson.result.orders;
        }

        const { groups } = await this.groupByShop(checkout.items, trx.getRepository(Product));
        const shopMap = await this.getShopMap(Array.from(groups.keys()), trx.getRepository(Shop));
        const imageMap = await this.getImageMap(checkout.items, trx.getRepository(ProductImage));

        const results: Array<{ orderId: string; code: string; total: number }> = [];

        for (const [shopId, items] of groups.entries()) {
          const shop = shopMap.get(shopId);
          if (!shop) throw new BadRequestException('Shop không tồn tại');

          await this.ensureStockAvailableForGroup(items, trx.getRepository(ProductVariant));

          const result = await this.createOrderForGroup({
            trx,
            userId: locked.userId,
            shop,
            items,
            address: checkout.address,
            imageMap,
            paymentMethod: PaymentMethod.VNPAY,
            paymentStatus: PaymentStatus.PAID,
            status: OrderStatus.PENDING,
            shippingStatus: ShippingStatus.PENDING,
            paymentRef: ret.transactionNo || null,
            paymentMeta: {
              sessionCode: locked.code,
              vnpay: ret.raw,
            },
            note: checkout.note ?? null,
          });

          results.push(result);
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
      });

    try {
      if (checkout.cartItemIds?.length) {
        await this.cartService.removeMany(session.userId, checkout.cartItemIds.map(Number));
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

    const items = await this.orderItemRepo.find({
      where: { orderId: id },
      order: { createdAt: 'ASC' },
    });

    return { ...order, items };
  }

  private canTransitionOrderStatus(from: OrderStatus, to: OrderStatus) {
    const map: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: [],
    };
    return map[from]?.includes(to) ?? false;
  }

  private canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus) {
    const map: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.UNPAID]: [PaymentStatus.PAID],
      [PaymentStatus.PAID]: [PaymentStatus.REFUNDED],
      [PaymentStatus.REFUNDED]: [],
    };
    return map[from]?.includes(to) ?? false;
  }

  private canTransitionShippingStatus(from: ShippingStatus, to: ShippingStatus) {
    const map: Record<ShippingStatus, ShippingStatus[]> = {
      [ShippingStatus.PENDING]: [ShippingStatus.PICKED, ShippingStatus.IN_TRANSIT, ShippingStatus.CANCELED],
      [ShippingStatus.PICKED]: [ShippingStatus.IN_TRANSIT, ShippingStatus.CANCELED],
      [ShippingStatus.IN_TRANSIT]: [ShippingStatus.DELIVERED, ShippingStatus.CANCELED],
      [ShippingStatus.DELIVERED]: [ShippingStatus.RETURNED],
      [ShippingStatus.RETURNED]: [],
      [ShippingStatus.CANCELED]: [],
    };
    return map[from]?.includes(to) ?? false;
  }

  async updateStatus(id: string, patch: UpdateOrderStatusDto) {
    if (!patch.status && !patch.paymentStatus && !patch.shippingStatus) {
      throw new BadRequestException('Không có trường nào để cập nhật');
    }

    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    const oldStatus = order.status;

    let nextStatus = order.status;
    let nextPaymentStatus = order.paymentStatus;
    let nextShippingStatus = order.shippingStatus;

    if (patch.paymentStatus && patch.paymentStatus !== order.paymentStatus) {
      if (!this.canTransitionPaymentStatus(order.paymentStatus, patch.paymentStatus)) {
        throw new BadRequestException('Chuyển trạng thái thanh toán không hợp lệ');
      }
      nextPaymentStatus = patch.paymentStatus;
    }

    if (patch.shippingStatus && patch.shippingStatus !== order.shippingStatus) {
      if (!this.canTransitionShippingStatus(order.shippingStatus, patch.shippingStatus)) {
        throw new BadRequestException('Chuyển trạng thái vận chuyển không hợp lệ');
      }
      nextShippingStatus = patch.shippingStatus;
    }

    if (patch.status && patch.status !== order.status) {
      if (patch.status === OrderStatus.PAID) {
        throw new BadRequestException('Không cập nhật order.status = PAID trực tiếp');
      }
      if (!this.canTransitionOrderStatus(order.status, patch.status)) {
        throw new BadRequestException('Chuyển trạng thái đơn hàng không hợp lệ');
      }
      nextStatus = patch.status;
    }

    if (!patch.status) {
      if (
        [ShippingStatus.PICKED, ShippingStatus.IN_TRANSIT].includes(nextShippingStatus) &&
        nextStatus === OrderStatus.PENDING
      ) {
        nextStatus = OrderStatus.PROCESSING;
      }

      if (
        nextShippingStatus === ShippingStatus.DELIVERED &&
        ![OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(nextStatus)
      ) {
        nextStatus = OrderStatus.SHIPPED;
      }

      if (nextShippingStatus === ShippingStatus.CANCELED) {
        nextStatus = OrderStatus.CANCELLED;
      }
    }

    if (
      nextStatus === OrderStatus.COMPLETED &&
      ![ShippingStatus.DELIVERED, ShippingStatus.RETURNED].includes(nextShippingStatus)
    ) {
      throw new BadRequestException('Chỉ được hoàn tất khi đơn đã giao');
    }

    order.status = nextStatus;
    order.paymentStatus = nextPaymentStatus;
    order.shippingStatus = nextShippingStatus;

    const saved = await this.orderRepo.save(order);

    if (oldStatus !== OrderStatus.COMPLETED && saved.status === OrderStatus.COMPLETED) {
      await this.applyShopStatsOnCompleted(saved.id);
    }

    return saved;
  }

  async confirmReceived(userId: number, id: string) {
    const order = await this.orderRepo.findOne({ where: { id, userId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (order.status === OrderStatus.COMPLETED) return order;
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Đơn đã bị huỷ');
    }
    if (order.shippingStatus !== ShippingStatus.DELIVERED) {
      throw new BadRequestException('Chỉ xác nhận khi đơn đã giao thành công');
    }

    order.status = OrderStatus.COMPLETED;
    const saved = await this.orderRepo.save(order);
    await this.applyShopStatsOnCompleted(saved.id);
    return saved;
  }

  async requestReturn(userId: number, id: string) {
    const order = await this.orderRepo.findOne({ where: { id, userId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Đơn đã bị huỷ');
    }

    if (
      order.shippingStatus !== ShippingStatus.DELIVERED &&
      order.shippingStatus !== ShippingStatus.RETURNED &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new BadRequestException('Chỉ yêu cầu trả hàng sau khi đơn đã giao');
    }

    if (order.shippingStatus === ShippingStatus.RETURNED) {
      return order;
    }

    order.shippingStatus = ShippingStatus.RETURNED;
    return this.orderRepo.save(order);
  }
}