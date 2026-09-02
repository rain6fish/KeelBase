// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { SecurityShowcaseController } from './security-showcase.controller';
import { SecurityShowcaseService } from './security-showcase.service';

describe('SecurityShowcaseController', () => {
  let controller: SecurityShowcaseController;
  const service = {
    listScenarios: jest.fn().mockReturnValue([{ id: 'injection' }]),
    runScenario: jest.fn().mockResolvedValue({ scenarioId: 'injection', outcome: 'refused' }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SecurityShowcaseController],
      providers: [{ provide: SecurityShowcaseService, useValue: service }],
    }).compile();
    controller = module.get(SecurityShowcaseController);
  });

  it('GET scenarios 委托 service.listScenarios', () => {
    expect(controller.listScenarios()).toEqual([{ id: 'injection' }]);
    expect(service.listScenarios).toHaveBeenCalled();
  });

  it('POST run/:id 委托 service.runScenario', async () => {
    await expect(controller.runScenario('injection')).resolves.toEqual({
      scenarioId: 'injection',
      outcome: 'refused',
    });
    expect(service.runScenario).toHaveBeenCalledWith('injection');
  });
});
