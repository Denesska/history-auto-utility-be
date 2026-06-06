import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';

const ALLOWED_ORIGINS = [
  'https://app.denhau.ro',
  'https://dev.denhau.ro',
  'http://localhost:4200',
];

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const origin = request.query.origin as string;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      response.cookie('login_origin', origin, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000,
        path: '/',
      });
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
