import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
    async validateUser(user: any): Promise<any> {
        // Todo implement logic to validate and save the user
        return user;
    }
}
