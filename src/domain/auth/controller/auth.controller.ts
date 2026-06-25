import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../service/auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from '../decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register a new user. Returns 204 No Content on success.' })
  @ApiBody({ type: SignupDto })
  @ApiResponse({ status: 204, description: 'User created.' })
  @ApiResponse({ status: 400, description: 'Validation failed or email already registered.' })
  signup(@Body() dto: SignupDto): Promise<void> {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate and receive a JWT access token.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Authentication succeeded.', type: LoginResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validacion fallida (email formato invalido, password vacio).',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials (email not found, wrong password, or account disabled).',
  })
  login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(dto);
  }
}
