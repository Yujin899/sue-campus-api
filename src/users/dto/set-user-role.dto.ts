import { IsIn } from 'class-validator';
import { Role } from '../../generated/prisma/enums';

const ROLES = Object.values(Role);

export class SetUserRoleDto {
  @IsIn(ROLES)
  role!: Role;
}
