import { getSalesAiProvider } from '@/lib/sales-analytics/ai-provider';
import {
  getFirebaseUserRole,
  verifyFirebaseIdToken,
} from '@/lib/server/firebase-admin';
import { handleSalesSummaryRequest } from '@/lib/server/sales-summary-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleSalesSummaryRequest(req, {
    verifyIdToken: verifyFirebaseIdToken,
    getUserRole: getFirebaseUserRole,
    provider: getSalesAiProvider(),
  });
}
