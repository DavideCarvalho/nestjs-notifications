import { Body, Controller, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { User } from './user';

interface PayInvoiceDto {
  userId: number;
  email: string;
  invoiceId: string;
  amount: number;
}

@Controller('invoices')
export class AppController {
  constructor(private readonly app: AppService) {}

  @Post('paid')
  async paid(@Body() dto: PayInvoiceDto): Promise<{ ok: true }> {
    const user = new User(dto.userId, dto.email);
    await this.app.invoiceWasPaid(user, dto.invoiceId, dto.amount);
    return { ok: true };
  }
}
