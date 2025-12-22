import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@/exception-filter/global.exception.filter';

function patchConsole() {
  const withTimestamp =
    (method: (...args: any[]) => void) =>
    (...args: any[]) => {
      const now = new Date().toISOString();
      method(`[${now}]`, ...args);
    };

  console.log = withTimestamp(console.log);
  console.info = withTimestamp(console.info);
  console.warn = withTimestamp(console.warn);
  console.error = withTimestamp(console.error);
}

patchConsole();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
