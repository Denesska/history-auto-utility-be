import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {RequestWithUser} from "./express-request.interface";

@Controller('auth')
export class AuthController {
    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth(@Req() req: RequestWithUser) {
        // Guard redirects to Google login page
    }

    @Get('google/redirect')
    @UseGuards(AuthGuard('google'))
    googleAuthRedirect(@Req() req: RequestWithUser) {
        return {
            message: 'User information from Google',
            user: req.user
        };
    }
}
