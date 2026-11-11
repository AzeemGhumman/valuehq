// Used by the Lambda Web Adapter to know the server has started.
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ ok: true });
}
