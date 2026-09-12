import { Module } from '@nestjs/common';
import { AlipayAdminController, AlipayConfigService } from '../alipay-config';
import { AlipayController, AlipayService } from '../alipay';
import { AdminOrdersController, OrdersController, OrdersService } from '../orders';
import { PaymentsController, WechatPayService } from '../payments';
import {
  VirtualPaymentAdminController,
  VirtualPaymentController,
  VirtualPaymentService,
} from '../virtual-payment';

@Module({
  controllers: [
    AlipayAdminController,
    AlipayController,
    OrdersController,
    AdminOrdersController,
    PaymentsController,
    VirtualPaymentController,
    VirtualPaymentAdminController,
  ],
  providers: [
    AlipayConfigService,
    AlipayService,
    OrdersService,
    WechatPayService,
    VirtualPaymentService,
  ],
})
export class BillingModule {}
