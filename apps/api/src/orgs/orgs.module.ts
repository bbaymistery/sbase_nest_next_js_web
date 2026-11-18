import { Module } from '@nestjs/common';
import { OrgsService } from './orgs.service.js';
import { OrgsController } from './orgs.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  providers: [OrgsService],
  controllers: [OrgsController],
  exports: [OrgsService],
})
export class OrgsModule {}
