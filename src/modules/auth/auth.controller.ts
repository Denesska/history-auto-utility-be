import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth') // Swagger category for authentication-related endpoints
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Login user and set access token in HTTP-only cookie',
    description:
      'Authenticates a user via Google and stores the access token in a secure HTTP-only cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in, access token set in cookie.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized access.',
  })
  async login(@Req() req, @Res() res: Response): Promise<void> {
    const user = req.user; // Preluat din Passport.js

    const accessToken = this.authService.generateAccessToken(user);

    res.cookie('access_token', accessToken, {
      httpOnly: true, // Protejează cookie-ul împotriva accesului din JavaScript
      secure: true, // `false` în dezvoltare, `true` în producție (HTTPS)
      sameSite: 'none', // Permite trimiterea cookie-urilor în majoritatea cazurilor
      domain: '.denhau.ro', // Domeniul pentru care este setat cookie-ul
      path: '/',
    });

    res.status(200).json({ message: 'Login successful' });
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Handle Google OAuth redirection',
    description:
      'Processes the Google authentication response and sets access token in HTTP-only cookie.',
  })
  @ApiResponse({
    status: 302,
    description: 'User is authenticated and redirected to the frontend.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Google authentication failed.',
  })
  async googleAuthRedirect(@Req() req, @Res() res: Response): Promise<void> {
    const user = req.user;

    // Generează `access_token` și `refresh_token`
    const accessToken = this.authService.generateAccessToken(user);
    const refreshToken = this.authService.generateRefreshToken(user.google_id);

    // Salvează `refresh_token` în baza de date
    await this.authService.saveRefreshToken(user.google_id, refreshToken);

    // Setează `access_token` în cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true, // Protejează cookie-ul împotriva accesului din JavaScript
      secure: true, // `false` în dezvoltare, `true` în producție (HTTPS)
      sameSite: 'none', // Permite trimiterea cookie-urilor în majoritatea cazurilor
      domain: '.denhau.ro', // Domeniul pentru care este setat cookie-ul
      path: '/',
    });

    //eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM4Mjc2NjM5LCJleHAiOjE3MzgyNzc1Mzl9.WzOjneccE5yRCRkOFjVqqs2XoUUPJ9aKF8ylTnNGvdc

    // Redirecționează utilizatorul către frontend fără a expune tokenul
    const feBaseUrl = process.env.FE_BASE_URL || 'http://localhost:4200';
    res.redirect(`${feBaseUrl}/main/cars`);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token using refresh token',
    description: 'Generates a new access token if the refresh token is valid.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token generated successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Refresh token missing or invalid.',
  })
  async refreshAccessToken(@Req() req, @Res() res: Response): Promise<void> {
    const access_token = req.cookies.access_token;
    const user = this.authService.validateAndDecodeToken(access_token);

    // Obține refresh_token-ul utilizatorului din baza de date
    const refreshToken = await this.authService.getRefreshTokenByUserId(
      user.google_id,
    );

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    // Validează refresh_token-ul
    const isValid = this.authService.validateRefreshToken(refreshToken);

    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generează un nou access_token
    const newAccessToken = this.authService.generateAccessToken(user);

    // Setează noul access_token în cookie
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: true, // În dezvoltare trebuie `false`, în producție `true`
      sameSite: 'none',
      domain: '.denhau.ro',
      path: '/',
    });

    res.status(200).json({ message: 'Token refreshed successfully' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user details from access token',
    description:
      'Validates the access token stored in HTTP-only cookie and returns user information.',
  })
  @ApiResponse({
    status: 200,
    description: 'User details successfully retrieved.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing access token.',
  })
  async getProfile(@Req() req): Promise<any> {
    return req.user; // Passport.js injectează user-ul în req.user dacă tokenul este valid
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Logout user and clear authentication tokens',
    description:
      'Removes access token from cookies and invalidates refresh token in the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No active session found.',
  })
  async logout(@Req() req, @Res() res: Response): Promise<void> {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User is not authenticated');
    }

    // Șterge refresh_token-ul din baza de date
    await this.authService.removeRefreshToken(userId);

    // Șterge access_token-ul din cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: true, // În producție trebuie să fie `true`
      sameSite: 'none',
      domain: '.denhau.ro',
      path: '/',
    });

    res.status(200).json({ message: 'Logout successful' });
  }

  /*@Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Handles the Google OAuth redirect',
    description:
      'Processes the response from Google and returns an access token for authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns an access token and refresh token.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects the user back to the frontend with a JWT token.',
  })
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const user = req.user;
    const payload = {
      id: user.id,
      google_id: user.google_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      picture: user.picture,
      refresh_token: user.refresh_token,
    };
    const jwtToken = this.authService.generateJwtToken(payload);
    const refreshToken = user.refresh_token;

    const feBaseUrl = this.configService.get<string>('FE_BASE_URL');
    const redirectUrl = `${feBaseUrl}/auth/token?token=${jwtToken}&refresh=${refreshToken}`;

    if (req.headers['accept']?.includes('application/json')) {
      return res.status(200).json({ accessToken: jwtToken, refreshToken });
    }

    return res.redirect(redirectUrl);
  }*/

  /*@Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh the access token',
    description:
      'Generates a new access token using the refresh token stored on the backend. The user is identified via the access token in the Authorization header.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated a new access token.',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          description: 'The newly generated access token.',
        },
        refreshToken: {
          type: 'string',
          description: 'The newly generated refresh token (optional).',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Authorization header missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Refresh token is invalid or expired.',
  })
  async refreshToken(@Req() req: Request): Promise<any> {
    // try {
      // Extract the token from the Authorization header
      const bearerToken = req.headers['authorization'];
      if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
        throw new HttpException(
          'Authorization header missing',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const userId = this.authService.validateAndDecodeToken(bearerToken);

      // Refresh the tokens
      const refreshToken = await this.authService.getRefreshTokenByUserId(userId);

      // Refresh the tokens
      const { accessToken, newRefreshToken } =
        await this.authService.refreshTokens(refreshToken);

      return { accessToken };
    /!*} catch (error) {
      console.error('Error refreshing token:', error.message);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Refresh token expired or invalid',
        HttpStatus.FORBIDDEN,
      );
    }*!/
  }*/
}
