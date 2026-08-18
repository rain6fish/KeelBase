import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EncryptionService } from '../common/utils/encryption';
import { CacheService } from '../common/cache/cache.service';
import { UploadSignService } from '../upload/upload-sign.service';
import { User, UserRole } from '../common/entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: Repository<User>;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashed_password',
    role: 'user' as any,
    nickname: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    phone: null as any,
    dateOfBirth: null as any,
    bio: null as any,
    avatarUrl: null as any,
    provider: null as any,
    providerId: null as any,
    refreshTokenHash: null as any,
    loginAttempts: 0,
    lockedUntil: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn((v: string) => `enc:${v}`),
            decrypt: jest.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
            hmac: jest.fn((v: string) => `hmac:${v}`),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            delByPrefix: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: UploadSignService, useValue: { signUrl: jest.fn((p: string) => p) } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ─── Create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateUserDto = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password1',
      nickname: 'NewUser',
      firstName: 'New',
      lastName: 'User',
    };

    it('should create a new user', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      const result = await service.create(dto);

      expect(result.username).toBe('testuser');
      expect((result as any).password).toBeUndefined();
      expect((result as any).refreshTokenHash).toBeUndefined();
    });

    it('should throw ConflictException for duplicate username', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.create(dto)).rejects.toMatchObject({ errorCode: 'USERNAME_ALREADY_EXISTS' });
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null)  // username check passes
        .mockResolvedValueOnce(mockUser); // email check fails

      await expect(service.create(dto)).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS' });
    });
  });

  // ─── Find All ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated users without sensitive fields', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockUser], 1]);

      const result = await service.findAll(1, 20, 'createdAt', 'desc');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect((result.items[0] as any).password).toBeUndefined();
    });

    it('should apply pagination correctly', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(2, 10, 'createdAt', 'asc');

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        order: { createdAt: 'asc' },
      });
    });
  });

  describe('searchUsers', () => {
    it('should return only public fields for matching users', async () => {
      mockRepository.findAndCount.mockResolvedValue([
        [{
          ...mockUser,
          email: 'secret@example.com',
          phone: 'enc:+8613800138000',
          role: 'admin',
        }],
        1,
      ]);

      const result = await service.searchUsers('alex', 1, 10);

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        nickname: mockUser.nickname,
        avatarUrl: mockUser.avatarUrl,
      });
      // 私有字段不泄露
      expect((result.items[0] as any).email).toBeUndefined();
      expect((result.items[0] as any).phone).toBeUndefined();
      expect((result.items[0] as any).role).toBeUndefined();
    });

    it('should match username and nickname with LIKE', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.searchUsers('nick', 1, 5);

      const args = mockRepository.findAndCount.mock.calls[0][0];
      expect(args.where).toBeInstanceOf(Array);
      expect(args.where).toHaveLength(2);
      expect(args.skip).toBe(0);
      expect(args.take).toBe(5);
    });
  });

  // ─── Find One ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a user without sensitive fields', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(result.username).toBe('testuser');
      expect((result as any).password).toBeUndefined();
      expect((result as any).refreshTokenHash).toBeUndefined();
    });

    it('returns from cache on second call (no repo hit)', async () => {
      const cache = (service as any).cacheService;
      cache.get.mockResolvedValueOnce(undefined); // first: miss
      cache.get.mockResolvedValueOnce({ username: 'cached' }); // second: hit
      mockRepository.findOne.mockResolvedValue(mockUser);

      await service.findOne(1);
      const second = await service.findOne(1);

      expect(second.username).toBe('cached');
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto: UpdateUserDto = {
      nickname: 'UpdatedNick',
      firstName: 'Updated',
    };

    it('should update user fields', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue({ ...mockUser, nickname: 'UpdatedNick' });

      const result = await service.update(1, dto);

      expect(result.nickname).toBe('UpdatedNick');
      // 更新后清缓存
      expect((service as any).cacheService.delete).toHaveBeenCalledWith('user:1');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser)  // find the user to update
        .mockResolvedValueOnce({ ...mockUser, id: 2 }); // another user has this email

      const emailDto: UpdateUserDto = { email: 'taken@example.com' };
      await expect(service.update(1, emailDto)).rejects.toThrow(ConflictException);
    });

    it('should rehash password when provided', async () => {
      const originalPassword = mockUser.password;
      const userCopy = { ...mockUser };
      mockRepository.findOne.mockResolvedValue(userCopy);
      mockRepository.save.mockImplementation((user: any) => Promise.resolve(user));

      const passwordDto: UpdateUserDto = { password: 'NewPass123' };
      await service.update(1, passwordDto);

      // save should have been called with a user whose password was updated
      const savedUser = mockRepository.save.mock.calls[0][0];
      expect(savedUser.password).not.toBe('NewPass123'); // should be hashed
      expect(savedUser.password).not.toBe(originalPassword); // should be different from original
    });
  });

  // ─── Remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete user and return void', async () => {
      mockRepository.count.mockResolvedValue(2); // not the last admin
      mockRepository.delete.mockResolvedValue({ affected: 1, raw: {} } as any);

      await expect(service.remove(1)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockRepository.count.mockResolvedValue(2);
      mockRepository.delete.mockResolvedValue({ affected: 0, raw: {} } as any);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('should reject deleting the last admin', async () => {
      const adminUser = { ...mockUser, id: 5, role: 'admin' as any };
      mockRepository.count.mockResolvedValue(1); // only one admin
      mockRepository.findOne.mockResolvedValue(adminUser);

      await expect(service.remove(5)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Update Role ──────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('should update a user role', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockImplementation((u: any) => Promise.resolve({ ...u, role: 'admin' }));

      const result = await service.updateRole(1, UserRole.ADMIN);

      expect(result.role).toBe(UserRole.ADMIN);
      expect((result as any).password).toBeUndefined();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.updateRole(999, UserRole.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('should reject demoting the last admin', async () => {
      const adminUser = { ...mockUser, id: 5, role: 'admin' as any };
      mockRepository.findOne.mockResolvedValue(adminUser);
      mockRepository.count.mockResolvedValue(1); // only one admin

      await expect(service.updateRole(5, UserRole.USER)).rejects.toThrow(BadRequestException);
    });
  });
});
