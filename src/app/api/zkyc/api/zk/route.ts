import { NextRequest } from "next/server";
import { handleZkycOptions, proxyZkycRequest } from "@/lib/zkyc-proxy";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = ["GET", "POST"];

export async function GET(request: NextRequest) {
  return proxyZkycRequest(request, "/api/zk", ALLOWED_METHODS);
}

export async function POST(request: NextRequest) {
  return proxyZkycRequest(request, "/api/zk", ALLOWED_METHODS);
}

export function OPTIONS() {
  return handleZkycOptions(ALLOWED_METHODS);
}
