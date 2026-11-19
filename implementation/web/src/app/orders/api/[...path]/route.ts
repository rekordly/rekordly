import { handleShopperProxyRequest } from "@/lib/shopper-proxy";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return handleShopperProxyRequest(request, {
    pathSegments: path,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return handleShopperProxyRequest(request, {
    pathSegments: path,
  });
}
