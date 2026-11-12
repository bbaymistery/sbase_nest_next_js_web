import { IsEmail, IsString, MinLength } from 'class-validator';
import type { RegisterInput } from '@sbase/types';
//>   nidanin menasi> !	Bu property mütləq initialize ediləcək
export class RegisterDto implements RegisterInput {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;
}
