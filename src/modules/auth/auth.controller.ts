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
  private readonly cookieConfig: any;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.cookieConfig = {
      httpOnly: true,
      secure: true, // Enable for HTTPS
      sameSite: 'none', // Required for cross-domain
      path: '/',
      domain: 'api.denhau.ro',  // Just the API domain
      maxAge: 24 * 60 * 60 * 1000,
    };
  }

  // Before setting a new token, explicitly clear the old one
  private clearExistingToken(res: Response): void {
    console.log('Clearing cookie...');
    res.clearCookie('access_token', this.cookieConfig);
  }

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

    res.cookie('access_token', accessToken, this.cookieConfig);

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
    console.log('Starting google redirect...');
    const user = req.user;

    this.clearExistingToken(res); // Clear existing token first

    const accessToken = this.authService.generateAccessToken(user);
    const refreshToken = this.authService.generateRefreshToken(user.google_id);

    // Salvează `refresh_token` în baza de date
    await this.authService.saveRefreshToken(user.google_id, refreshToken);

    // Setează `access_token` în cookie
    console.log('Setting new cookie...');
    res.cookie('access_token', accessToken, this.cookieConfig);

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
    res.cookie('access_token', newAccessToken, this.cookieConfig);

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
      ...this.cookieConfig,
      maxAge: 0 // Override maxAge for clearing the cookie
    });

    res.status(200).json({ message: 'Logout successful' });
  }
}

//access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM5Njk2NDU2LCJleHAiOjE3Mzk2OTczNTZ9.TqguKI9HF2rNqMfQktutmTENHKTmW4emrWVOa8xG8uY;
//access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM5NzE1Mjg1LCJleHAiOjE3Mzk3MTYxODV9.Sbh_lGR2WbVKW97wMrn6KAUeNLbnGo0oVc4bA1sPHmU


// access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM5Njk2NDU2LCJleHAiOjE3Mzk2OTczNTZ9.TqguKI9HF2rNqMfQktutmTENHKTmW4emrWVOa8xG8uY;
// access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM5NzE1MzYxLCJleHAiOjE3Mzk3MTYyNjF9.i8Iz0GT7__MRZivBqi4_is9V8gu052Q2LUqBkS8qhf8

//access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM5Njk2NDU2LCJleHAiOjE3Mzk2OTczNTZ9.TqguKI9HF2rNqMfQktutmTENHKTmW4emrWVOa8xG8uY;
//access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMDkyMjQ1OTg2ODQ2NTI1NjYiLCJlbWFpbCI6ImRlbmlzLmdhbmR6aWlAZ21haWwuY29tIiwiaWF0IjoxNzM5NzE1ODA0LCJleHAiOjE3Mzk3MTY3MDR9.2ieW21WYDvQPSorB3obCvl-4MM8FTYc3m-9dNnFO8_U