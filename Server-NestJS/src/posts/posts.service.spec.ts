// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PostsService } from './posts.service';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostComment } from './post-comment.entity';
import { UserFollow } from './user-follow.entity';

describe('PostsService', () => {
  let service: PostsService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };
  // PostLike repo 独立 findOne（避免与 Post repo 共享 jest.fn 互相覆盖）
  const mockLikeRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.create.mockImplementation((d: any) => d);
    mockRepo.save.mockImplementation((d: any) => Promise.resolve(d));
    mockRepo.count.mockResolvedValue(0);
    mockRepo.findAndCount.mockResolvedValue([[], 0]);
    mockRepo.delete.mockResolvedValue({ affected: 0 });
    mockLikeRepo.create.mockImplementation((d: any) => d);
    mockLikeRepo.save.mockImplementation((d: any) => Promise.resolve(d));
    mockLikeRepo.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getRepositoryToken(Post), useValue: mockRepo },
        { provide: getRepositoryToken(PostLike), useValue: mockLikeRepo },
        { provide: getRepositoryToken(PostComment), useValue: mockRepo },
        { provide: getRepositoryToken(UserFollow), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<PostsService>(PostsService);
  });

  it('creates a post bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, userId: 5 });

    const result = await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('returns only user posts', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }]);

    const result = await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 5 } }));
    expect(result).toHaveLength(1);
  });

  it('throws when CASL forbids access', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.findOne(1, mockAbility(false))).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(1, mockAbility(true))).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true));

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  // ── GROWTH-2 社区动态流 ───────────────────────────────

  it('likePost 幂等：已赞 no-op，返回点赞数', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 }); // 帖子存在
    mockLikeRepo.findOne.mockResolvedValue(null); // 未赞过
    mockLikeRepo.count.mockResolvedValue(1);

    const res = await service.likePost(1, 5);
    expect(res.likes).toBe(1);
    // 再次点赞：findOne 返回已有 → 不重复 save
    mockLikeRepo.findOne.mockResolvedValue({ id: 1, postId: 1, userId: 5 });
    const res2 = await service.likePost(1, 5);
    expect(res2.likes).toBe(1);
  });

  it('unlikePost 取消点赞', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockLikeRepo.delete.mockResolvedValue({ affected: 1 });
    mockLikeRepo.count.mockResolvedValue(0);

    const res = await service.unlikePost(1, 5);
    expect(res.liked).toBe(false);
    expect(mockLikeRepo.delete).toHaveBeenCalled();
  });

  it('commentPost 评论帖子', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    const res = await service.commentPost(1, 5, '不错');
    expect(res.content).toBe('不错');
  });

  it('followUser 幂等：已关注 no-op', async () => {
    mockRepo.findOne.mockResolvedValue(null); // 未关注
    const res = await service.followUser(2, 1);
    expect(res.following).toBe(true);

    mockRepo.findOne.mockResolvedValue({ id: 1, followerId: 1, followeeId: 2 });
    const res2 = await service.followUser(2, 1);
    expect(res2.following).toBe(true);
  });

  it('followUser 不能关注自己', async () => {
    await expect(service.followUser(1, 1)).rejects.toThrow(ForbiddenException);
  });

  // ── 补充覆盖：update / listComments / unfollow ────────────────────────────

  it('update 合并 dto 并保存', async () => {
    const entity = { id: 1, userId: 5, title: '旧' };
    mockRepo.findOne.mockResolvedValue(entity);
    mockRepo.save.mockImplementation(async (e: any) => e);
    const result = await service.update(1, { title: '新' } as any, mockAbility(true));
    expect(result.title).toBe('新');
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('listComments 分页返回', async () => {
    mockRepo.findAndCount.mockResolvedValue([
      [{ id: 1, postId: 2, content: 'c1' }, { id: 2, postId: 2, content: 'c2' }],
      2,
    ]);
    const result = await service.listComments(2, 1, 20);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(mockRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: 2 }, skip: 0, take: 20 }),
    );
  });

  it('unfollowUser 删除关注并返回 following=false', async () => {
    mockRepo.delete.mockResolvedValue({ affected: 1 });
    const res = await service.unfollowUser(2, 1);
    expect(res).toEqual({ following: false });
    expect(mockRepo.delete).toHaveBeenCalledWith({ followerId: 1, followeeId: 2 });
  });
});
