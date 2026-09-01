// SPDX-License-Identifier: Apache-2.0

import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

describe('PostsController', () => {
  let controller: PostsController;
  let postsService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  const ability = {} as any;

  beforeEach(() => {
    postsService = Object.fromEntries(
      [
        'create', 'findAll', 'update', 'remove',
        'likePost', 'unlikePost', 'commentPost', 'listComments',
        'followUser', 'unfollowUser',
      ].map((m) => [m, jest.fn()]),
    );
    controller = new PostsController(postsService as unknown as PostsService);
  });

  it('帖子 CRUD 委托 service', async () => {
    const dto = { title: '动态' };
    postsService.create.mockResolvedValue({ id: 1 });
    postsService.findAll.mockResolvedValue([]);
    postsService.update.mockResolvedValue({ id: 1 });
    postsService.remove.mockResolvedValue(undefined);

    await expect(controller.create(dto as any, mockUser as any)).resolves.toEqual({ id: 1 });
    await expect(controller.findAll(mockUser as any)).resolves.toEqual([]);
    await expect(controller.update(1, dto as any, mockUser as any, ability)).resolves.toEqual({ id: 1 });
    await expect(controller.remove(1, mockUser as any, ability)).resolves.toBeNull();

    expect(postsService.create).toHaveBeenCalledWith(dto, 1);
    expect(postsService.findAll).toHaveBeenCalledWith(1);
    expect(postsService.update).toHaveBeenCalledWith(1, dto, ability);
    expect(postsService.remove).toHaveBeenCalledWith(1, ability);
  });

  it('点赞/取消点赞委托 service', () => {
    postsService.likePost.mockReturnValue({ liked: true });
    postsService.unlikePost.mockReturnValue({ liked: false });

    expect(controller.like(1, mockUser as any)).toEqual({ liked: true });
    expect(controller.unlike(1, mockUser as any)).toEqual({ liked: false });
    expect(postsService.likePost).toHaveBeenCalledWith(1, 1);
    expect(postsService.unlikePost).toHaveBeenCalledWith(1, 1);
  });

  it('评论/评论列表委托 service', () => {
    postsService.commentPost.mockReturnValue({ id: 1 });
    postsService.listComments.mockReturnValue({ items: [], total: 0 });

    expect(controller.comment(1, { content: '好文' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listComments(1, 1, 20)).toEqual({ items: [], total: 0 });
    expect(postsService.commentPost).toHaveBeenCalledWith(1, 1, '好文');
    expect(postsService.listComments).toHaveBeenCalledWith(1, 1, 20);
  });

  it('关注/取消关注委托 service', () => {
    postsService.followUser.mockReturnValue({ following: true });
    postsService.unfollowUser.mockReturnValue({ following: false });

    expect(controller.follow(9, mockUser as any)).toEqual({ following: true });
    expect(controller.unfollow(9, mockUser as any)).toEqual({ following: false });
    expect(postsService.followUser).toHaveBeenCalledWith(9, 1);
    expect(postsService.unfollowUser).toHaveBeenCalledWith(9, 1);
  });
});
