import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [JwtModule.register({}),],
  providers: [AuthService,],
  controllers: [AuthController],
  exports: [JwtModule,],
})
export class AuthModule { }
