import { Controller, Get } from '@nestjs/common';

@Controller('organizations')
export class OrganizationsController {
  @Get()
  getOrganizations() {
    return [
      { id: 'org_demo', name: 'Northstar Labs', plan: 'Growth', seats: 32 },
      { id: 'org_acme', name: 'Acme Studio', plan: 'Scale', seats: 18 },
    ];
  }
}
