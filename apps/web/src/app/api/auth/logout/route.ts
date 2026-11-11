import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, destroySession } from '@playbill/core/auth';
import { db } from '@/lib/server';

export async function POST(req: NextRequest) {
  destroySession(db(), req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
