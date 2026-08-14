import { UserRole } from '../../common/entities/user.entity';

export interface JwtPayload {
  sub: number;      // user id
  username: string;
  role: UserRole;
}
