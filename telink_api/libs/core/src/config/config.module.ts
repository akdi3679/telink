import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { rootConfig } from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [rootConfig],
      cache: true,
    }),
  ],
  exports: [ConfigModule],
})
export class CoreConfigModule {}