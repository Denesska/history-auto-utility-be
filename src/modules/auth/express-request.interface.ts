import { Request } from 'express';

export interface RequestWithUser extends Request {
    // todo update later ro some more appropriate type to avoid any.
    user?: any;
}
