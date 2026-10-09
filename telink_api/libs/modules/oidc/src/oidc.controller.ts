/**
 * OidcController - mounts the oidc-provider callback at /oidc.
 */
import { All, Controller, Next, Req, Res } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { OidcService } from './oidc.service';

@Controller('oidc')
export class OidcController {
  constructor(private readonly oidc: OidcService) {}

  @All('*')
  async handle(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    const url = req.url.replace(/^\/oidc/, '') || '/';
    const fakeReq = Object.assign(Object.create(req), req, { url });
    return this.oidc.callback(fakeReq, res, next);
  }
}