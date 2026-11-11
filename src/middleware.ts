import { NextResponse, type NextRequest } from 'next/server';

// In AWS, CloudFront adds a secret header to every request. Requests that skip CloudFront
// and call the Lambda URL directly don't have it and are refused. Locally ORIGIN_VERIFY is empty.
export function middleware(req: NextRequest) {
  const secret = process.env.ORIGIN_VERIFY;
  if (secret && req.headers.get('x-origin-verify') !== secret) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|favicon.ico|api/health).*)'] };
