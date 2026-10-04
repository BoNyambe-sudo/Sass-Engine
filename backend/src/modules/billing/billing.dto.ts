import { IsIn } from 'class-validator';

export class CheckoutDto {
  @IsIn(['starter', 'growth', 'scale'])
  plan!: 'starter' | 'growth' | 'scale';
}
