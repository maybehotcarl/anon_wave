import { NextRequest } from "next/server";
import { handleZkycOptions, proxyZkycRequest } from "@/lib/zkyc-proxy";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = ["POST"];

export async function POST(request: NextRequest) {
  return proxyZkycRequest(
    request,
    "/api/auth/wallet/challenge",
    ALLOWED_METHODS,
  );
}

export function OPTIONS() {
  return handleZkycOptions(ALLOWED_METHODS);
}
