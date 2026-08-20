import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from '../common/entities/user.entity';
import { EncryptionService } from '../common/utils/encryption';
import { CacheService } from '../common/cache/cache.service';
import { UploadSignService } from '../upload/upload-sign.service';
import { maskEmail, maskPhone } from '../common/utils/mask';
import { BusinessException } from '../common/errors/business.exception';

const USER_CACHE_TTL_MS = 300 * 1000;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private encryption: EncryptionService,
    private cacheService: CacheService,
    private uploadSign: UploadSignService,
  ) {}

  async create(dto: CreateUserDto): Promise<Partial<User>> {
    const exists = await this.usersRepository.findOne({ where: { username: dto.username } });
    if (exists) {
      throw BusinessException.of('USERNAME_ALREADY_EXISTS');
    }

    const emailExists = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (emailExists) {
      throw BusinessException.of('EMAIL_ALREADY_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = this.usersRepository.create({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
      nickname: dto.nickname,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const saved = await this.usersRepository.save(user);
    return this.sanitizeUser(saved);
  }

  async findAll(
    page = 1,
    limit = 20,
    sort = 'createdAt',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<{ items: Partial<User>[]; total: number; page: number; limit: number }> {
    const [users, total] = await this.usersRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { [sort]: order },
    });
    const items = users.map((u) => this.sanitizeForAdmin(u));
    return { items, total, page, limit };
  }

  /**
   * 公开用户搜索（全局搜索用）：仅匹配 username/nickname，
   * 只返回公开字段，不泄露 email/phone/role 等私有信息。
   */
  async searchUsers(
    keyword: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: Array<{ id: number; username: string; nickname: string; avatarUrl?: string | null }>; total: number; page: number; limit: number }> {
    const [users, total] = await this.usersRepository.findAndCount({
      where: [
        { username: Like(`%${keyword}%`) },
        { nickname: Like(`%${keyword}%`) },
      ],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    const items = users.map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl ? this.uploadSign.signUrl(u.avatarUrl) : null,
    }));
    return { items, total, page, limit };
  }

  async findOne(id: number, isAdmin = false): Promise<Partial<User>> {
    if (!isAdmin) {
      const key = `user:${id}`;
      const cached = await this.cacheService.get<Partial<User>>(key);
      if (cached) return cached;
    }

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // CR-4：管理端视图脱敏（sanitizeForAdmin），且不缓存——避免与本人视图共享缓存键
    const result = isAdmin ? this.sanitizeForAdmin(user) : this.sanitizeUser(user);
    if (!isAdmin) {
      await this.cacheService.set(`user:${id}`, result, USER_CACHE_TTL_MS);
    }
    return result;
  }

  /** WEB-FRONT-4：标记用户下次登录需改密（admin 重置默认密码/安全策略用）。 */
  async forceChangePassword(id: number): Promise<{ flagged: boolean }> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.usersRepository.update(id, { mustChangePassword: true });
    return { flagged: true };
  }

  async update(id: number, dto: UpdateUserDto): Promise<Partial<User>> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email !== undefined) {
      const emailExists = await this.usersRepository.findOne({ where: { email: dto.email } });
      if (emailExists && emailExists.id !== id) {
        throw new ConflictException('Email already exists');
      }
      user.email = dto.email;
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.dateOfBirth !== undefined) user.dateOfBirth = dto.dateOfBirth;
    if (dto.phone !== undefined) {
      // 与 bindPhone/loginPhone 一致：同步写 phoneHash（否则改号后无法手机号登录）+ 唯一性检查（防绕过 SMS 验证重复绑定）
      const newHash = this.encryption.hmac(dto.phone);
      const phoneExists = await this.usersRepository.findOne({ where: { phoneHash: newHash } });
      if (phoneExists && phoneExists.id !== id) {
        throw new ConflictException('Phone already exists');
      }
      user.phone = this.encryption.encrypt(dto.phone);
      user.phoneHash = newHash;
    }
    if (dto.bio !== undefined) user.bio = dto.bio;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.password !== undefined) {
      user.password = await bcrypt.hash(dto.password, 12);
    }

    const saved = await this.usersRepository.save(user);
    const result = this.sanitizeUser(saved);
    await this.cacheService.delete(`user:${id}`);
    return result;
  }

  async remove(id: number): Promise<void> {
    // 防止系统锁死：禁止删除最后一个 admin
    await this.assertNotLastAdmin(id);
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('User not found');
    }
    await this.cacheService.delete(`user:${id}`);
  }

  async updateRole(id: number, role: UserRole): Promise<Partial<User>> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 禁止把最后一个 admin 降级，防止系统锁死
    if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      await this.assertNotLastAdmin(id);
    }

    user.role = role;
    const saved = await this.usersRepository.save(user);
    const result = this.sanitizeUser(saved);
    await this.cacheService.delete(`user:${id}`);
    return result;
  }

  private async assertNotLastAdmin(id: number): Promise<void> {
    const adminCount = await this.usersRepository.count({
      where: { role: UserRole.ADMIN },
    });
    if (adminCount <= 1) {
      const target = await this.usersRepository.findOne({ where: { id } });
      if (target?.role === UserRole.ADMIN) {
        throw new BadRequestException('不能删除或降级唯一的系统管理员');
      }
    }
  }

  /** 剔除敏感字段 + 解密 phone（phone 以密文存储，返回时需还原明文） */
  private sanitizeUser(user: User): Partial<User> {
    const { password, refreshTokenHash, loginAttempts, lockedUntil, ...rest } = user;
    if (rest.phone) {
      rest.phone = this.encryption.decrypt(rest.phone);
    }
    return rest;
  }

  /**
   * 管理端视图脱敏（原则 1：管理页面不出现用户填写的个人数据）。
   * username/ID 保留用于识别；email/phone 掩码；bio/生日/名姓/头像等隐私字段不返回。
   */
  private sanitizeForAdmin(user: User): Partial<User> {
    const rest = { ...user } as Record<string, unknown>;
    delete rest.password;
    delete rest.refreshTokenHash;
    delete rest.loginAttempts;
    delete rest.lockedUntil;
    delete rest.bio;
    delete rest.dateOfBirth;
    delete rest.firstName;
    delete rest.lastName;
    delete rest.avatarUrl;
    delete rest.provider;
    delete rest.providerId;
    delete rest.providerHash;
    rest.email = maskEmail(user.email);
    if (user.phone) rest.phone = maskPhone(this.encryption.decrypt(user.phone));
    return rest as Partial<User>;
  }
}
