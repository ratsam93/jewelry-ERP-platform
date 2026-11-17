import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { installBigIntJson } from './bigint-json';

// REST responses contain Prisma BigInt fields (money in paise, weights in mg);
// serialize them as decimal strings, like the tRPC transformer does. Installed
// here as well as in main.ts so test apps built from AppModule behave the same.
installBigIntJson();

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class CommonModule {}
