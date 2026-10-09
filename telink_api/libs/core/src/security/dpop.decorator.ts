import { SetMetadata } from '@nestjs/common';

/**
 * @DpopExempt() - mark a route as exempt from DPoP enforcement.
 *
 * Used on routes that must work before the client has registered its
 * DPoP key, e.g. /auth/dpop/register itself.
 */
export const DPOP_EXEMPT_KEY = 'dpop_exempt';
export const DpopExempt = () => SetMetadata(DPOP_EXEMPT_KEY, true);