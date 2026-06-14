import { NextRequest, NextResponse } from "next/server";

const ZKYC_ORIGIN = "https://zkyc.solutions";

const REQUEST_HEADERS_TO_FORWARD = ["accept", "authorization", "content-type"];

const RESPONSE_HEADERS_TO_FORWARD = [
  "cache-control",
  "content-type",
  "etag",
  "last-modified",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers();

  for (const header of REQUEST_HEADERS_TO_FORWARD) {
    const value = request.headers.get(header);

    if (value) {
      headers.set(header, value);
    }
  }

  return headers;
}

function buildResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers();

  for (const header of RESPONSE_HEADERS_TO_FORWARD) {
    const value = upstreamHeaders.get(header);

    if (value) {
      headers.set(header, value);
    }
  }

  return headers;
}

export async function proxyZkycRequest(
  request: NextRequest,
  upstreamPath: string,
  allowedMethods: string[],
) {
  if (!allowedMethods.includes(request.method)) {
    return NextResponse.json(
      { error: "Method not allowed." },
      {
        status: 405,
        headers: {
          Allow: allowedMethods.join(", "),
        },
      },
    );
  }

  const upstreamUrl = new URL(upstreamPath, ZKYC_ORIGIN);
  upstreamUrl.search = request.nextUrl.search;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildForwardHeaders(request),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: buildResponseHeaders(upstreamResponse.headers),
  });
}

export function handleZkycOptions(allowedMethods: string[]) {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: [...allowedMethods, "OPTIONS"].join(", "),
    },
  });
}
