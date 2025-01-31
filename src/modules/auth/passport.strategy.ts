import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.access_token,
      ]), // Citește din cookie
      secretOrKey: process.env.JWT_ACCESS_SECRET, // Secretul JWT
    });
  }

  async validate(payload: any) {
    return { id: payload.sub, email: payload.email }; // Returnează user-ul validat
  }
}
