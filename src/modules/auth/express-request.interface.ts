import { Request } from 'express';

export interface RequestWithUser extends Request {
  user: {
    id: number;
    google_id: string;
    email: string;
    first_name: string;
    last_name: string;
    picture?: string;
    jwtToken: string;
    refresh_token: string;
  };
}
