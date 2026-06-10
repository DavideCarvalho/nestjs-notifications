import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  // POST http://localhost:3000/invoices/paid
  //   { "userId": 1, "email": "a@b.com", "invoiceId": "INV-1", "amount": 42 }
}

void bootstrap();
