// SPDX-License-Identifier: Apache-2.0

import { deriveBusinessEvent } from './business-event';

describe('deriveBusinessEvent (A-1 业务事件归一化)', () => {
  it('maps CRM customer create → CustomerCreated', () => {
    expect(deriveBusinessEvent('/api/v1/crm/customers', 'POST')).toBe('CustomerCreated');
  });

  it('maps CRM customer patch → CustomerUpdated', () => {
    expect(deriveBusinessEvent('/api/v1/crm/customers/3', 'PATCH')).toBe('CustomerUpdated');
  });

  it('maps CRM task create → FollowupTaskCreated', () => {
    expect(deriveBusinessEvent('/api/v1/crm/tasks', 'POST')).toBe('FollowupTaskCreated');
  });

  it('maps generic module delete → TodoDeleted', () => {
    expect(deriveBusinessEvent('/api/v1/todos/5', 'DELETE')).toBe('TodoDeleted');
  });

  it('maps org invite → OrganizationInviteCreated', () => {
    expect(deriveBusinessEvent('/api/v1/org/organizations/2/invites', 'POST')).toBe(
      'OrganizationInviteCreated',
    );
  });

  it('returns null for non-business paths (auth/ai/upload)', () => {
    expect(deriveBusinessEvent('/api/v1/auth/login', 'POST')).toBeNull();
    expect(deriveBusinessEvent('/api/v1/ai/chat', 'POST')).toBeNull();
    expect(deriveBusinessEvent('/api/v1/upload', 'POST')).toBeNull();
  });

  it('returns null for GET (no write action)', () => {
    expect(deriveBusinessEvent('/api/v1/crm/customers', 'GET')).toBeNull();
  });
});
