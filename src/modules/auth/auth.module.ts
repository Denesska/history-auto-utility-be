import {Module} from '@nestjs/common';
import {PassportModule} from '@nestjs/passport';
import {ConfigModule} from '@nestjs/config';
import {AuthService} from './auth.service';
import {GoogleStrategy} from './google.strategy';
import {AuthController} from './auth.controller';
import {PrismaService} from '../../prisma/prisma.service';
import {PrismaModule} from "../../prisma/prisma.module";

@Module({
    imports: [PassportModule, ConfigModule, PrismaModule],
    providers: [AuthService, GoogleStrategy, PrismaService],
    controllers: [AuthController],
})
export class AuthModule {
}
