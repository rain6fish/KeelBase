import { OrgController } from './org.controller';
import { OrgService } from './org.service';

describe('OrgController', () => {
  let controller: OrgController;
  let orgService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  const methods = [
    'createOrganization', 'findAllOrganizations', 'findOrganization', 'updateOrganization',
    'removeOrganization', 'createDepartment', 'listDepartments', 'updateDepartment',
    'removeDepartment', 'listMembers', 'addMember', 'updateMember', 'removeMember',
    'createInvite', 'listInvites', 'removeInvite', 'submitRequest', 'listMyRequests',
    'getMyOrg', 'getMyTree', 'listMyMembers',
  ];

  beforeEach(() => {
    orgService = Object.fromEntries(methods.map((m) => [m, jest.fn()]));
    controller = new OrgController(orgService as unknown as OrgService);
  });

  it('组织 CRUD 委托 service', async () => {
    orgService.createOrganization.mockReturnValue({ id: 1 });
    orgService.findAllOrganizations.mockReturnValue({ items: [], total: 0 });
    orgService.findOrganization.mockReturnValue({ id: 1 });
    orgService.updateOrganization.mockReturnValue({ id: 1 });
    orgService.removeOrganization.mockResolvedValue(undefined);

    expect(controller.createOrganization({ name: 'Acme' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listOrganizations(1, 20, 'acme')).toEqual({ items: [], total: 0 });
    expect(controller.getOrganization(1)).toEqual({ id: 1 });
    expect(controller.updateOrganization(1, { name: 'X' } as any)).toEqual({ id: 1 });
    await expect(controller.removeOrganization(1)).resolves.toBeNull();

    expect(orgService.createOrganization).toHaveBeenCalledWith({ name: 'Acme' }, 1);
    expect(orgService.findAllOrganizations).toHaveBeenCalledWith(1, 20, 'acme');
    expect(orgService.removeOrganization).toHaveBeenCalledWith(1);
  });

  it('部门 CRUD 委托 service', async () => {
    orgService.createDepartment.mockReturnValue({ id: 1 });
    orgService.listDepartments.mockReturnValue([]);
    orgService.updateDepartment.mockReturnValue({ id: 1 });
    orgService.removeDepartment.mockResolvedValue(undefined);

    expect(controller.createDepartment(2, { name: '技术部' } as any)).toEqual({ id: 1 });
    expect(controller.listDepartments(2)).toEqual([]);
    expect(controller.updateDepartment(3, { name: '研发' } as any)).toEqual({ id: 1 });
    await expect(controller.removeDepartment(3)).resolves.toBeNull();

    expect(orgService.createDepartment).toHaveBeenCalledWith(2, { name: '技术部' });
    expect(orgService.updateDepartment).toHaveBeenCalledWith(3, { name: '研发' });
  });

  it('成员管理委托 service', async () => {
    orgService.listMembers.mockReturnValue({ items: [], total: 0 });
    orgService.addMember.mockReturnValue({ id: 1 });
    orgService.updateMember.mockReturnValue({ id: 1 });
    orgService.removeMember.mockResolvedValue(undefined);

    expect(controller.listMembers(2, 1, 20, 'k', '3')).toEqual({ items: [], total: 0 });
    expect(controller.addMember(2, { userId: 5 } as any)).toEqual({ id: 1 });
    expect(controller.updateMember(4, { role: 'admin' } as any)).toEqual({ id: 1 });
    await expect(controller.removeMember(4)).resolves.toBeNull();

    expect(orgService.listMembers).toHaveBeenCalledWith(2, 1, 20, 'k', 3);
    expect(orgService.addMember).toHaveBeenCalledWith(2, { userId: 5 });
    expect(orgService.updateMember).toHaveBeenCalledWith(4, { role: 'admin' });
  });

  it('邀请管理委托 service', async () => {
    orgService.createInvite.mockReturnValue({ id: 1, code: 'XYZ' });
    orgService.listInvites.mockReturnValue([]);
    orgService.removeInvite.mockResolvedValue(undefined);

    expect(controller.createInvite(2, { maxUses: 5 } as any, mockUser as any)).toEqual({ id: 1, code: 'XYZ' });
    expect(controller.listInvites(2)).toEqual([]);
    await expect(controller.removeInvite(6)).resolves.toBeNull();

    expect(orgService.createInvite).toHaveBeenCalledWith(2, { maxUses: 5 }, 1);
  });

  it('申请与我的组织委托 service', () => {
    orgService.submitRequest.mockReturnValue({ id: 1 });
    orgService.listMyRequests.mockReturnValue([]);
    orgService.getMyOrg.mockReturnValue({ id: 1 });
    orgService.getMyTree.mockReturnValue([]);
    orgService.listMyMembers.mockReturnValue([]);

    expect(controller.submitRequest({ orgId: 1 } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listMyRequests(mockUser as any)).toEqual([]);
    expect(controller.getMyOrg(mockUser as any)).toEqual({ id: 1 });
    expect(controller.getMyTree(mockUser as any)).toEqual([]);
    expect(controller.listMyMembers(mockUser as any)).toEqual([]);

    expect(orgService.submitRequest).toHaveBeenCalledWith(1, { orgId: 1 });
    expect(orgService.getMyOrg).toHaveBeenCalledWith(1);
  });
});
