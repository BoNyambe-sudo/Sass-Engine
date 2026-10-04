import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  getUsers() {
    return [
      {
        id: 'u1',
        name: 'Maya Chen',
        email: 'maya@northstarlabs.io',
        role: 'ADMIN',
      },
      {
        id: 'u2',
        name: 'Ari Patel',
        email: 'ari@northstarlabs.io',
        role: 'MANAGER',
      },
      {
        id: 'u3',
        name: 'Leah Turner',
        email: 'leah@northstarlabs.io',
        role: 'VIEWER',
      },
    ];
  }
}
