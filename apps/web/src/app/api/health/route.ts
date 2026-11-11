import { NextResponse } from 'next/server';
import { healthReport } from '@playbill/core/health';
import { isSetupComplete } from '@playbill/core/setup';
import { appInfo, db } from '@/lib/server';

export const dynamic = 'force-dynamic';

/**
 * Public liveness + version. Deploy checks compare `revision` (web) and `worker.revision`.
 * 200 when the worker is beating, 503 otherwise. Reveals nothing sensitive.
 */
export async function GET() {
  try {
    const report = healthReport(db(), appInfo(), isSetupComplete(db()));
    return NextResponse.json(report, {
      status: report.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'down', ...appInfo(), error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
