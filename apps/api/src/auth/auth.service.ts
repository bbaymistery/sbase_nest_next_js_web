import { ConflictException, Injectable, UnauthorizedException, } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import slugify from 'slugify';
import { eq } from 'drizzle-orm';
import { COOKIE_KEYS } from '@sbase/constants';
import { DrizzleService } from '../db/drizzle.service.js';
import { users, organizations, orgMembers } from '../db/schema/index.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from '@sbase/types';

@Injectable()
export class AuthService {
  constructor(
    private drizzle: DrizzleService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) { }

  // Cookie helpers
  setTokenCookies(res: Response, tokens: { accessToken: string; refreshToken: string },) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    res.cookie(COOKIE_KEYS.ACCESS_TOKEN, tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie(COOKIE_KEYS.REFRESH_TOKEN, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  clearTokenCookies(res: Response) {
    res.clearCookie(COOKIE_KEYS.ACCESS_TOKEN);
    res.clearCookie(COOKIE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Generates a URL-safe, globally unique slug for a newly created organization.
   *
   * 1. Sanitizes the user/org name (converts to lowercase, removes special characters).
   * 2. Appends a cryptographically secure random hexadecimal suffix to guarantee
   *    uniqueness and prevent database collisions on the `organizations.slug` UNIQUE constraint.
   *
   * @param name - The display name of the user or organization.
   * @returns A clean, collision-free slug (e.g., "john-doe-org-a1b2c3").
   */
  private generateOrgSlug(name: string): string {
    // Step 1: Sanitize and format the name into a URL-friendly, lowercase string
    const base = slugify(`${name}-org`, { lower: true, strict: true });
    // Step 2: Generate a random 6-character hex suffix to ensure database uniqueness
    const suffix = randomBytes(3).toString('hex');
    // Step 3: Combine the base slug with the unique suffix
    return `${base}-${suffix}`;
  }

  // JWT signing
  private signTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    //we wrote manually  JWT_ACCESS_SECRET beacuse it will make easy for us testing
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Registers a new user, provisions their default personal organization,
   * assigns them as org admin, and generates initial JWT tokens.
   */
  // Email + Password
  async register(dto: RegisterDto) {
    // 1. Check if email is already registered
    const existing = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existing.length > 0) throw new ConflictException('Email already in use');

    // 2. Hash password with bcrypt (salt rounds: 12)
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // 3. Insert new user and retrieve the created record
    //Yeni kullanıcı ekle ve oluşturulan kaydı getir
    const [user] = await this.drizzle.db
      .insert(users)
      .values({ email: dto.email, name: dto.name, passwordHash })
      .returning();

    // 4. Create default personal organization with a unique slug
    const [org] = await this.drizzle.db
      .insert(organizations)
      .values({
        name: `${dto.name}'s Org`,
        slug: this.generateOrgSlug(dto.name),
      })
      .returning();

    // 5. Link user to organization as 'admin' in junction table
    await this.drizzle.db.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: 'admin', });

    // 6. Issue and return access & refresh token pair
    //Erişim ve yenileme belirteci çiftini verin ve geri döndürün.
    return this.signTokens(user.id, user.email);
  }
  async login(dto: LoginDto) {
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    return this.signTokens(user.id, user.email);
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(
        refreshToken,
        { secret: this.configService.get('JWT_REFRESH_SECRET'), }
      );

      const [user] = await this.drizzle.db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!user) throw new UnauthorizedException();

      return this.signTokens(user.id, user.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Handles OAuth authentication (Google, GitHub, etc.) using a "Find or Create" strategy:
   * - If the user exists: logs them in directly.
   * - If the user is new: automatically provisions their user record, default organization,
   *   and admin membership, then issues authentication tokens.
   * handleOAuthUser() (Google kullanıcıyı bize geri atar)=> (Kullanıcıyı Veritabanına Kaydeder veya Giriş Yaptırır)
   */
  // OAuth upsert helpers
  //! Step 3 >his.handleOAuthUser(...) fonksiyonunu çağırıp kullanıcıyı veritabanına kaydeder!
  async handleOAuthUser(profile: { email: string; name: string; avatarUrl: string | null; }) {
    // 1. Check if the user already exists in the database
    let [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    // 2. If user does not exist (first-time OAuth login), register them
    if (!user) {
      // 2a. Insert new user record with profile data from OAuth provider (no password required)
      const [newUser] = await this.drizzle.db
        .insert(users)
        .values({ email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl, })
        .returning();

      user = newUser;

      // 2b. Automatically create their default personal organization
      const [org] = await this.drizzle.db
        .insert(organizations)
        .values({ name: `${profile.name}'s Org`, slug: this.generateOrgSlug(profile.name), })
        .returning();

      // 2c. Make the new user the 'admin' of their newly created organization
      await this.drizzle.db.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: 'admin', });
    }

    // 3. Issue and return access & refresh JWT tokens for the authenticated user
    return this.signTokens(user.id, user.email);
  }

  /**
   * Generates the Google OAuth 2.0 authorization URL.
   * Redirects the user to Google's consent screen requesting their email and profile info.
   * ! Step 1 >getGoogleAuthUrl() ] ───(Kullanıcıyı Google'a Gönderir)───> [ Google Ekranı ]
   */
  getGoogleAuthUrl() {
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('GOOGLE_CLIENT_ID')!,
      redirect_uri: this.configService.get<string>('GOOGLE_CALLBACK_URL')!,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  /**
   * Handles the Google OAuth callback:
   * 1. Exchanges the temporary authorization code for a Google access token.
   * 2. Fetches user profile information (email, name, picture) using the access token.
   * 3. Delegates to `handleOAuthUser` to upsert(ekle) the user and return app JWT tokens.
   * ! Step 2 >Google kullanıcıya onaylattı ve elimize geçici bir onay kodu (code) verip geri yolladı.
   * !Bu Fonksiyon=> O geçici kodu alıp Google ile konuşur ve kullanıcının bilgilerini çeker!
   */
  async handleGoogleCallback(code: string) {
    // 1. Exchange temporary authorization code for Google's access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.configService.get<string>('GOOGLE_CLIENT_ID')!,
        client_secret: this.configService.get<string>('GOOGLE_CLIENT_SECRET')!,
        redirect_uri: this.configService.get<string>('GOOGLE_CALLBACK_URL')!,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token: string };
    // 2. Fetch authenticated user's profile details from Google's UserInfo API
    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    const profile = (await profileRes.json()) as { email: string; name: string; picture: string | null; };
    // 3. Upsert user in database and return our application's JWT auth tokens
    return this.handleOAuthUser({ email: profile.email, name: profile.name, avatarUrl: profile.picture ?? null, });
  }


  /**
 * Generates the GitHub OAuth authorization URL.
 * Requests basic user profile information and verified email addresses.
 */
  getGithubAuthUrl() {
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('GITHUB_CLIENT_ID')!,
      redirect_uri: this.configService.get<string>('GITHUB_CALLBACK_URL')!,
      scope: 'read:user user:email',
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
 * Handles the GitHub OAuth callback:
 * 1. Exchanges the temporary code for a GitHub access token.
 * 2. Fetches user profile data from GitHub's REST API.
 * 3. Handles private emails by querying the `/user/emails` endpoint if needed.
 * 4. Upserts user in the database and returns app JWT tokens.
 */
  async handleGithubCallback(code: string) {
    // 1. Exchange temporary authorization code for GitHub access token
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', },
        body: JSON.stringify({
          client_id: this.configService.get<string>('GITHUB_CLIENT_ID'),
          client_secret: this.configService.get<string>('GITHUB_CLIENT_SECRET'),
          code,
          redirect_uri: this.configService.get<string>('GITHUB_CALLBACK_URL'),
        }),
      },
    );

    const tokenData = (await tokenRes.json()) as { access_token: string };
    // 2. Fetch user's basic profile details from GitHub API
    const profileRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const profile = (await profileRes.json()) as { email: string | null; name: string | null; login: string; avatar_url: string | null; };

    // 3. GitHub quirk: If user's email is set to private, query the /user/emails endpoint
    let email = profile.email;
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const emails = (await emailRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      // Pick the primary verified email address
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
    // 4. Upsert user in database (fallback to username if display name is null) and return tokens
    return this.handleOAuthUser({
      email: email!,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url ?? null,
    });
  }
}
